import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { releaseNotes } from "../scripts/release-notes.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "scripts/release-notes.mjs");

const CHANGELOG = `# Changelog

Intro.

## [Unreleased]

## [1.1.0] - 2026-11-16

### Added

- New thing.

### Fixed

- Old bug.

## [1.0.10] - 2026-11-14

## [1.0.1] - 2026-11-13

### Fixed

- First fix.
`;

test("releaseNotes returns the version's section without its heading or surrounding blank lines", () => {
  assert.equal(releaseNotes(CHANGELOG, "1.1.0"), "### Added\n\n- New thing.\n\n### Fixed\n\n- Old bug.\n");
});

test("releaseNotes reads the last section up to the end of the file", () => {
  assert.equal(releaseNotes(CHANGELOG, "1.0.1"), "### Fixed\n\n- First fix.\n");
});

test("releaseNotes matches the exact version only", () => {
  assert.throws(() => releaseNotes(CHANGELOG, "1.1"), /no "## \[1\.1\]" section in CHANGELOG\.md/);
  assert.throws(() => releaseNotes(CHANGELOG, "1.0.1x"), /no "## \[1\.0\.1x\]" section/);
});

test("releaseNotes rejects a missing or empty section", () => {
  assert.throws(() => releaseNotes(CHANGELOG, "2.0.0"), /no "## \[2\.0\.0\]" section/);
  assert.throws(() => releaseNotes(CHANGELOG, "1.0.10"), /section "## \[1\.0\.10\]" in CHANGELOG\.md is empty/);
});

test("the repository CHANGELOG has notes for the package.json version", () => {
  const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const notes = releaseNotes(fs.readFileSync(path.join(ROOT, "CHANGELOG.md"), "utf8"), version);
  assert.match(notes, /^### /);
});

test("the CLI prints the notes, or fails with a message and no output", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "systemone-notes-"));
  const file = path.join(dir, "CHANGELOG.md");
  fs.writeFileSync(file, CHANGELOG);
  const ok = spawnSync(process.execPath, [SCRIPT, "1.0.1", file], { encoding: "utf8" });
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(ok.stdout, "### Fixed\n\n- First fix.\n");
  const missing = spawnSync(process.execPath, [SCRIPT, "9.9.9", file], { encoding: "utf8" });
  assert.notEqual(missing.status, 0);
  assert.equal(missing.stdout, "");
  assert.match(missing.stderr, /no "## \[9\.9\.9\]" section/);
  const noArgs = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" });
  assert.notEqual(noArgs.status, 0);
  assert.match(noArgs.stderr, /usage: /);
});

test("the Release workflow writes notes before publishing and creates the GitHub release after", () => {
  const workflow = fs.readFileSync(path.join(ROOT, ".github/workflows/release.yml"), "utf8");
  assert.match(workflow, /^ {2}contents: write(?: #.*)?$/m);
  assert.match(workflow, /^ {2}id-token: write(?: #.*)?$/m);
  const notes = workflow.indexOf("node scripts/release-notes.mjs");
  const publish = workflow.indexOf("npm publish --provenance");
  const release = workflow.indexOf("gh release create");
  assert.ok(notes > 0, "notes step missing");
  assert.ok(publish > notes, "notes must be written before npm publish");
  assert.ok(release > publish, "the GitHub release must be created after npm publish");
  assert.match(workflow, /gh release create "\$GITHUB_REF_NAME" --verify-tag --title "\$GITHUB_REF_NAME" --notes-file /);
  assert.match(workflow, /GH_TOKEN: \$\{\{ github\.token \}\}/);
});
