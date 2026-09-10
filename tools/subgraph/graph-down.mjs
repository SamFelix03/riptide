#!/usr/bin/env node
/** Stop local Graph Node stack. */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const composeFile = path.join(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."),
  "subgraph/docker/docker-compose.yml",
);

execSync(`docker compose -f "${composeFile}" down`, { stdio: "inherit" });
