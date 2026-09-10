import { z } from "zod";
import { getAddress, isAddress } from "viem";

const hex32 = z.string().regex(/^0x[a-fA-F0-9]{64}$/);

const addressSchema = z
  .string()
  .refine((value) => isAddress(value), { message: "Invalid address" })
  .transform((value) => getAddress(value));

export const seededStrategySchema = z.object({
  id: z.string().min(1),
  maker: addressSchema,
  salt: hex32,
  strategyKey: hex32,
  orderHash: hex32,
});

export const deploymentManifestSchema = z
  .object({
    chainId: z.number().int().positive(),
    name: z.string().min(1),
    blockNumber: z.number().int().nonnegative(),
    commit: z.string(),
    aqua: addressSchema,
    swapRouter: addressSchema,
    rebalanceRouter: addressSchema,
    kernel: addressSchema,
    oracle: addressSchema,
    feeProvider: addressSchema,
    settler: addressSchema,
    quoter: addressSchema,
    lens: addressSchema,
    batchExecutor: addressSchema,
    demoTokens: z
      .object({
        base: addressSchema,
        quote: addressSchema,
      })
      .refine((tokens) => tokens.base !== tokens.quote, {
        message: "demoTokens.base and demoTokens.quote must differ",
      }),
    seededStrategies: z.array(seededStrategySchema),
    chainlinkFeed: addressSchema.optional(),
    demoResolver: addressSchema.optional(),
    subgraphUrl: z.string(),
    rpcUrl: z.string().url(),
    explorerUrl: z.string(),
  })
  .strict();

export type DeploymentManifest = z.infer<typeof deploymentManifestSchema>;
export type SeededStrategy = z.infer<typeof seededStrategySchema>;
