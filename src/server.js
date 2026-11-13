import { fileURLToPath, pathToFileURL } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { RootsListChangedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { askSystemOne } from "./client.js";
import { formatAnswers } from "./format.js";
import { resolveProjectConfig } from "./project-config.js";
import {
  DEFAULT_WORKFLOWS,
  buildCheckQuestions,
  buildGateQuestions,
  buildRouteQuestions,
  computeFinalRisk,
  computeTouchesInvariants,
  mergeAdditions,
} from "./questions.js";
import { readSettings } from "./settings.js";

export const SERVER_NAME = "systemone";
export const SERVER_VERSION = "1.0.1";

const questionsSchema = z.record(
  z.string().min(1),
  z.object({
    type: z.enum(["choice", "noul", "score"]),
    instructions: z.string().min(1),
    criteria: z.union([z.record(z.string()), z.array(z.string()).min(2).max(10)]),
  }),
);

const invariantsSchema = z
  .record(z.string())
  .describe(
    "Extra invariants for this call, added to the project's .systemone.json: {\"id\": \"description\"}. Ids must not collide with the project's.",
  );

const riskRulesSchema = z
  .record(
    z
      .object({
        description: z.string(),
        level: z.enum(["needs_confirm", "dangerous"]),
      })
      .strict(),
  )
  .describe(
    "Extra risk rules for this call, added to the project's .systemone.json: {\"id\": {\"description\": \"...\", \"level\": \"needs_confirm\"|\"dangerous\"}}. Rules can only raise the risk.",
  );

function validateDecideQuestions(questions) {
  for (const [key, question] of Object.entries(questions)) {
    if (question.type === "choice") {
      if (!Array.isArray(question.criteria) && Object.keys(question.criteria).length >= 2) {
        continue;
      }
      throw new Error(`invalid question ${key}: choice criteria must be a record of 2-26 named options`);
    }
    if (question.type === "noul") {
      const keys = Object.keys(question.criteria);
      if (keys.includes("false") && keys.includes("true")) {
        continue;
      }
      throw new Error(`invalid question ${key}: noul criteria must describe both "false" and "true"`);
    }
    if (question.type === "score") {
      if (Array.isArray(question.criteria) && question.criteria.length >= 2 && question.criteria.length <= 10) {
        continue;
      }
      throw new Error(`invalid question ${key}: score criteria must be an array of 2-10 descriptions ordered lowest to highest`);
    }
  }
}

/** Keep only the answers to questions this request asked; anything else is ignored. */
function pickAnswers(answers, keys) {
  return Object.fromEntries(keys.filter((key) => key in answers).map((key) => [key, answers[key]]));
}

function textResult(text) {
  return { content: [{ type: "text", text }] };
}

/**
 * Build the MCP server. `env` and `cwd` are injectable for tests; settings and the
 * project config are resolved on every tool call so edits apply without a restart.
 */
export function createServer({ env = process.env, cwd = process.cwd() } = {}) {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  // Roots are listed once and cached until the client sends roots/list_changed.
  // A failed listing is not cached, so the next call retries.
  let cachedRoots = null;
  server.server.setNotificationHandler(RootsListChangedNotificationSchema, async () => {
    cachedRoots = null;
  });

  async function clientRoots() {
    if (!server.server.getClientCapabilities()?.roots) {
      return [];
    }
    if (cachedRoots) {
      return cachedRoots;
    }
    try {
      const { roots } = await server.server.listRoots();
      cachedRoots = roots
        .filter((root) => root.uri.startsWith("file://"))
        .map((root) => fileURLToPath(root.uri));
      return cachedRoots;
    } catch {
      return [];
    }
  }

  async function context() {
    const settings = readSettings(env);
    const project = resolveProjectConfig({ env, roots: await clientRoots(), cwd });
    return { settings, project };
  }

  server.registerTool(
    "route",
    {
      description:
        "Classify a work request into one of the project's workflows. Use when a request could be handled several ways. Returns the workflow, whether the request needs clarification first, and an urgency score. Workflows come from the project's .systemone.json (or built-in defaults); for a one-off set of options use decide.",
      inputSchema: z
        .object({
          request: z.string().trim().min(1).describe("The request as received from the user"),
          context: z.string().optional().describe("Optional surrounding context (current branch, session goal, recent findings)"),
        })
        .strict(),
    },
    async ({ request, context: extra }) => {
      const { settings, project } = await context();
      const state = { request };
      if (extra !== undefined) {
        state.context = extra;
      }
      const answers = await askSystemOne(
        settings,
        settings.model,
        state,
        buildRouteQuestions(project.workflows ?? DEFAULT_WORKFLOWS),
      );
      return textResult(formatAnswers(answers, { configPath: project.path }));
    },
  );

  server.registerTool(
    "gate",
    {
      description:
        "Judge whether a plan, design, merge request or diff is ready to implement or merge. Returns readiness, a verdict (approve/changes/reject) and, when the project or the caller defines invariants, which ones the change touches.",
      inputSchema: z
        .object({
          artifact: z.string().trim().min(1).describe("The plan, design, or merge request text to judge"),
          kind: z.enum(["plan", "design", "mr", "diff"]).optional().describe("What kind of artifact this is"),
          invariants: invariantsSchema.optional(),
        })
        .strict(),
    },
    async ({ artifact, kind, invariants }) => {
      const { settings, project } = await context();
      const active = mergeAdditions("invariants", project.invariants, invariants);
      const state = { artifact };
      if (kind !== undefined) {
        state.kind = kind;
      }
      const answers = await askSystemOne(settings, settings.model, state, buildGateQuestions(active));
      const touches = computeTouchesInvariants(answers, active);
      const computed = touches ? { touches_invariants: touches } : {};
      return textResult(formatAnswers(answers, { computed, configPath: project.path }));
    },
  );

  server.registerTool(
    "check",
    {
      description:
        "Rate the risk of a shell command before running it: safe, needs_confirm or dangerous. Use before commands that change files, history or remote state. Project or caller risk rules can raise the rating, never lower it; act on final_risk. Uses the fast model.",
      inputSchema: z
        .object({
          command: z.string().trim().min(1).describe("The shell command to assess"),
          context: z.string().optional().describe("Optional context: repository, intent, working directory"),
          risk_rules: riskRulesSchema.optional(),
        })
        .strict(),
    },
    async ({ command, context: extra, risk_rules: riskRules }) => {
      const { settings, project } = await context();
      const active = mergeAdditions("risk_rules", project.riskRules, riskRules);
      const state = { command };
      if (extra !== undefined) {
        state.context = extra;
      }
      // The base risk question goes in its own request so rule text from the project file or
      // the caller can never influence it; rules can then only raise the final rating.
      const { risk: baseQuestion, ...ruleQuestions } = buildCheckQuestions(active);
      const ruleKeys = Object.keys(ruleQuestions);
      const [baseAnswers, ruleAnswers] = await Promise.all([
        askSystemOne(settings, settings.fastModel, state, { risk: baseQuestion }),
        ruleKeys.length > 0 ? askSystemOne(settings, settings.fastModel, state, ruleQuestions) : {},
      ]);
      const answers = { ...pickAnswers(baseAnswers, ["risk"]), ...pickAnswers(ruleAnswers, ruleKeys) };
      const computed = { final_risk: computeFinalRisk(answers, active) };
      return textResult(formatAnswers(answers, { computed, configPath: project.path }));
    },
  );

  server.registerTool(
    "decide",
    {
      description:
        "Ask arbitrary typed questions about any state (text or JSON). Use for decisions the other tools don't cover, including routing over a one-off set of workflows (a choice question).",
      inputSchema: z
        .object({
          state: z
            .union([z.string().trim().min(1), z.record(z.unknown())])
            .describe("The text or JSON object to judge"),
          questions: questionsSchema.describe(
            'Typed questions: {"key": {"type": "choice"|"noul"|"score", "instructions": "...", "criteria": ...}} — choice: record of 2-26 named option descriptions; noul: {false, true} descriptions; score: array of 2-10 descriptions ordered lowest to highest',
          ),
          model: z.enum(["default", "fast"]).optional().describe("Which configured model to use; defaults to \"default\""),
        })
        .strict(),
    },
    async ({ state, questions, model }) => {
      validateDecideQuestions(questions);
      const { settings, project } = await context();
      const answers = await askSystemOne(
        settings,
        model === "fast" ? settings.fastModel : settings.model,
        state,
        questions,
      );
      return textResult(formatAnswers(answers, { configPath: project.path }));
    },
  );

  return server;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const server = createServer();
  try {
    await server.connect(new StdioServerTransport());
  } catch (error) {
    console.error("systemone mcp server error:", error);
    process.exit(1);
  }
}
