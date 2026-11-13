const UNREACHABLE_CODES = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"]);

function httpError(settings, model, status, text) {
  const { url } = settings;
  if (status === 404) {
    if (text.includes(model)) {
      return new Error(
        `systemone: model "${model}" not found at ${url}. Pull it or set SYSTEMONE_MODEL / SYSTEMONE_FAST_MODEL. Upstream said: ${text.slice(0, 200)}`,
      );
    }
    return new Error(
      `systemone: endpoint ${url} not found (404). Check SYSTEMONE_BASE_URL and SYSTEMONE_PATH. Upstream said: ${text.slice(0, 200)}`,
    );
  }
  if (status === 401 || status === 403) {
    return new Error(
      `systemone ${status}: unauthorized at ${url}. Set SYSTEMONE_API_KEY. Upstream said: ${text.slice(0, 200)}`,
    );
  }
  return new Error(`systemone ${status}: ${text}`);
}

/**
 * POST one System One request and return its `answers` record.
 * `settings` comes from readSettings(); `model` is the model name to use.
 */
export async function askSystemOne(settings, model, state, questions) {
  const { url, apiKey, timeoutMs } = settings;
  const headers = { "Content-Type": "application/json" };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ model, state, questions }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      throw new Error(`systemone: request timed out after ${timeoutMs}ms`);
    }
    if (UNREACHABLE_CODES.has(error.cause?.code)) {
      throw new Error(
        `systemone: nothing listening at ${url}. Start your System One server, or set SYSTEMONE_BASE_URL (e.g. https://ollama.com with SYSTEMONE_API_KEY).`,
      );
    }
    throw error;
  }
  const text = await res.text();
  if (!res.ok) {
    throw httpError(settings, model, res.status, text);
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`systemone: invalid response (not JSON): ${text.slice(0, 200)}`);
  }
  if (!json || typeof json !== "object" || !json.answers || typeof json.answers !== "object") {
    throw new Error(`systemone: invalid response (no answers record): ${text.slice(0, 200)}`);
  }
  return json.answers;
}
