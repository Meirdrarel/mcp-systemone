# mcp-systemone

An MCP server that gives coding agents four quick judgment tools backed by a
System One model (by default `clef` and `clef-flash`):

| Tool | Asks | Returns |
|---|---|---|
| `route` | Which workflow fits this request? | workflow, `needs_clarification`, urgency score |
| `gate` | Is this plan / design / diff ready? Does it touch or break an invariant? | `ready`, verdict, `touches_invariants`, `violated` |
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

No install step is needed: the agent setups below run the published package with
`npx -y mcp-systemone`, which downloads it on first use.

To pin it globally instead:

```sh
npm install -g mcp-systemone   # then use `mcp-systemone` as the command
```

Or run from a clone:

```sh
git clone https://github.com/Meirdrarel/mcp-systemone.git
cd mcp-systemone
npm ci
node bin/mcp-systemone.js     # stdio transport
```

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
| `SYSTEMONE_MIN_CONFIDENCE` | `0.2` | 0 to 1. Answers below it are listed as low confidence (see [Confidence](#confidence)). |
| `SYSTEMONE_CONFIG` | — | Explicit path to a `.systemone.json`. |

Blank values count as unset.

### Hosted Ollama

```sh
SYSTEMONE_BASE_URL=https://ollama.com
SYSTEMONE_API_KEY=<your ollama.com API key>
```

## Agent setup

Add `SYSTEMONE_*` variables as needed. From a clone, replace `npx -y mcp-systemone` with
`node /abs/path/to/mcp-systemone/bin/mcp-systemone.js`.

### Claude Code

```sh
claude mcp add --transport stdio systemone -- npx -y mcp-systemone
```

With a hosted endpoint (keep `--transport stdio` between the `--env` pairs and the name):

```sh
claude mcp add --env SYSTEMONE_BASE_URL=https://ollama.com --env SYSTEMONE_API_KEY=<key> \
  --transport stdio systemone -- npx -y mcp-systemone
```

Add `--scope user` to enable it in every project.

#### Key from a secret store, Node from nvm

Claude Code starts the server without a login shell, so `npx` from nvm is often not on
`PATH`, and `--env SYSTEMONE_API_KEY=<key>` stores the key in plain text in the client
config. [`examples/mcp-systemone-wrapper.sh`](examples/mcp-systemone-wrapper.sh) handles
both: it reads the key from the macOS Keychain (the script's comments show the Linux
libsecret line), resolves nvm's `default` Node at each start instead of a pinned
`~/.nvm/versions/node/vX.Y.Z`, and execs `npx -y mcp-systemone`. It stops with an error if
the key or Node cannot be found. Copy it from the repository, then:

```sh
security add-generic-password -s systemone-api-key -a "$USER" -w   # prompts for the key
chmod +x ~/.local/bin/mcp-systemone-wrapper.sh
claude mcp add --scope user systemone ~/.local/bin/mcp-systemone-wrapper.sh
```

Other clients can use the same script as their `command`.

### Codex

`~/.codex/config.toml`:

```toml
[mcp_servers.systemone]
command = "npx"
args = ["-y", "mcp-systemone"]
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
        "command": ["npx", "-y", "mcp-systemone"],
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

`check` always asks the fixed base `risk` question, in its own request that never contains
rule text. Each rule is one yes/no question, asked in a second, parallel request;
`final_risk` is the highest of the base rating and the `level` of every rule answered
"yes" with P ≥ 0.5 (`safe < needs_confirm < dangerous`). A repository or an agent can make
a command look riskier, never safer. If the model's reply is missing an answer, `check`
treats it as the risky case.

The base levels follow reversibility. `safe` covers only local commands that read or are
trivially reversible; read-only remote queries such as `git fetch` or `gh pr list` usually
rate `safe` too, but a push never does. Pushing to a new or existing feature branch is
`needs_confirm`; force pushes, pushes to the default or a protected branch, deleting remote
branches or tags, and publishing a release or package are `dangerous`. The model only sees
the command and its context: a bare `git push` with no context tends toward `dangerous`, so
pass the current branch in `context`, or add a risk rule for pushes to the default branch.

The first line names the rules involved: `raised by` lists the rules that set `final_risk`
above the base rating, and `matched` lists every rule answered "yes", including those at or
below the base, e.g. `final_risk: dangerous (matched: shared-branch)`. The JSON has the same
in `computed.final_risk.raisedBy` and `computed.final_risk.matched` (`[{id, level}]`).

### `gate` wording follows `kind`

With `kind: "diff"` or `kind: "mr"`, `ready` and `verdict` ask whether the change is ready
to merge (approve = "Correct and ready to merge"). With `plan`, `design` or no `kind`, they
ask whether the plan is concrete enough to implement. Invariant questions are the same for
every kind.

### Touched vs. violated invariants

Each invariant first gets a relevance question, `invariant.<id>`: does the change touch it?
Those answered "yes" (P ≥ 0.5) are listed in `touches_invariants.flagged`. Only when at least
one is flagged, `gate` sends a second request with one `holds.<id>` question per flagged
invariant: after this change, does it still hold? `violated` lists the flagged invariants with
P(holds) < 0.5; a missing answer counts as violated.

```
touches_invariants: yes (P=0.9; flagged: b, c; holds: b P=0.95, c P=0.2)
violated: c
```

`violated` catches a break the artifact shows, such as an added override. A break by
omission, a file that should have changed but is absent from the diff, can still come out as
holding, so treat a flagged invariant that holds as "check it", not as cleared. The JSON has
`computed.touches_invariants.holds` (`{id: P}`) and `computed.violated` (`[id]`).

### Confidence

Each choice answer carries probabilities over its options; each yes/no (noul) answer carries
P(true). `route`, `gate` and `check` score how decided every choice and noul answer is:

```
confidence = (Σ pᵢ² − 1/k) / (1 − 1/k)      k = number of options
           = (2p − 1)²                       for a yes/no answer (k = 2)
```

It is 0 when every option is equally likely and 1 when one option has all the probability,
whatever the number of options. It is not the probability that the answer is right: P=0.82
with the rest split between two options gives about 0.55. For choice answers it equals the
`confidence` field the endpoint reports.

Answers below `SYSTEMONE_MIN_CONFIDENCE` (default 0.2; for a yes/no answer, P between about
0.28 and 0.72) are listed in `computed.uncertain` and on a line such as

```
low confidence: risk, holds.c (ask the user)
```

A missing or malformed answer is listed too. The list never changes `final_risk`,
`touches_invariants` or `violated`: it tells the agent to confirm with the user before acting
on those answers. `urgency` (a score) and `decide` answers are not scored.

## Development

```sh
npm test          # unit and server tests (mock System One server, no network)
npm run smoke     # live calls against the configured endpoint; costs tokens
```

### Releasing

A release is one commit and one annotated tag on `main`:

1. On an up-to-date `main` with a clean tree, add a `## [X.Y.Z] - YYYY-MM-DD` heading right
   under `## [Unreleased]`, so the unreleased entries move under it and `Unreleased` is empty.
2. `npm version <patch|minor|major> --no-git-tag-version` bumps `package.json` and
   `package-lock.json` without committing or tagging.
3. `npm test`, then commit `CHANGELOG.md`, `package.json` and `package-lock.json` as
   `chore: release X.Y.Z`.
4. `git tag -a vX.Y.Z -m vX.Y.Z`, then `git push origin main vX.Y.Z`.

The `Release` workflow checks that the tag matches `package.json`, runs the tests and
publishes to npm through trusted publishing, with provenance. The new version can take a few
minutes to appear on npm after the workflow succeeds.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, tests and
pull request guidelines. Coding agents should also read [AGENTS.md](AGENTS.md).

## License

Licensed under either of

- Apache License, Version 2.0 ([LICENSE-APACHE](LICENSE-APACHE))
- MIT License ([LICENSE-MIT](LICENSE-MIT))

at your option.
