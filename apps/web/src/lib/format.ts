import { formatUnits, parseUnits, type Address } from "viem";

export function formatUnitsSafe(value: bigint, decimals = 18, digits = 4): string {
  try {
    const formatted = formatUnits(value, decimals);
    if (!formatted.includes(".")) return formatted;
    const [whole, frac = ""] = formatted.split(".");
    const trimmed = frac.slice(0, digits).replace(/0+$/, "");
    return trimmed ? `${whole}.${trimmed}` : whole ?? formatted;
  } catch {
    return value.toString();
  }
}

/** Full-precision editor display: trims trailing zeros, never JS number. */
export function formatUnitsTrimmed(value: bigint, decimals = 18): string {
  try {
    const formatted = formatUnits(value, decimals);
    if (!formatted.includes(".")) return formatted;
    return formatted.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  } catch {
    return value.toString();
  }
}

export function formatAddress(address: Address | string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function formatHash(hash: string, head = 10, tail = 8): string {
  if (hash.length <= head + tail) return hash;
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

export function formatWad(value: string | bigint, digits = 4): string {
  try {
    const v = typeof value === "bigint" ? value : BigInt(value);
    const formatted = formatUnits(v, 18);
    if (!formatted.includes(".")) return formatted;
    const [whole, frac = ""] = formatted.split(".");
    const trimmed = frac.slice(0, digits).replace(/0+$/, "");
    return trimmed ? `${whole}.${trimmed}` : whole ?? formatted;
  } catch {
    return String(value);
  }
}

export function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

/** Protocol fee units: 1e7 = 100%. Display as the studio's "bps" field (value / 1e5). */
export function formatFeeField(value: bigint): string {
  return (Number(value) / 1e5).toFixed(2);
}

export function wadToNumber(value: string | bigint): number {
  try {
    const v = typeof value === "bigint" ? value : BigInt(value || "0");
    return Number(v) / 1e18;
  } catch {
    return 0;
  }
}

export function parseTokenInput(raw: string, decimals = 18): bigint | null {
  const s = raw.trim();
  if (!s) return 0n;
  try {
    return parseUnits(s, decimals);
  } catch {
    return null;
  }
}

export function parseFeeField(raw: string): bigint | null {
  const n = Number(raw.trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return BigInt(Math.round(n * 1e5));
}

/** Alias: studio fee fields are labeled bps (value / 1e5). */
export function parseBpsInput(raw: string): bigint | null {
  return parseFeeField(raw);
}

export function parseUnitInput(raw: string): number | null {
  const n = Number(raw.trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}
