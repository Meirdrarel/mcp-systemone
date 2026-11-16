#!/bin/sh
# Start mcp-systemone for an MCP client that launches servers without a login shell
# (Claude Code, Codex, ...), so nvm's Node is not on PATH and `npx` is not found.
#
# - The API key comes from the macOS Keychain: it never sits in the client config, a file
#   or a command line. Store it once with
#       security add-generic-password -s systemone-api-key -a "$USER" -w
#   On Linux with libsecret, replace the `security ...` command below with
#       secret-tool lookup service systemone-api-key
# - Node >= 24 is taken from nvm's `default` alias at each start, so the wrapper follows
#   `nvm alias default` and Node upgrades instead of pinning ~/.nvm/versions/node/vX.Y.Z.
#
# Register it with: claude mcp add --scope user systemone /abs/path/to/mcp-systemone-wrapper.sh
set -eu

SYSTEMONE_API_KEY="$(security find-generic-password -s systemone-api-key -w)" || {
    echo "mcp-systemone-wrapper: cannot read the keychain item systemone-api-key" >&2
    exit 1
}
export SYSTEMONE_API_KEY
export SYSTEMONE_BASE_URL="${SYSTEMONE_BASE_URL:-https://ollama.com}"

NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] || {
    echo "mcp-systemone-wrapper: nvm not found in $NVM_DIR (set NVM_DIR)" >&2
    exit 1
}
set +u # nvm.sh reads unset variables
. "$NVM_DIR/nvm.sh" --no-use
NODE="$(nvm which default)" || {
    echo "mcp-systemone-wrapper: nvm has no default Node (run: nvm alias default 24)" >&2
    exit 1
}
set -u
NODE_BIN="$(dirname "$NODE")"
# npx's shebang is `env node`, so the chosen Node must come first on PATH.
export PATH="$NODE_BIN:$PATH"
exec "$NODE_BIN/npx" -y mcp-systemone "$@"
