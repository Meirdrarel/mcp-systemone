export const DEFAULT_BASE_URL = "http://localhost:11434";
export const DEFAULT_PATH = "/v1/systemone";
export const DEFAULT_MODEL = "clef";
export const DEFAULT_FAST_MODEL = "clef-flash";
export const DEFAULT_TIMEOUT_MS = 30_000;

function nonBlank(value) {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** Join a base URL and a path without dropping a base path prefix (unlike `new URL(path, base)`). */
export function joinUrl(base, path) {
  const trimmedBase = base.replace(/\/+$/, "");
  const trimmedPath = path.startsWith("/") ? path : `/${path}`;
  return `${trimmedBase}${trimmedPath}`;
}

function parseTimeout(raw) {
  if (raw === undefined) {
    return DEFAULT_TIMEOUT_MS;
  }
  if (!/^\d+$/.test(raw) || Number(raw) <= 0) {
    throw new Error("SYSTEMONE_TIMEOUT_MS must be a positive integer");
  }
  return Number(raw);
}

/** Resolve connection settings from environment variables. Pure: takes `env` explicitly. */
export function readSettings(env = process.env) {
  const url =
    nonBlank(env.SYSTEMONE_URL) ??
    joinUrl(nonBlank(env.SYSTEMONE_BASE_URL) ?? DEFAULT_BASE_URL, nonBlank(env.SYSTEMONE_PATH) ?? DEFAULT_PATH);
  return {
    url,
    apiKey: nonBlank(env.SYSTEMONE_API_KEY),
    model: nonBlank(env.SYSTEMONE_MODEL) ?? DEFAULT_MODEL,
    fastModel: nonBlank(env.SYSTEMONE_FAST_MODEL) ?? DEFAULT_FAST_MODEL,
    timeoutMs: parseTimeout(nonBlank(env.SYSTEMONE_TIMEOUT_MS)),
  };
}
