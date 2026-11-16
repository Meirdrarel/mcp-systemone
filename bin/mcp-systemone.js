#!/usr/bin/env node
// CLI entry point installed by npm. It does not rely on `argv[1]` matching the module URL,
// which fails when npm runs it through a `.bin` symlink.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createServer } from "../src/server.js";

try {
  await createServer().connect(new StdioServerTransport());
} catch (error) {
  console.error("systemone mcp server error:", error);
  process.exit(1);
}
