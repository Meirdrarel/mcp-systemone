// Print the CHANGELOG.md section for one version, as GitHub release notes.
// Usage: node scripts/release-notes.mjs <version> [path/to/CHANGELOG.md]
// Fails (exit 1, nothing on stdout) when the section is missing or empty, so the Release
// workflow stops before publishing a version without notes.
import fs from "node:fs";
import { pathToFileURL } from "node:url";

/** Body of the `## [version]` section, without its heading or surrounding blank lines. */
export function releaseNotes(changelog, version) {
  const heading = `## [${version}]`;
  const lines = changelog.split("\n");
  const start = lines.findIndex((line) => line === heading || line.startsWith(`${heading} `));
  if (start === -1) {
    throw new Error(`no "${heading}" section in CHANGELOG.md`);
  }
  const next = lines.findIndex((line, index) => index > start && line.startsWith("## ["));
  const body = lines
    .slice(start + 1, next === -1 ? lines.length : next)
    .join("\n")
    .trim();
  if (body === "") {
    throw new Error(`section "${heading}" in CHANGELOG.md is empty`);
  }
  return `${body}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [version, file = "CHANGELOG.md"] = process.argv.slice(2);
  if (!version) {
    console.error("usage: node scripts/release-notes.mjs <version> [CHANGELOG.md]");
    process.exit(1);
  }
  try {
    process.stdout.write(releaseNotes(fs.readFileSync(file, "utf8"), version));
  } catch (error) {
    console.error(`release-notes: ${error.message}`);
    process.exit(1);
  }
}
