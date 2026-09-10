import { fallback, http, type Transport } from "viem";

const DEFAULT_TIMEOUT_MS = 10_000;

export type RpcTransportOpts = {
  rpcUrl: string;
  rpcUrlFallback?: string;
  timeoutMs?: number;
};

export function createRpcTransport(opts: RpcTransportOpts): Transport {
  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const primary = http(opts.rpcUrl, { timeout });
  if (opts.rpcUrlFallback) {
    return fallback([primary, http(opts.rpcUrlFallback, { timeout })]);
  }
  return primary;
}
