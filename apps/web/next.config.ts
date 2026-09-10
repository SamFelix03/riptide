import type { NextConfig } from "next";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

const nextConfig: NextConfig = {
  transpilePackages: ["@riptide/strategy-sdk", "@riptide/riptide-math"],
  serverExternalPackages: [
    "@riptide/contracts",
    "@riptide/frontend-api",
    "@riptide/solver-core",
    "@riptide/resolver-core",
    "pino-pretty",
    "lokijs",
    "encoding",
  ],
  experimental: {
    externalDir: true,
  },
  webpack: (config) => {
    const extras = ["pino-pretty", "lokijs", "encoding"];
    if (Array.isArray(config.externals)) {
      config.externals.push(...extras);
    }
    config.resolve.alias = {
      ...config.resolve.alias,
      wagmi: path.dirname(require.resolve("wagmi/package.json")),
      "@wagmi/core": path.dirname(require.resolve("@wagmi/core/package.json")),
      "@react-native-async-storage/async-storage": false,
    };
    return config;
  },
};

export default nextConfig;
