import type { FillAllocation, RouteCertificate, StrategyCandidate } from "./types.js";

export function attachExpectedVersions(
  fills: FillAllocation[],
  candidates: StrategyCandidate[],
  indexedBlock: bigint,
  refreshedAt: number,
): RouteCertificate {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const certified: FillAllocation[] = fills.map((f) => {
    const c = byId.get(f.candidateId);
    if (!c) throw new Error(`unknown candidate ${f.candidateId}`);
    return { ...f, expectedVersion: c.swapVersion };
  });
  return { fills: certified, indexedBlock, refreshedAt };
}

export function detectStaleCertificate(
  certificate: RouteCertificate,
  liveCandidates: StrategyCandidate[],
): string[] {
  const live = new Map(liveCandidates.map((c) => [c.id, c.swapVersion]));
  const stale: string[] = [];
  for (const fill of certificate.fills) {
    const liveVersion = live.get(fill.candidateId);
    if (liveVersion === undefined) {
      stale.push(fill.candidateId);
      continue;
    }
    if (liveVersion !== fill.expectedVersion) {
      stale.push(fill.candidateId);
    }
  }
  return stale;
}
