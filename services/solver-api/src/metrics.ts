export type MetricsSnapshot = {
  requestsTotal: number;
  simulateSuccess: number;
  simulateFail: number;
  lastRpcLatencyMs: number;
};

const metrics: MetricsSnapshot = {
  requestsTotal: 0,
  simulateSuccess: 0,
  simulateFail: 0,
  lastRpcLatencyMs: 0,
};

export function incRequests(): void {
  metrics.requestsTotal += 1;
}

export function recordSimulate(ok: boolean): void {
  if (ok) metrics.simulateSuccess += 1;
  else metrics.simulateFail += 1;
}

export function recordRpcLatency(ms: number): void {
  metrics.lastRpcLatencyMs = ms;
}

export function renderPrometheus(): string {
  return [
    `# HELP solver_requests_total Total HTTP requests`,
    `# TYPE solver_requests_total counter`,
    `solver_requests_total ${metrics.requestsTotal}`,
    `# HELP solver_simulate_success_total Successful eth_call simulations`,
    `# TYPE solver_simulate_success_total counter`,
    `solver_simulate_success_total ${metrics.simulateSuccess}`,
    `# HELP solver_simulate_fail_total Failed eth_call simulations`,
    `# TYPE solver_simulate_fail_total counter`,
    `solver_simulate_fail_total ${metrics.simulateFail}`,
    `# HELP solver_rpc_latency_ms Last RPC round-trip latency`,
    `# TYPE solver_rpc_latency_ms gauge`,
    `solver_rpc_latency_ms ${metrics.lastRpcLatencyMs}`,
  ].join("\n");
}

export function getMetrics(): MetricsSnapshot {
  return { ...metrics };
}
