#!/usr/bin/env node
import { loadConfig } from "./config.js";
import { startHealthServer } from "./health.js";
import { startMcpServer } from "./server.js";

const config = loadConfig();
startHealthServer(config);

startMcpServer().catch((err) => {
  console.error(err);
  process.exit(1);
});
