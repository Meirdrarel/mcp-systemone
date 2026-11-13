import { validateEntries } from "./project-config.js";

const MAX_COMBINED = { invariants: 12, risk_rules: 12 };
const RISK_ORDER = ["safe", "needs_confirm", "dangerous"];
const THRESHOLD = 0.5;

export const DEFAULT_WORKFLOWS = Object.freeze({
  build: "New feature, component, or functionality to create",
  bugfix: "Fix a defect, failing test, or unexpected behavior",
  refactor: "Restructure existing code without changing behavior",
  review: "Read and critique code, a design, or a plan",
  docs: "Write or update documentation (README, AGENTS.md, plans)",
  other: "None of the above",
});

/**
 * Merge caller additions into the project's entries. The caller can only add:
 * an id already defined by the project is an error, and limits apply to the combined set.
 */
export function mergeAdditions(kind, base, extra) {
  const merged = { ...(base ?? {}) };
  if (extra === undefined) {
    return merged;
  }
  const additions = validateEntries(kind, extra, "caller");
  for (const [id, entry] of Object.entries(additions)) {
    if (id in merged) {
      throw new Error(`caller: ${kind} id "${id}" is already defined in the project config`);
    }
    merged[id] = entry;
  }
  const count = Object.keys(merged).length;
  if (count > MAX_COMBINED[kind]) {
    throw new Error(
      `caller: ${kind} allows at most ${MAX_COMBINED[kind]} entries including the project config (got ${count})`,
    );
  }
  return merged;
}

export function buildRouteQuestions(workflows = DEFAULT_WORKFLOWS) {
  return {
    workflow: {
      type: "choice",
      instructions: "Which workflow fits this request?",
      criteria: { ...workflows },
    },
    needs_clarification: {
      type: "noul",
      instructions:
        "Is the request too ambiguous to start work without asking the user a clarifying question?",
      criteria: {
        false: "The request is clear enough to start work",
        true: "Essential intent or scope is missing",
      },
    },
    urgency: {
      type: "score",
      instructions: "How urgently does this request need to be handled?",
      criteria: [
        "Routine: no time pressure, can be queued",
        "Soon: blocks other work or has a deadline",
        "Immediate: broken build, data loss risk, or blocking incident",
      ],
    },
  };
}

export function buildGateQuestions(invariants = {}) {
  const questions = {
    ready: {
      type: "noul",
      instructions:
        "Is this plan or design concrete enough to implement without guessing at requirements?",
      criteria: {
        false: "Requirements are missing or vague",
        true: "The plan is complete and unambiguous",
      },
    },
    verdict: {
      type: "choice",
      instructions: "What is the overall verdict on this plan or design?",
      criteria: {
        approve: "Complete, consistent, ready to implement",
        changes: "Usable but needs specific corrections first",
        reject: "Fundamentally flawed or missing critical information",
      },
    },
  };
  for (const [id, description] of Object.entries(invariants)) {
    questions[`invariant.${id}`] = {
      type: "noul",
      instructions: `Does the described change touch this invariant: ${description}`,
      criteria: {
        false: "The change does not affect this invariant",
        true: "The change touches or could break this invariant",
      },
    };
  }
  return questions;
}

export function buildCheckQuestions(riskRules = {}) {
  // The base risk question is fixed: neither the project file nor the caller can reword it.
  const questions = {
    risk: {
      type: "choice",
      instructions: "Rate the risk of running this shell command in a development repository.",
      criteria: {
        safe: "Read-only or trivially reversible: ls, git status, builds, tests",
        needs_confirm:
          "Mutates files, git history, or settings in recoverable ways: edits, commits, branch switches, installs",
        dangerous:
          "Destructive, hard to reverse, or affects shared or remote state: rm -rf, force push, sudo, dropping databases, publishing",
      },
    },
  };
  for (const [id, rule] of Object.entries(riskRules)) {
    questions[`rule.${id}`] = {
      type: "noul",
      instructions: `Does this command match this rule: ${rule.description}`,
      criteria: {
        false: "The command does not match this rule",
        true: "The command matches this rule",
      },
    };
  }
  return questions;
}

/** P(true) of a noul answer; a missing or malformed answer counts as 1 (fail closed). */
function noulProbability(answer) {
  const p = answer?.noul;
  return typeof p === "number" && Number.isFinite(p) ? p : 1;
}

export function computeTouchesInvariants(answers, invariants) {
  const ids = Object.keys(invariants ?? {});
  if (ids.length === 0) {
    return null;
  }
  let max = 0;
  const flagged = [];
  for (const id of ids) {
    const p = noulProbability(answers[`invariant.${id}`]);
    max = Math.max(max, p);
    if (p >= THRESHOLD) {
      flagged.push(id);
    }
  }
  return { p: max, flagged };
}

/**
 * Highest of the base risk choice and the level of every triggered rule. Rules can only raise.
 * A missing or unknown base choice counts as dangerous; a missing rule answer counts as triggered.
 */
export function computeFinalRisk(answers, riskRules) {
  const baseChoice = answers.risk?.choice;
  const base = RISK_ORDER.includes(baseChoice) ? baseChoice : "dangerous";
  let rank = RISK_ORDER.indexOf(base);
  const triggered = [];
  for (const [id, rule] of Object.entries(riskRules ?? {})) {
    if (noulProbability(answers[`rule.${id}`]) >= THRESHOLD) {
      triggered.push([id, RISK_ORDER.indexOf(rule.level)]);
    }
  }
  for (const [, ruleRank] of triggered) {
    rank = Math.max(rank, ruleRank);
  }
  const level = RISK_ORDER[rank];
  const raisedBy =
    rank > RISK_ORDER.indexOf(base)
      ? triggered.filter(([, ruleRank]) => ruleRank === rank).map(([id]) => id)
      : [];
  return { level, raisedBy };
}
