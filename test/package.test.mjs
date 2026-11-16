import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

test("package.json is publishable with an mcp-systemone bin", () => {
  assert.notEqual(pkg.private, true);
  assert.equal(pkg.bin?.["mcp-systemone"], "bin/mcp-systemone.js");
  const binSource = fs.readFileSync(path.join(ROOT, pkg.bin["mcp-systemone"]), "utf8");
  assert.match(binSource, /^#!\/usr\/bin\/env node\n/);
  assert.match(pkg.repository?.url ?? "", /github\.com\/Meirdrarel\/mcp-systemone/);
});

test("npm pack ships runtime files only", () => {
  const out = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const files = JSON.parse(out)[0].files.map((f) => f.path).sort();
  for (const required of [
    "bin/mcp-systemone.js",
    "src/server.js",
    "src/settings.js",
    "src/client.js",
    "src/project-config.js",
    "src/questions.js",
    "src/format.js",
    "examples/.systemone.json",
    "README.md",
    "CHANGELOG.md",
    "LICENSE-MIT",
    "LICENSE-APACHE",
    "package.json",
  ]) {
    assert.ok(files.includes(required), `missing ${required} in ${files.join(", ")}`);
  }
  for (const file of files) {
    assert.doesNotMatch(file, /^(test|docs|\.github|\.idea)\//, `unexpected ${file}`);
  }
});

test("bin starts the stdio server when run through a symlink, as npm installs it", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "systemone-bin-"));
  const link = path.join(dir, "mcp-systemone");
  fs.symlinkSync(path.join(ROOT, "bin/mcp-systemone.js"), link);
  const client = new Client({ name: "test", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [link],
    cwd: dir,
    env: { PATH: process.env.PATH ?? "" },
    stderr: "pipe",
  });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), ["check", "decide", "gate", "route"]);
  } finally {
    await client.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
