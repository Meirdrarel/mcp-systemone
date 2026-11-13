// Live smoke test: calls the System One endpoint configured by the SYSTEMONE_* environment variables.
// Manual only (`npm run smoke`); not part of `npm test`. Each call costs a few thousand input tokens.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createServer } from "../src/server.js";
import { readSettings } from "../src/settings.js";

const settings = readSettings();
console.log(`endpoint: ${settings.url}`);
console.log(`models: ${settings.model} (default), ${settings.fastModel} (fast)`);
console.log(`api key: ${settings.apiKey ? "set" : "not set"}`);

const server = createServer();
const client = new Client({ name: "smoke", version: "1.0.0" });
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

let failures = 0;

async function call(label, request) {
  console.log(`\n=== ${label} ===`);
  const result = await client.callTool(request);
  if (result.isError) {
    failures += 1;
    console.log("TOOL ERROR:", result.content[0].text);
    return;
  }
  console.log(result.content[0].text);
}

await call("route", {
  name: "route",
  arguments: { request: "The login form crashes when the email field is empty, fix it" },
});

await call("gate", {
  name: "gate",
  arguments: {
    kind: "plan",
    artifact:
      "Rename the `user_name` field to `username` in the GET /users/{id} response and update the web client to read the new field.",
    invariants: {
      "api-compat": "Public REST endpoints keep backward-compatible request and response shapes",
    },
  },
});

await call("check", {
  name: "check",
  arguments: {
    command: "git push --force origin main",
    risk_rules: { "force-push": { description: "Force-pushes to a shared branch", level: "dangerous" } },
  },
});

await call("decide", {
  name: "decide",
  arguments: {
    state: "Release build with -march=native must be deployed to heterogeneous hosts.",
    questions: {
      portable: {
        type: "noul",
        instructions: "Is the binary portable across CPU microarchitectures?",
        criteria: {
          false: "It runs only on the build host's microarchitecture or newer",
          true: "It runs on any x86-64 host",
        },
      },
    },
  },
});

await client.close();
await server.close();
process.exit(failures > 0 ? 1 : 0);
