export const USE_AQUA_TRAIT = 1n << 254n;
export const ORDER_DATA_SLICES_INDEXES_BIT_OFFSET = 160n;

export function buildProgramSliceTraits(useAqua = true): bigint {
  return useAqua ? USE_AQUA_TRAIT : 0n;
}

export function prependPayloadToProgram(payload: Uint8Array, program: Uint8Array): Uint8Array {
  const out = new Uint8Array(payload.length + program.length);
  out.set(payload, 0);
  out.set(program, payload.length);
  return out;
}
