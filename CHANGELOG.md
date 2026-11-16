# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- `Release` workflow: also creates the GitHub release, with the version's `CHANGELOG.md`
  section as notes, and stops before publishing when that section is missing or empty.

## [1.1.0] - 2026-11-16

### Added

- `check`: `computed.final_risk.matched` lists every risk rule answered "yes" with its level,
  including rules that did not raise the rating because the base was already at their
  level. The first line shows them, e.g. `final_risk: dangerous (matched: shared-branch)`.
- `gate`: flagged invariants get a second question, `holds.<id>` ("does it still hold after
  this change?"), sent in a separate request only when at least one invariant is flagged.
  `computed.violated` lists those with P(holds) < 0.5 (a missing answer counts as violated),
  and `touches_invariants` shows each P(holds), e.g.
  `touches_invariants: yes (P=0.9; flagged: b, c; holds: b P=0.95, c P=0.2)` then `violated: c`.

- `route`, `gate` and `check`: `computed.uncertain` lists the choice and yes/no answers whose
  confidence, (Σp² − 1/k) / (1 − 1/k), is below `SYSTEMONE_MIN_CONFIDENCE` (new variable,
  0 to 1, default 0.2), plus any missing or malformed answer, with a line
  `low confidence: … (ask the user)`. It never changes `final_risk` or `violated`. The README
  defines confidence.
- `examples/mcp-systemone-wrapper.sh` and a README section for Claude Code: start the server
  with the API key from the macOS Keychain (or libsecret) and nvm's default Node, for clients
  that launch servers without a login shell. A test runs it against stubs.

### Changed

- `check`: the base `risk` criteria now separate levels by reversibility instead of "affects
  shared or remote state". `safe` is limited to local commands; pushing to a new or existing
  feature branch is listed under `needs_confirm`; `dangerous` names force pushes, pushes to
  the default or a protected branch, deleting remote branches or tags, and publishing a
  release or package. Feature-branch pushes are now expected to rate `needs_confirm`, where
  they used to lean `dangerous` (new branch) or rate `safe` (existing branch). Unknown answers
  still count as `dangerous`, and rules can still only raise the rating.
- `gate`: answers the model returns for questions it was not asked are dropped, as `check`
  already does.
- `gate`: with `kind: "diff"` or `"mr"`, the `ready` and `verdict` questions ask whether the
  change is ready to merge instead of whether a plan is ready to implement.

### Fixed

- The server reported version 1.0.2 to MCP clients since 1.0.3. The version now comes from
  `package.json`.

## [1.0.3] - 2026-11-16

### Added

- `Release` workflow: pushing a `vX.Y.Z` tag tests and publishes to npm with provenance.

## [1.0.2] - 2026-11-13

First version published to npm (published manually, without provenance).

### Added

- Published to npm as `mcp-systemone`: run it with `npx -y mcp-systemone` or install the
  `mcp-systemone` command with `npm install -g mcp-systemone`. Agent setup examples in the
  README use `npx`.
- `bin/mcp-systemone.js` entry point, which also works through npm's `.bin` symlinks
  (`node src/server.js` still works from a clone).

### Fixed

- `check`: caller `risk_rules` entries with unknown keys are rejected, like in
  `.systemone.json`, instead of being silently dropped.
- A `.systemone.json` deleted between discovery and loading now falls through to the next
  discovery location instead of failing with a raw `ENOENT`; a vanished `SYSTEMONE_CONFIG`
  target reports that the file does not exist.
- MCP roots are fetched once and cached until the client sends `roots/list_changed`,
  instead of on every tool call.

## [1.0.1] - 2026-11-13

### Security

- `check` now asks the base `risk` question in its own System One request, separate from
  the risk-rule questions. Rule descriptions from `.systemone.json` or from the calling
  agent can no longer influence the base rating; they can only raise `final_risk`. With
  rules configured, `check` makes two parallel requests instead of one.

### Added

- README: list of compatible models (`clef`, `clef-flash`, `nimble`, `jev`).

## [1.0.0] - 2026-11-13

First public release.

### Added

- MCP stdio server with four tools backed by a System One model: `route`, `gate`,
  `check`, `decide`.
- Connection settings from `SYSTEMONE_*` environment variables, defaulting to a local
  Ollama (`http://localhost:11434/v1/systemone`, models `clef` and `clef-flash`); the API
  key is optional.
- Project configuration file `.systemone.json` (invariants, workflows, risk rules), found
  via `SYSTEMONE_CONFIG`, MCP roots, or the working directory up to the git root, and
  reloaded when it changes.
- Caller-supplied invariants (`gate`) and risk rules (`check`) that add to the project's.
- Computed `touches_invariants` and `final_risk`; risk rules can only raise risk, and
  missing answers count as the risky case.
- Actionable errors for unreachable endpoints, missing models, wrong paths and
  authentication failures.
