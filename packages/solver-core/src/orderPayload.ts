import { decodeStrategy, PAYLOAD_LENGTH } from "@riptide/strategy-sdk";
import type { Strategy } from "@riptide/strategy-sdk";
import { decodeAbiParameters, hexToBytes } from "viem";

/**
 * Recover a full RIPTIDE strategy (policy, oracle config, fee provider, salt) from the
 * raw `abi.encode(ISwapVM.Order)` blob that Aqua emits in its `Shipped` event.
 *
 * This is the only way to price a strategy that is not hardcoded in the deployment
 * manifest: Aqua exposes balance getters only, and neither router stores the policy or
 * the salt. Without it the solver has to skip maker-shipped strategies entirely.
 *
 * Layout: `order.data` is the fixed 226-byte RIPTIDE payload followed by the SwapVM
 * program bytes. `decodeStrategy` validates magic/version/length and every policy bound,
 * so a malformed or foreign order throws rather than producing a half-valid strategy.
 *
 * `maker` is supplied separately because the payload deliberately omits it — identity
 * lives in the order envelope (see RiptideStrategyCodec.decode, which returns address(0)).
 */
export function decodeStrategyFromOrderBytes(
  orderBytes: `0x${string}`,
  maker: `0x${string}`,
): Strategy {
  const [order] = decodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          { name: "maker", type: "address" },
          { name: "traits", type: "uint256" },
          { name: "data", type: "bytes" },
        ],
      },
    ],
    orderBytes,
  );

  const data = hexToBytes(order.data as `0x${string}`);
  if (data.length < PAYLOAD_LENGTH) {
    throw new Error("order data shorter than RIPTIDE payload");
  }

  const strategy = decodeStrategy(data.slice(0, PAYLOAD_LENGTH));
  // decodeStrategy leaves maker zeroed; take it from the order envelope.
  return { ...strategy, maker: (order.maker as `0x${string}`) ?? maker };
}

/** Non-throwing variant: returns null when the blob is absent or not a RIPTIDE order. */
export function tryDecodeStrategyFromOrderBytes(
  orderBytes: string | null | undefined,
  maker: `0x${string}`,
): Strategy | null {
  if (!orderBytes || orderBytes === "0x") return null;
  try {
    return decodeStrategyFromOrderBytes(orderBytes as `0x${string}`, maker);
  } catch {
    return null;
  }
}
