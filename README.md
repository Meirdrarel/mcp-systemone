# mcp-systemone

An MCP server that gives coding agents four quick judgment tools backed by a
System One model (by default `clef` and `clef-flash`):

| Tool | Asks | Returns |
|---|---|---|
| `route` | Which workflow fits this request? | workflow, `needs_clarification`, urgency score |
| `gate` | Is this plan / design / diff ready? Does it touch an invariant? | `ready`, verdict, `touches_invariants` |
| `check` | How risky is this shell command? | base `risk` and `final_risk` after project rules |
| `decide` | Any typed questions you supply | one answer per question |

It speaks only the System One protocol: `POST {model, state, questions}` → `{answers}`.
Any server that implements it works: a local Ollama, hosted Ollama, or another compatible server.

Project knowledge (invariants, workflows, risk rules) lives in a `.systemone.json`
file in your repository, never in the server code.

## Requirements

- Node.js 24 or newer
- A System One endpoint serving a decision model (see [Models](#models))

## Models

The server works with any model served behind the System One protocol. Pick one model for
`SYSTEMONE_MODEL` and, optionally, a smaller or faster one for `SYSTEMONE_FAST_MODEL`.

| Model | Where | Setup |
|---|---|---|
| [`clef`](https://ollama.com/library/clef), [`clef-flash`](https://ollama.com/library/clef-flash) | Ollama library | `ollama pull clef` and `ollama pull clef-flash` (the defaults) |
| [`nimble`](https://ollama.com/library/nimble) | Ollama library | `ollama pull nimble`, then e.g. `SYSTEMONE_FAST_MODEL=nimble` |
| `jev` | not on Ollama | serve it with llama.cpp or another System One-compatible server, then point `SYSTEMONE_BASE_URL` / `SYSTEMONE_PATH` at it and set `SYSTEMONE_MODEL=jev` |

To use a hosted endpoint instead of a local server, see [Hosted Ollama](#hosted-ollama).

## Install

```sh
git clone https://github.com/Meirdrarel/mcp-systemone.git
cd mcp-systemone
npm ci
```

The server entry point is `src/server.js` (stdio transport).

## Configuration (environment variables)

Connection settings come from the environment only; secrets never go in a repository file.

| Variable | Default | Notes |
|---|---|---|
| `SYSTEMONE_BASE_URL` | `http://localhost:11434` | |
| `SYSTEMONE_PATH` | `/v1/systemone` | Appended to the base URL (base path prefixes are kept). |
| `SYSTEMONE_URL` | — | Full URL; overrides base URL + path. |
| `SYSTEMONE_API_KEY` | — | Optional. Sent as `Authorization: Bearer …` only when set. |
| `SYSTEMONE_MODEL` | `clef` | Used by `route`, `gate`, and `decide` (default). |
| `SYSTEMONE_FAST_MODEL` | `clef-flash` | Used by `check`, and `decide` with `model: "fast"`. |
| `SYSTEMONE_TIMEOUT_MS` | `30000` | Positive integer. |
| `SYSTEMONE_CONFIG` | — | Explicit path to a `.systemone.json`. |

Blank values count as unset.

### Hosted Ollama

```sh
SYSTEMONE_BASE_URL=https://ollama.com
SYSTEMONE_API_KEY=<your ollama.com API key>
```

## Agent setup

Replace `/abs/path/to/mcp-systemone` with your clone's path. Add `SYSTEMONE_*` variables as needed.

### Claude Code

```sh
claude mcp add --transport stdio systemone \
  -- node /abs/path/to/mcp-systemone/src/server.js
```

With a hosted endpoint (keep `--transport stdio` between the `--env` pairs and the name):

```sh
claude mcp add --env SYSTEMONE_BASE_URL=https://ollama.com --env SYSTEMONE_API_KEY=<key> \
  --transport stdio systemone -- node /abs/path/to/mcp-systemone/src/server.js
```

Add `--scope user` to enable it in every project.

### Codex

`~/.codex/config.toml`:

```toml
[mcp_servers.systemone]
command = "node"
args = ["/abs/path/to/mcp-systemone/src/server.js"]
# env = { SYSTEMONE_BASE_URL = "https://ollama.com", SYSTEMONE_API_KEY = "<key>" }
```

Codex starts the server without a shell, so `$VAR` and `~` are not expanded in `command`, `args`, or `env`.

### opencode

`opencode.json` (project) or `~/.config/opencode/opencode.json` (global):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "systemone": {
        "type": "local",
        "command": ["node", "/abs/path/to/mcp-systemone/src/server.js"],
        "environment": {
          "SYSTEMONE_API_KEY": "{env:SYSTEMONE_API_KEY}"
        }
      }
    }
  }
}
```

Older opencode (V1 config) puts the server directly under `mcp` instead of `mcp.servers`.

## Project config: `.systemone.json`

```json
{
  "version": 1,
  "invariants": {
    "api-compat": "Public REST endpoints keep backward-compatible request and response shapes"
  },
  "workflows": {
    "build": "New feature, component, or functionality to create",
    "bugfix": "Fix a defect, failing test, or unexpected behavior",
    "release": "Prepare, tag, or publish a release"
  },
  "risk_rules": {
    "prod-db": { "description": "Connects to or modifies the production database", "level": "dangerous" }
  }
}
```

A fuller example is in [`examples/.systemone.json`](examples/.systemone.json).

### Discovery (first match wins)

1. `SYSTEMONE_CONFIG`. If it points to a missing file, every tool call fails.
2. The MCP client's roots, in the order reported (if the client supports roots).
3. The server's working directory, walking up to the git root (the first directory
   containing `.git`). Outside a git repository only the working directory is checked.
4. Nothing found: built-in defaults (no invariants, no risk rules, default workflows).

The file is re-read when it changes, so edits apply without restarting the agent.
Every tool result ends with `config: <path>` or `config: none (defaults)`.

### Validation

A malformed file is a tool error naming the file and the problem. It never falls back to defaults silently.

- `version` is required and must be `1`; unknown top-level keys are rejected.
- Ids match `^[a-z][a-z0-9_-]{0,47}$`; descriptions are non-empty strings of at most 300 characters.
- `invariants`: at most 12. `risk_rules`: at most 12, `level` is `needs_confirm` or `dangerous`.
- `workflows`: 1–25 entries; `other` ("None of the above") is appended when missing.

### Merge rule

The project file replaces the built-in defaults; the calling agent can only add.

| | Default | `.systemone.json` | Tool argument |
|---|---|---|---|
| Workflows (`route`) | `build`, `bugfix`, `refactor`, `review`, `docs`, `other` | replaces | not accepted (use `decide` for one-off options) |
| Invariants (`gate`) | none | sets | `invariants` — added |
| Risk rules (`check`) | none | sets | `risk_rules` — added |

Caller entries are validated like the file. An id that collides with the project's is an error,
and the limits apply to the combined set.

### Risk rules only raise risk

`check` always asks the fixed base `risk` question. Each rule adds one yes/no question;
`final_risk` is the highest of the base rating and the `level` of every rule answered
"yes" with P ≥ 0.5 (`safe < needs_confirm < dangerous`). A matching rule can only make
the final rating riskier, never safer. If the model's reply is missing an answer, `check`
treats it as the risky case.

## Development

```sh
npm test          # unit and server tests (mock System One server, no network)
npm run smoke     # live calls against the configured endpoint; costs tokens
```

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, tests and
pull request guidelines. Coding agents should also read [AGENTS.md](AGENTS.md).

## License

Licensed under either of

- Apache License, Version 2.0 ([LICENSE-APACHE](LICENSE-APACHE))
- MIT License ([LICENSE-MIT](LICENSE-MIT))

at your option.
