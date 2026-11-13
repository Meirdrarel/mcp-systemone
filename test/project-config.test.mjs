import { mock, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CONFIG_FILENAME,
  findConfigPath,
  loadProjectConfig,
  resolveProjectConfig,
} from "../src/project-config.js";

function tmpDir() {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "systemone-cfg-")));
}

function writeConfig(dir, content) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, CONFIG_FILENAME);
  fs.writeFileSync(file, typeof content === "string" ? content : JSON.stringify(content));
  return file;
}

const MINIMAL = { version: 1 };

// --- discovery ---

test("SYSTEMONE_CONFIG wins", () => {
  const dir = tmpDir();
  const explicit = writeConfig(path.join(dir, "explicit"), MINIMAL);
  const root = path.join(dir, "root");
  writeConfig(root, MINIMAL);
  writeConfig(dir, MINIMAL);
  assert.equal(findConfigPath({ env: { SYSTEMONE_CONFIG: explicit }, roots: [root], cwd: dir }), explicit);
});

test("missing SYSTEMONE_CONFIG file is an error", () => {
  const dir = tmpDir();
  const missing = path.join(dir, "nope.json");
  assert.throws(
    () => findConfigPath({ env: { SYSTEMONE_CONFIG: missing }, roots: [], cwd: dir }),
    /SYSTEMONE_CONFIG points to .* which does not exist/,
  );
});

test("first root containing the file wins", () => {
  const dir = tmpDir();
  const a = path.join(dir, "a");
  fs.mkdirSync(a);
  const b = writeConfig(path.join(dir, "b"), MINIMAL);
  writeConfig(path.join(dir, "c"), MINIMAL);
  assert.equal(
    findConfigPath({ env: {}, roots: [a, path.join(dir, "b"), path.join(dir, "c")], cwd: dir }),
    b,
  );
});

test("walks up from cwd and stops at git root", () => {
  const dir = tmpDir();
  const repo = path.join(dir, "repo");
  fs.mkdirSync(path.join(repo, ".git"), { recursive: true });
  const cfg = writeConfig(repo, MINIMAL);
  const cwd = path.join(repo, "pkg", "src");
  fs.mkdirSync(cwd, { recursive: true });
  assert.equal(findConfigPath({ env: {}, roots: [], cwd }), cfg);

  // A file above the git root is never returned.
  const repo2 = path.join(dir, "outer", "repo2");
  writeConfig(path.join(dir, "outer"), MINIMAL);
  fs.mkdirSync(path.join(repo2, ".git"), { recursive: true });
  assert.equal(findConfigPath({ env: {}, roots: [], cwd: repo2 }), null);
});

test("a .git file (worktree) also marks the git root", () => {
  const dir = tmpDir();
  writeConfig(dir, MINIMAL);
  const wt = path.join(dir, "wt");
  fs.mkdirSync(wt);
  fs.writeFileSync(path.join(wt, ".git"), "gitdir: elsewhere\n");
  assert.equal(findConfigPath({ env: {}, roots: [], cwd: wt }), null);
});

test("outside a git repo only cwd is checked", () => {
  const dir = tmpDir();
  writeConfig(dir, MINIMAL);
  const cwd = path.join(dir, "child");
  fs.mkdirSync(cwd);
  assert.equal(findConfigPath({ env: {}, roots: [], cwd }), null);
});

test("returns null when nothing is found", () => {
  const dir = tmpDir();
  assert.equal(findConfigPath({ env: {}, roots: [dir], cwd: dir }), null);
});

// --- load and validation ---

test("loads a full v1 config and appends other", () => {
  const dir = tmpDir();
  const file = writeConfig(dir, {
    version: 1,
    invariants: { "api-compat": "Public endpoints stay compatible" },
    workflows: { build: "b" },
    risk_rules: { "prod-db": { description: "Touches prod", level: "dangerous" } },
  });
  const cfg = loadProjectConfig(file);
  assert.equal(cfg.path, file);
  assert.deepEqual(cfg.invariants, { "api-compat": "Public endpoints stay compatible" });
  assert.deepEqual(cfg.workflows, { build: "b", other: "None of the above" });
  assert.deepEqual(cfg.riskRules, { "prod-db": { description: "Touches prod", level: "dangerous" } });

  const file2 = writeConfig(path.join(dir, "x"), { version: 1, workflows: { build: "b", other: "Mine" } });
  assert.deepEqual(loadProjectConfig(file2).workflows, { build: "b", other: "Mine" });
  const file3 = writeConfig(path.join(dir, "y"), MINIMAL);
  const minimal = loadProjectConfig(file3);
  assert.equal(minimal.invariants, null);
  assert.equal(minimal.workflows, null);
  assert.equal(minimal.riskRules, null);
});

test("rejects non-object JSON", () => {
  for (const raw of ["[]", "null", '"x"', "3"]) {
    const file = writeConfig(tmpDir(), raw);
    assert.throws(() => loadProjectConfig(file), /\.systemone\.json at .*: must be a JSON object/, raw);
  }
});

test("rejects invalid JSON", () => {
  const file = writeConfig(tmpDir(), "{ nope");
  assert.throws(() => loadProjectConfig(file), /\.systemone\.json at .*: invalid JSON/);
});

test("requires version 1", () => {
  for (const content of [{}, { version: 2 }, { version: "1" }]) {
    const file = writeConfig(tmpDir(), content);
    assert.throws(() => loadProjectConfig(file), /version must be 1/);
  }
});

test("rejects unknown top-level keys", () => {
  const file = writeConfig(tmpDir(), { version: 1, invariant: {} });
  assert.throws(() => loadProjectConfig(file), /unknown key "invariant"/);
});

test("rejects bad ids and descriptions", () => {
  const cases = [
    { invariants: { "Bad Id": "x" } },
    { invariants: { "": "x" } },
    { invariants: { ["a".repeat(49)]: "x" } },
    { invariants: { ok: "" } },
    { invariants: { ok: "   " } },
    { invariants: { ok: "x".repeat(301) } },
    { invariants: { ok: 3 } },
    { workflows: { "1abc": "x" } },
    { risk_rules: { ok: { description: "", level: "dangerous" } } },
    { risk_rules: { ok: "dangerous" } },
    { invariants: [] },
    { invariants: "x" },
  ];
  for (const c of cases) {
    const file = writeConfig(tmpDir(), { version: 1, ...c });
    assert.throws(() => loadProjectConfig(file), /invalid id|description|must be an object/, JSON.stringify(c));
  }
  const ok = writeConfig(tmpDir(), { version: 1, invariants: { ["a".repeat(48)]: "x".repeat(300), "a_b-1": "y" } });
  assert.doesNotThrow(() => loadProjectConfig(ok));
});

function many(n, make) {
  return Object.fromEntries(Array.from({ length: n }, (_, i) => [`id${i}`, make(i)]));
}

test("enforces limits", () => {
  const cases = [
    [{ invariants: many(13, () => "d") }, /at most 12/],
    [{ risk_rules: many(13, () => ({ description: "d", level: "dangerous" })) }, /at most 12/],
    [{ workflows: many(26, () => "d") }, /1-25/],
    [{ workflows: {} }, /1-25/],
  ];
  for (const [c, re] of cases) {
    const file = writeConfig(tmpDir(), { version: 1, ...c });
    assert.throws(() => loadProjectConfig(file), re);
  }
  const ok = writeConfig(tmpDir(), {
    version: 1,
    invariants: many(12, () => "d"),
    workflows: many(25, () => "d"),
    risk_rules: many(12, () => ({ description: "d", level: "needs_confirm" })),
  });
  assert.equal(Object.keys(loadProjectConfig(ok).workflows).length, 26);
});

test("rejects bad risk level", () => {
  for (const level of ["safe", undefined, "DANGEROUS"]) {
    const file = writeConfig(tmpDir(), { version: 1, risk_rules: { x: { description: "d", level } } });
    assert.throws(() => loadProjectConfig(file), /level must be needs_confirm or dangerous/);
  }
  const extra = writeConfig(tmpDir(), {
    version: 1,
    risk_rules: { x: { description: "d", level: "dangerous", extra: 1 } },
  });
  assert.throws(() => loadProjectConfig(extra), /unknown key "extra"/);
});

test("reloads after the file changes", () => {
  const dir = tmpDir();
  const file = writeConfig(dir, { version: 1, invariants: { a: "A" } });
  assert.deepEqual(loadProjectConfig(file).invariants, { a: "A" });
  writeConfig(dir, { version: 1, invariants: { b: "B" } });
  const later = new Date(Date.now() + 5000);
  fs.utimesSync(file, later, later);
  assert.deepEqual(loadProjectConfig(file).invariants, { b: "B" });
});

test("deleted file falls through to the next discovery step", () => {
  const dir = tmpDir();
  fs.mkdirSync(path.join(dir, ".git"));
  const file = writeConfig(dir, MINIMAL);
  assert.equal(resolveProjectConfig({ env: {}, roots: [], cwd: dir }).path, file);
  fs.rmSync(file);
  assert.deepEqual(resolveProjectConfig({ env: {}, roots: [], cwd: dir }), {
    path: null,
    invariants: null,
    workflows: null,
    riskRules: null,
  });
});

test("the shipped example config is valid", () => {
  const file = fileURLToPath(new URL("../examples/.systemone.json", import.meta.url));
  const cfg = loadProjectConfig(file);
  assert.equal(Object.keys(cfg.invariants).length, 2);
  assert.deepEqual(Object.keys(cfg.workflows), ["build", "bugfix", "refactor", "release", "other"]);
  assert.equal(Object.keys(cfg.riskRules).length, 2);
});

test("a config deleted between discovery and load falls through to the next candidate", () => {
  const dir = tmpDir();
  fs.mkdirSync(path.join(dir, ".git"));
  const cwdConfig = writeConfig(dir, { version: 1, workflows: { fromcwd: "C" } });
  const root = path.join(dir, "root");
  const rootConfig = writeConfig(root, { version: 1, workflows: { fromroot: "R" } });
  const realRead = fs.readFileSync;
  // Simulate the root config disappearing after it was found (stat succeeded, read fails).
  const read = mock.method(fs, "readFileSync", (file, ...rest) => {
    if (file === rootConfig) {
      throw Object.assign(new Error(`ENOENT: no such file or directory, open '${file}'`), { code: "ENOENT" });
    }
    return realRead.call(fs, file, ...rest);
  });
  try {
    const cfg = resolveProjectConfig({ env: {}, roots: [root], cwd: dir });
    assert.equal(cfg.path, cwdConfig);
  } finally {
    read.mock.restore();
  }
});

test("a SYSTEMONE_CONFIG file deleted before load gives the does-not-exist error", () => {
  const dir = tmpDir();
  const explicit = writeConfig(dir, MINIMAL);
  const realRead = fs.readFileSync;
  const read = mock.method(fs, "readFileSync", (file, ...rest) => {
    if (file === explicit) {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    }
    return realRead.call(fs, file, ...rest);
  });
  try {
    assert.throws(
      () => resolveProjectConfig({ env: { SYSTEMONE_CONFIG: explicit }, roots: [], cwd: dir }),
      /SYSTEMONE_CONFIG points to .* which does not exist/,
    );
  } finally {
    read.mock.restore();
  }
});
