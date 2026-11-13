# AGENTS.md

Guidance for coding agents working on this repository. Human contributors: see
[CONTRIBUTING.md](CONTRIBUTING.md).

## What this is

An MCP stdio server (Node.js 24, ESM, no build step) exposing four tools — `route`,
`gate`, `check`, `decide` — that forward typed questions to a System One endpoint
(`POST {model, state, questions}` → `{answers}`) and format the answers.

## Commands

```sh
npm ci            # install
npm test          # all tests (node:test, offline, ~1s)
node --test test/questions.test.mjs   # one file
npm run smoke     # live calls to the configured endpoint — only when asked; costs tokens
```

## Layout

| Path | Role |
|---|---|
| `src/server.js` | MCP server: tool schemas and wiring. Resolves settings and project config on every call. |
| `src/settings.js` | `SYSTEMONE_*` environment variables → connection settings. Pure (takes `env`). |
| `src/client.js` | HTTP call to System One and its actionable error messages. |
| `src/project-config.js` | `.systemone.json` discovery, validation, mtime cache. |
| `src/questions.js` | Question builders, caller merge rule, computed `touches_invariants` / `final_risk`. |
| `src/format.js` | Text output: computed lines, per-answer lines, raw JSON, `config:` footer. |
| `test/mock_systemone.mjs` | Local mock endpoint used by all tests. |
| `test/smoke.mjs` | Manual live check, not part of `npm test`. |
| `examples/.systemone.json` | Example project config; a test keeps it valid. |

## Rules that must not break

- **Risk only goes up.** `final_risk` is the maximum of the base `risk` answer and every
  triggered rule. Nothing from `.systemone.json` or a tool argument may lower it or reword
  the base `risk` question.
- **Fail closed.** A missing or malformed answer counts as the risky case (`dangerous`
  base, triggered rule, touched invariant).
- **No silent fallback.** An invalid or missing config (including a missing
  `SYSTEMONE_CONFIG` target) is a tool error naming the file, never a quiet return to
  defaults.
- **Caller can only add.** Tool arguments add invariants and risk rules; they never replace
  project entries, and id collisions are errors. `route` accepts no `workflows` argument.
- **Every tool result ends with** `config: <path>` or `config: none (defaults)`.
- **No secrets in files.** Endpoints and keys come from environment variables only. Never
  read `OLLAMA_API_KEY`.

## Conventions

- Test first: add or change a test, watch it fail, then change the code.
- Keep functions pure where possible: pass `env`, `cwd`, `roots` explicitly instead of
  reading `process.env` / `process.cwd()` deep inside modules.
- Tests stay offline and use temporary directories for config fixtures.
- Examples in code, tests and docs are generic (no real company, product or person).
- Commit messages use Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`,
  `refactor:`, `chore:`).
- When you change a tool, an environment variable or the config format, update
  `README.md` and `CHANGELOG.md`.
