import { describe, expect, it } from "vitest";

import { checkSubgraphReachable } from "../src/subgraph/discovery.js";

describe("subgraph reachability", () => {
  it("returns false when the subgraph is unreachable", async () => {
    expect(await checkSubgraphReachable("http://127.0.0.1:1/graphql")).toBe(false);
  });
});
