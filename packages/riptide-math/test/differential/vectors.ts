import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../../test/vectors");

export type WadInterval = {
  ideal: string;
  direction: "floor" | "ceiling";
  floor: string;
  ceiling: string;
};

export type VectorCase = {
  id: string;
  inputs: Record<string, string>;
  outputs?: Record<string, WadInterval>;
  expect?: string;
  fn?: string;
};

export type VectorFile = {
  version: number;
  cases: VectorCase[];
};

export function loadVector(name: string): VectorFile {
  return JSON.parse(readFileSync(join(root, name), "utf8")) as VectorFile;
}

export function expectWad(actual: bigint, interval: WadInterval): void {
  const expected = interval.direction === "floor" ? BigInt(interval.floor) : BigInt(interval.ceiling);
  if (actual !== expected) {
    throw new Error(`expected ${expected} got ${actual}`);
  }
}

export const bi = (s: string) => BigInt(s);
