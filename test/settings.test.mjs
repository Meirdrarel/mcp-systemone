import { test } from "node:test";
import assert from "node:assert/strict";

import { joinUrl, readSettings } from "../src/settings.js";

test("readSettings defaults", () => {
  assert.deepEqual(readSettings({}), {
    url: "http://localhost:11434/v1/systemone",
    apiKey: undefined,
    model: "clef",
    fastModel: "clef-flash",
    timeoutMs: 30000,
  });
});

test("readSettings composes base + path and reads overrides", () => {
  const s = readSettings({
    SYSTEMONE_BASE_URL: "https://ollama.com/",
    SYSTEMONE_PATH: "v2/so",
    SYSTEMONE_API_KEY: "k",
    SYSTEMONE_MODEL: "m",
    SYSTEMONE_FAST_MODEL: "f",
    SYSTEMONE_TIMEOUT_MS: "50",
  });
  assert.deepEqual(s, {
    url: "https://ollama.com/v2/so",
    apiKey: "k",
    model: "m",
    fastModel: "f",
    timeoutMs: 50,
  });
});

test("SYSTEMONE_URL overrides base and path", () => {
  assert.equal(
    readSettings({ SYSTEMONE_URL: "http://x:1/y", SYSTEMONE_BASE_URL: "http://z" }).url,
    "http://x:1/y",
  );
});

test("OLLAMA_API_KEY is ignored and blank key is undefined", () => {
  assert.equal(readSettings({ OLLAMA_API_KEY: "o" }).apiKey, undefined);
  assert.equal(readSettings({ SYSTEMONE_API_KEY: "  " }).apiKey, undefined);
});

test("joinUrl keeps base path prefixes", () => {
  assert.equal(joinUrl("http://host/proxy/", "/v1/systemone"), "http://host/proxy/v1/systemone");
  assert.equal(joinUrl("http://host/proxy", "v1/systemone"), "http://host/proxy/v1/systemone");
});

test("invalid timeout is rejected", () => {
  for (const v of ["abc", "0", "-5", "1.5", "50ms"]) {
    assert.throws(
      () => readSettings({ SYSTEMONE_TIMEOUT_MS: v }),
      /SYSTEMONE_TIMEOUT_MS must be a positive integer/,
      `value ${JSON.stringify(v)}`,
    );
  }
});

test("blank values fall back to defaults", () => {
  const s = readSettings({
    SYSTEMONE_BASE_URL: "",
    SYSTEMONE_PATH: " ",
    SYSTEMONE_URL: "",
    SYSTEMONE_MODEL: "",
    SYSTEMONE_FAST_MODEL: "",
    SYSTEMONE_TIMEOUT_MS: "",
  });
  assert.deepEqual(s, readSettings({}));
});
