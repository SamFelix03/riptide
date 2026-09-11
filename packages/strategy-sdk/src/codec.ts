import type { Strategy } from "./types.js";

export const MAGIC = 0x52505431;
export const VERSION = 1;
export const PAYLOAD_LENGTH = 226;
export const BPS = 10_000_000n;
export const WAD = 1_000_000_000_000_000_000n;

function writeUint(buf: Uint8Array, offset: number, value: bigint, bytes: number): void {
  for (let i = 0; i < bytes; i++) {
    buf[offset + i] = Number((value >> BigInt(8 * (bytes - 1 - i))) & 0xffn);
  }
}

function readUint(buf: Uint8Array, offset: number, bytes: number): bigint {
  let v = 0n;
  for (let i = 0; i < bytes; i++) {
    v = (v << 8n) | BigInt(buf[offset + i]!);
  }
  return v;
}

function writeAddress(buf: Uint8Array, offset: number, addr: `0x${string}`): void {
  const hex = addr.slice(2).padStart(40, "0");
  for (let i = 0; i < 20; i++) {
    buf[offset + i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
}

function readAddress(buf: Uint8Array, offset: number): `0x${string}` {
  const hex = Array.from(buf.slice(offset, offset + 20))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `0x${hex}` as `0x${string}`;
}

function writeBytes32(buf: Uint8Array, offset: number, value: `0x${string}`): void {
  const hex = value.slice(2).padStart(64, "0");
  for (let i = 0; i < 32; i++) {
    buf[offset + i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
}

function readBytes32(buf: Uint8Array, offset: number): `0x${string}` {
  const hex = Array.from(buf.slice(offset, offset + 32))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `0x${hex}` as `0x${string}`;
}

export function validateStructure(s: Strategy): void {
  if (s.baseToken === "0x0" || s.quoteToken === "0x0" || s.oracle.feed === "0x0" || s.feeProvider === "0x0") {
    throw new Error("RiptideZeroAddress");
  }
  if (s.baseToken.toLowerCase() === s.quoteToken.toLowerCase()) {
    throw new Error("RiptideIdenticalTokens");
  }
  if (s.fee.feeMin === 0n || s.fee.feeMin >= s.fee.feeMax || s.fee.feeMax >= BPS) {
    throw new Error("RiptideInvalidFeeBounds");
  }
  if (s.fee.lambda === 0n || s.fee.lambda >= WAD) {
    throw new Error("RiptideInvalidLambda");
  }
  if (s.fee.sigmaMin >= s.fee.sigmaMax) {
    throw new Error("RiptideInvalidSigmaBounds");
  }
  if (s.auction.beta === 0n || s.auction.beta >= WAD) {
    throw new Error("RiptideInvalidBeta");
  }
  if (s.auction.decay === 0n || s.auction.decay >= WAD) {
    throw new Error("RiptideInvalidDecay");
  }
}

export function encodeStrategy(s: Strategy): Uint8Array {
  validateStructure(s);
  const buf = new Uint8Array(PAYLOAD_LENGTH);
  writeUint(buf, 0, BigInt(MAGIC), 4);
  buf[4] = VERSION;
  writeAddress(buf, 5, s.baseToken);
  writeAddress(buf, 25, s.quoteToken);
  writeBytes32(buf, 45, s.salt);
  writeUint(buf, 77, s.reserveBaseWad, 16);
  writeUint(buf, 93, s.reserveQuoteWad, 16);
  writeUint(buf, 109, s.fee.feeMin, 3);
  writeUint(buf, 112, s.fee.feeMax, 3);
  writeUint(buf, 115, s.fee.lambda, 8);
  writeUint(buf, 123, s.fee.kp, 8);
  writeUint(buf, 131, s.fee.ki, 8);
  writeUint(buf, 139, s.fee.iMax, 8);
  writeUint(buf, 147, s.fee.sigmaMin, 8);
  writeUint(buf, 155, s.fee.sigmaMax, 8);
  writeUint(buf, 163, s.auction.beta, 8);
  writeUint(buf, 171, BigInt(s.auction.duration), 2);
  writeUint(buf, 173, s.auction.decay, 8);
  writeUint(buf, 181, BigInt(s.auction.antiSandwichPeriod), 2);
  writeAddress(buf, 183, s.oracle.feed);
  buf[203] = s.oracle.decimals & 0xff;
  writeUint(buf, 204, BigInt(s.oracle.maxStaleness), 2);
  writeAddress(buf, 206, s.feeProvider);
  return buf;
}

export function decodeStrategy(payload: Uint8Array): Strategy {
  if (payload.length !== PAYLOAD_LENGTH) {
    throw new Error("RiptideInvalidEncodingLength");
  }
  const magic = readUint(payload, 0, 4);
  if (magic !== BigInt(MAGIC)) {
    throw new Error("RiptideInvalidEncodingMagic");
  }
  if (payload[4] !== VERSION) {
    throw new Error("RiptideUnsupportedEncodingVersion");
  }
  const s: Strategy = {
    maker: "0x0000000000000000000000000000000000000000",
    baseToken: readAddress(payload, 5),
    quoteToken: readAddress(payload, 25),
    salt: readBytes32(payload, 45),
    reserveBaseWad: readUint(payload, 77, 16),
    reserveQuoteWad: readUint(payload, 93, 16),
    fee: {
      feeMin: readUint(payload, 109, 3),
      feeMax: readUint(payload, 112, 3),
      lambda: readUint(payload, 115, 8),
      kp: readUint(payload, 123, 8),
      ki: readUint(payload, 131, 8),
      iMax: readUint(payload, 139, 8),
      sigmaMin: readUint(payload, 147, 8),
      sigmaMax: readUint(payload, 155, 8),
    },
    auction: {
      beta: readUint(payload, 163, 8),
      duration: Number(readUint(payload, 171, 2)),
      decay: readUint(payload, 173, 8),
      antiSandwichPeriod: Number(readUint(payload, 181, 2)),
    },
    oracle: {
      feed: readAddress(payload, 183),
      decimals: payload[203]!,
      maxStaleness: Number(readUint(payload, 204, 2)),
    },
    feeProvider: readAddress(payload, 206),
  };
  validateStructure(s);
  return s;
}
