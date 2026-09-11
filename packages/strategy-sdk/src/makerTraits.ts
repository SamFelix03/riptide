import { PAYLOAD_LENGTH } from "./codec.js";

/** `USE_AQUA_INSTEAD_OF_SIGNATURE_BIT_FLAG` — MakerTraits.sol:30 (swap-vm v1.0.2). */
export const USE_AQUA_TRAIT = 1n << 254n;

/** `ORDER_DATA_SLICES_INDEXES_BIT_OFFSET` — MakerTraits.sol:41. */
export const ORDER_DATA_SLICES_INDEXES_BIT_OFFSET = 160n;

/**
 * Bit offset of the slice index that marks where the SwapVM program starts.
 *
 * `OrderDataSlices` has five members (PreTransferInHook, PostTransferInHook,
 * PreTransferOutHook, PostTransferOutHook, Program) and `_getStartOffset(Program)` reads
 * index `Program - 1 = 3`, which sits at `160 + 16 * 3 = 208`.
 */
export const PROGRAM_OFFSET_SHIFT = 208n;

/**
 * Build the `traits` word for a RIPTIDE order.
 *
 * Mirrors `RiptideMakerTraits.buildOrder` (contracts/src/core/RiptideMakerTraits.sol)
 * exactly. RIPTIDE carries its 226-byte policy payload *in front of* the program and
 * points the program slice at byte 226, so the payload is committed into the Aqua
 * strategy hash while the VM still executes only the program.
 *
 * Note this is deliberately not what `MakerTraitsLib.build` produces: that derives slice
 * indexes from actual hook data, and with no hooks it emits zeros. 1inch's
 * `@1inch/swap-vm-sdk` normalises the same way, which is why `Order.encode()` from the
 * SDK cannot round-trip a RIPTIDE order — it would drop the payload and change the
 * strategy hash. Order construction therefore stays with RIPTIDE's own codec; the SDK is
 * used for the program itself (see test/sdk-program-parity.test.ts).
 */
export function buildProgramSliceTraits(useAqua = true, payloadLength: number = PAYLOAD_LENGTH): bigint {
  const aquaBit = useAqua ? USE_AQUA_TRAIT : 0n;
  return aquaBit | (BigInt(payloadLength) << PROGRAM_OFFSET_SHIFT);
}

export function prependPayloadToProgram(payload: Uint8Array, program: Uint8Array): Uint8Array {
  const out = new Uint8Array(payload.length + program.length);
  out.set(payload, 0);
  out.set(program, payload.length);
  return out;
}
