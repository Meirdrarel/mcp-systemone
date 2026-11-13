# Contributing

Thanks for helping improve mcp-systemone. Bug reports, fixes, documentation and new
ideas are all welcome.

## Before you start

- **Bugs:** open an issue with what you ran, what you expected, and what happened.
  Include the tool name, its arguments, and the full error text.
- **Features or behavior changes:** open an issue first so the approach can be agreed
  before you write code. Changes to the risk logic in `check` get extra scrutiny (see
  "Rules that must not break" in [AGENTS.md](AGENTS.md)).
- **Small fixes** (typos, docs, obvious bugs): a pull request on its own is fine.

## Setup

Requires Node.js 24 or newer.

```sh
git clone https://github.com/Meirdrarel/mcp-systemone.git
cd mcp-systemone
npm ci
npm test
```

`npm test` uses a local mock System One server and needs no network or model.
`npm run smoke` calls the real endpoint configured by the `SYSTEMONE_*` environment
variables. It is optional and costs tokens.

## Making a change

1. Create a branch from `main`.
2. Write a failing test first, then the code that makes it pass. Every behavior change
   or bug fix comes with a test.
3. Keep tests offline: use `test/mock_systemone.mjs`, never a real model or API key.
4. Run `npm test` and make sure everything passes.
5. Update `README.md` when you change a tool, an environment variable, or the
   `.systemone.json` format, and add a line to `CHANGELOG.md` under "Unreleased".

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/) prefixes:

- `feat:` new behavior
- `fix:` bug fix
- `docs:` documentation only
- `test:` tests only
- `refactor:` code change without behavior change
- `chore:` tooling, CI, dependencies

Example: `fix: reject blank risk rule descriptions from the caller`.

## Pull requests

- One topic per pull request.
- Describe what changed and why, and how you tested it.
- CI must pass (`npm ci` and `npm test` on Linux and macOS).

## License

By contributing, you agree that your contributions are dual-licensed under the
[MIT License](LICENSE-MIT) and the [Apache License 2.0](LICENSE-APACHE), as the rest
of the project is, without any additional terms or conditions.
