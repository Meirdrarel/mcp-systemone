import { test } from "node:test";
import assert from "node:assert/strict";

import { askSystemOne } from "../src/client.js";
import { startMockSystemOne } from "./mock_systemone.mjs";

function settingsFor(port, overrides = {}) {
  return {
    url: `http://127.0.0.1:${port}/v1/systemone`,
    apiKey: "test-key",
    model: "clef",
    fastModel: "clef-flash",
    timeoutMs: 30000,
    ...overrides,
  };
}

test("askSystemOne posts to the endpoint and returns the answers record", async () => {
  const mock = await startMockSystemOne({
    body: { model: "clef", answers: { x: { type: "noul", noul: 0.9 } } },
  });
  try {
    const questions = { x: { type: "noul", instructions: "i", criteria: { false: "f", true: "t" } } };
    const answers = await askSystemOne(settingsFor(mock.port), "clef", "git push --force", questions);
    assert.deepEqual(answers, { x: { type: "noul", noul: 0.9 } });
    assert.equal(mock.requests.length, 1);
    const req = mock.requests[0];
    assert.equal(req.url, "/v1/systemone");
    assert.equal(req.authorization, "Bearer test-key");
    assert.equal(req.contentType, "application/json");
    assert.equal(req.body.model, "clef");
    assert.equal(req.body.state, "git push --force");
    assert.deepEqual(req.body.questions, questions);
  } finally {
    await mock.close();
  }
});

test("no Authorization header without a key", async () => {
  const mock = await startMockSystemOne({ body: { answers: {} } });
  try {
    await askSystemOne(settingsFor(mock.port, { apiKey: undefined }), "clef", "s", {});
    assert.equal(mock.requests[0].authorization, undefined);
  } finally {
    await mock.close();
  }
});

test("askSystemOne surfaces upstream errors with status and body", async () => {
  const mock = await startMockSystemOne({ status: 500, body: { error: "boom" } });
  try {
    await assert.rejects(
      askSystemOne(settingsFor(mock.port), "clef", "s", {}),
      (err) => /systemone 500:/.test(err.message) && err.message.includes("boom"),
    );
  } finally {
    await mock.close();
  }
});

test("askSystemOne times out when the endpoint stalls", async () => {
  const mock = await startMockSystemOne({ delayMs: 500 });
  try {
    await assert.rejects(
      askSystemOne(settingsFor(mock.port, { timeoutMs: 50 }), "clef", "s", {}),
      /systemone: request timed out after 50ms/,
    );
  } finally {
    await mock.close();
  }
});

test("askSystemOne throws a clear error on a non-JSON 200 response", async () => {
  const mock = await startMockSystemOne({ raw: "not json at all" });
  try {
    await assert.rejects(
      askSystemOne(settingsFor(mock.port), "clef", "s", {}),
      /systemone: invalid response/,
    );
  } finally {
    await mock.close();
  }
});

test("askSystemOne throws a clear error when the 200 body has no answers record", async () => {
  const mock = await startMockSystemOne({ body: { model: "clef", ok: true } });
  try {
    await assert.rejects(
      askSystemOne(settingsFor(mock.port), "clef", "s", {}),
      /systemone: invalid response/,
    );
  } finally {
    await mock.close();
  }
});

test("connection refused gives an actionable message", async () => {
  const mock = await startMockSystemOne();
  const port = mock.port;
  await mock.close();
  await assert.rejects(
    askSystemOne(settingsFor(port), "clef", "s", {}),
    /systemone: nothing listening at http:\/\/127\.0\.0\.1:\d+\/v1\/systemone\. Start your System One server, or set SYSTEMONE_BASE_URL/,
  );
});

test("404 naming the model hints at pulling it", async () => {
  const mock = await startMockSystemOne({ status: 404, body: { error: "model 'clef' not found" } });
  try {
    await assert.rejects(
      askSystemOne(settingsFor(mock.port), "clef", "s", {}),
      /systemone: model "clef" not found at .*\. Pull it or set SYSTEMONE_MODEL \/ SYSTEMONE_FAST_MODEL/,
    );
  } finally {
    await mock.close();
  }
});

test("404 without the model name points at the path", async () => {
  const mock = await startMockSystemOne({ status: 404, body: { error: "page not found" } });
  try {
    await assert.rejects(
      askSystemOne(settingsFor(mock.port), "clef", "s", {}),
      /systemone: endpoint .* not found \(404\)\. Check SYSTEMONE_BASE_URL and SYSTEMONE_PATH/,
    );
  } finally {
    await mock.close();
  }
});

test("401 and 403 point at the API key", async () => {
  for (const status of [401, 403]) {
    const mock = await startMockSystemOne({ status, body: { error: "nope" } });
    try {
      await assert.rejects(
        askSystemOne(settingsFor(mock.port), "clef", "s", {}),
        new RegExp(`systemone ${status}: unauthorized at .*\\. Set SYSTEMONE_API_KEY`),
      );
    } finally {
      await mock.close();
    }
  }
});
