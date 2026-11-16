import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WRAPPER = path.join(ROOT, "examples/mcp-systemone-wrapper.sh");

function writeExecutable(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, { mode: 0o755 });
}

/**
 * Stubs for everything the wrapper calls: `security` (keychain), nvm's `nvm.sh`, and the
 * `npx` it finally execs. The npx stub prints what it received instead of starting a server.
 */
function stubEnvironment({ securityFails = false, nvmHasDefault = true, withNvm = true } = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "systemone-wrapper-")));
  const stubBin = path.join(dir, "stub-bin");
  const nodeBin = path.join(dir, "node-bin");
  const nvmDir = path.join(dir, "nvm");
  writeExecutable(
    path.join(stubBin, "security"),
    securityFails
      ? "#!/bin/sh\necho 'item not found' >&2\nexit 44\n"
      : '#!/bin/sh\n[ "$*" = "find-generic-password -s systemone-api-key -w" ] || exit 9\necho test-key\n',
  );
  writeExecutable(path.join(nodeBin, "node"), "#!/bin/sh\nexit 0\n");
  writeExecutable(
    path.join(nodeBin, "npx"),
    '#!/bin/sh\necho "KEY=$SYSTEMONE_API_KEY"\necho "BASE=$SYSTEMONE_BASE_URL"\necho "ARGS=$*"\necho "PATHHEAD=${PATH%%:*}"\n',
  );
  fs.mkdirSync(nvmDir, { recursive: true });
  if (withNvm) {
    fs.writeFileSync(
      path.join(nvmDir, "nvm.sh"),
      nvmHasDefault
        ? `nvm() { [ "$1" = which ] && [ "$2" = default ] && echo "${nodeBin}/node"; }\n`
        : "nvm() { echo 'N/A: version \"default\" is not yet installed.' >&2; return 3; }\n",
    );
  }
  return { dir, stubBin, nodeBin, nvmDir };
}

function runWrapper(stubs, { args = [], env = {} } = {}) {
  return spawnSync("/bin/sh", [WRAPPER, ...args], {
    encoding: "utf8",
    env: {
      PATH: `${stubs.stubBin}:/usr/bin:/bin`,
      HOME: stubs.dir,
      NVM_DIR: stubs.nvmDir,
      ...env,
    },
  });
}

test("wrapper example is an executable, parsable shell script", () => {
  assert.ok(fs.statSync(WRAPPER).mode & 0o111, "not executable");
  const parsed = spawnSync("/bin/sh", ["-n", WRAPPER], { encoding: "utf8" });
  assert.equal(parsed.status, 0, parsed.stderr);
});

test("wrapper passes the keychain key through the environment and execs npx with nvm's default Node", () => {
  const stubs = stubEnvironment();
  const result = runWrapper(stubs, { args: ["--extra"] });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split("\n"), [
    "KEY=test-key",
    "BASE=https://ollama.com",
    "ARGS=-y mcp-systemone --extra",
    `PATHHEAD=${stubs.nodeBin}`,
  ]);
});

test("wrapper keeps a SYSTEMONE_BASE_URL set by the client", () => {
  const stubs = stubEnvironment();
  const result = runWrapper(stubs, { env: { SYSTEMONE_BASE_URL: "http://127.0.0.1:9" } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^BASE=http:\/\/127\.0\.0\.1:9$/m);
});

test("wrapper stops with an error when the keychain item is missing", () => {
  const result = runWrapper(stubEnvironment({ securityFails: true }));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /systemone-api-key/);
  assert.equal(result.stdout, "");
});

test("wrapper stops with an error when nvm is missing or has no default Node", () => {
  for (const options of [{ withNvm: false }, { nvmHasDefault: false }]) {
    const result = runWrapper(stubEnvironment(options));
    assert.notEqual(result.status, 0, JSON.stringify(options));
    assert.match(result.stderr, /nvm/, JSON.stringify(options));
    assert.equal(result.stdout, "", JSON.stringify(options));
  }
});

test("wrapper never reads OLLAMA_API_KEY and the README links it", () => {
  assert.doesNotMatch(fs.readFileSync(WRAPPER, "utf8"), /OLLAMA_API_KEY/);
  assert.match(fs.readFileSync(path.join(ROOT, "README.md"), "utf8"), /examples\/mcp-systemone-wrapper\.sh/);
});
