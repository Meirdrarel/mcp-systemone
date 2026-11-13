import fs from "node:fs";
import path from "node:path";

export const CONFIG_FILENAME = ".systemone.json";

const ID_PATTERN = /^[a-z][a-z0-9_-]{0,47}$/;
const MAX_DESCRIPTION = 300;
const MAX_INVARIANTS = 12;
const MAX_RISK_RULES = 12;
const MAX_WORKFLOWS = 25;
const RISK_LEVELS = ["needs_confirm", "dangerous"];
const TOP_LEVEL_KEYS = ["version", "invariants", "workflows", "risk_rules"];
const RISK_RULE_KEYS = ["description", "level"];
const OTHER_WORKFLOW = "None of the above";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function checkDescription(value, where, source) {
  if (typeof value !== "string" || value.trim() === "" || value.length > MAX_DESCRIPTION) {
    throw new Error(
      `${source}: ${where} description must be a non-empty string of at most ${MAX_DESCRIPTION} characters`,
    );
  }
}

/**
 * Validate one entry map (`invariants`, `workflows` or `risk_rules`) and return a shallow copy.
 * Used for the project file and for caller-supplied additions. Errors start with `${source}: `.
 */
export function validateEntries(kind, value, source) {
  if (!isPlainObject(value)) {
    throw new Error(`${source}: ${kind} must be an object mapping ids to entries`);
  }
  const entries = Object.entries(value);
  if (kind === "workflows") {
    if (entries.length < 1 || entries.length > MAX_WORKFLOWS) {
      throw new Error(`${source}: workflows must have 1-${MAX_WORKFLOWS} entries (got ${entries.length})`);
    }
  } else {
    const max = kind === "invariants" ? MAX_INVARIANTS : MAX_RISK_RULES;
    if (entries.length > max) {
      throw new Error(`${source}: ${kind} allows at most ${max} entries (got ${entries.length})`);
    }
  }
  const copy = {};
  for (const [id, entry] of entries) {
    if (!ID_PATTERN.test(id)) {
      throw new Error(`${source}: ${kind} has invalid id "${id}" (must match ${ID_PATTERN.source})`);
    }
    if (kind === "risk_rules") {
      if (!isPlainObject(entry)) {
        throw new Error(`${source}: risk_rules.${id} must be an object with description and level`);
      }
      for (const key of Object.keys(entry)) {
        if (!RISK_RULE_KEYS.includes(key)) {
          throw new Error(`${source}: risk_rules.${id} has unknown key "${key}"`);
        }
      }
      checkDescription(entry.description, `risk_rules.${id}`, source);
      if (!RISK_LEVELS.includes(entry.level)) {
        throw new Error(`${source}: risk_rules.${id} level must be needs_confirm or dangerous`);
      }
      copy[id] = { description: entry.description, level: entry.level };
    } else {
      checkDescription(entry, `${kind}.${id}`, source);
      copy[id] = entry;
    }
  }
  return copy;
}

function parseConfig(text, file) {
  const source = `${CONFIG_FILENAME} at ${file}`;
  let json;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new Error(`${source}: invalid JSON (${error.message})`);
  }
  if (!isPlainObject(json)) {
    throw new Error(`${source}: must be a JSON object`);
  }
  for (const key of Object.keys(json)) {
    if (!TOP_LEVEL_KEYS.includes(key)) {
      throw new Error(`${source}: unknown key "${key}" (allowed: ${TOP_LEVEL_KEYS.join(", ")})`);
    }
  }
  if (json.version !== 1) {
    throw new Error(`${source}: version must be 1`);
  }
  const invariants = json.invariants === undefined ? null : validateEntries("invariants", json.invariants, source);
  let workflows = json.workflows === undefined ? null : validateEntries("workflows", json.workflows, source);
  if (workflows && !("other" in workflows)) {
    workflows = { ...workflows, other: OTHER_WORKFLOW };
  }
  const riskRules = json.risk_rules === undefined ? null : validateEntries("risk_rules", json.risk_rules, source);
  return { path: file, invariants, workflows, riskRules };
}

const cache = new Map();

/** Load and validate a project config file; cached by path, re-read when mtime or size changes. */
export function loadProjectConfig(file) {
  const abs = path.resolve(file);
  const stat = fs.statSync(abs);
  const cached = cache.get(abs);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached.config;
  }
  const config = parseConfig(fs.readFileSync(abs, "utf8"), abs);
  cache.set(abs, { mtimeMs: stat.mtimeMs, size: stat.size, config });
  return config;
}

function findGitRoot(start) {
  let dir = start;
  for (;;) {
    if (fs.existsSync(path.join(dir, ".git"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

/**
 * Find the project config: SYSTEMONE_CONFIG, then MCP roots in order, then cwd up to the git root
 * (cwd only outside a git repo). Returns an absolute path or null.
 */
export function findConfigPath({ env = process.env, roots = [], cwd = process.cwd() } = {}) {
  const explicit = env.SYSTEMONE_CONFIG?.trim();
  if (explicit) {
    const abs = path.resolve(cwd, explicit);
    if (!isFile(abs)) {
      throw new Error(`SYSTEMONE_CONFIG points to ${abs} which does not exist`);
    }
    return abs;
  }
  for (const root of roots) {
    const candidate = path.join(root, CONFIG_FILENAME);
    if (isFile(candidate)) {
      return candidate;
    }
  }
  const start = path.resolve(cwd);
  const gitRoot = findGitRoot(start);
  let dir = start;
  for (;;) {
    const candidate = path.join(dir, CONFIG_FILENAME);
    if (isFile(candidate)) {
      return candidate;
    }
    if (gitRoot === null || dir === gitRoot) {
      return null;
    }
    dir = path.dirname(dir);
  }
}

/** Discover and load the active project config; all fields null when there is none. */
export function resolveProjectConfig({ env = process.env, roots = [], cwd = process.cwd() } = {}) {
  const file = findConfigPath({ env, roots, cwd });
  if (file === null) {
    return { path: null, invariants: null, workflows: null, riskRules: null };
  }
  return loadProjectConfig(file);
}
