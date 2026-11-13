# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

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
