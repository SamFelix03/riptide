import { describe, it } from "vitest";
import { diamondSplit, dutchAuctionBalanceIn } from "../../src/diamondSplit.js";
import { bi, expectWad, loadVector } from "./vectors.js";

describe("diamond split vectors", () => {
  const file = loadVector("diamond_split_v1.json");
  for (const c of file.cases) {
    it(c.id, () => {
      const { payToResolver, retainToLP } = diamondSplit(bi(c.inputs.surplusWad), bi(c.inputs.beta));
      expectWad(payToResolver, c.outputs!.payToResolver);
      expectWad(retainToLP, c.outputs!.retainToLP);
      const dutch = dutchAuctionBalanceIn(bi("1000000000000000000000"), bi("990000000000000000"), 100);
      expectWad(dutch, c.outputs!.dutchBalanceIn);
    });
  }
});
