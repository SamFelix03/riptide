# End-to-end run — transaction ledger

Every transaction below was produced by one uninterrupted run of
[`tools/demo/e2e-live.mjs`](../tools/demo/e2e-live.mjs) against the deployed app. The script
talks only to the HTTP surface the browser uses — `/api/config`, `/api/riptide`,
`/api/riptide/simulate` — and signs with two wallets generated at the start of the run,
so nothing here depends on a pre-funded or pre-approved account.

| | |
|---|---|
| App | https://riptide-web-production-77f7.up.railway.app |
| Chain | base-sepolia (`84532`) · [explorer](https://sepolia.basescan.org) |
| Subgraph | https://api.studio.thegraph.com/query/1758400/riptide/version/latest |
| Run started | 2026-09-12T23:18:38.962Z |
| Run finished | 2026-09-12T23:20:23.660Z |
| Transactions | 20 · 5577893 gas total |
| Checks | 41/41 passed |

**Wallets, both created during the run**

| Role | Address |
|---|---|
| Maker | [`0x4cEae713AEE2Fc2874cf5247DB79Ec803a8348c4`](https://sepolia.basescan.org/address/0x4cEae713AEE2Fc2874cf5247DB79Ec803a8348c4) |
| Taker / resolver | [`0xc3a0AED8BB5346177eBb3579593717274A78E0ad`](https://sepolia.basescan.org/address/0xc3a0AED8BB5346177eBb3579593717274A78E0ad) |
| Deployer (gas faucet, Chainlink feed owner) | [`0x2514844F312c02Ae3C9d4fEb40db4eC8830b6844`](https://sepolia.basescan.org/address/0x2514844F312c02Ae3C9d4fEb40db4eC8830b6844) |

## Contracts exercised

| Contract | Address |
|---|---|
| Aqua | [`0xa6e7714D9956D88C4f26C19a481b12bB60B90Ed2`](https://sepolia.basescan.org/address/0xa6e7714D9956D88C4f26C19a481b12bB60B90Ed2) |
| RiptideSwapVMRouter | [`0xf51E8b2f5958Ca7702076923d6F0135027e51B06`](https://sepolia.basescan.org/address/0xf51E8b2f5958Ca7702076923d6F0135027e51B06) |
| RiptideRebalanceRouter | [`0x65e70C18845b411D456af79306609B474Da9eaAA`](https://sepolia.basescan.org/address/0x65e70C18845b411D456af79306609B474Da9eaAA) |
| RiptideLvrFeeProvider | [`0x188dC95578f7feE2639473DA75427c468ADCe395`](https://sepolia.basescan.org/address/0x188dC95578f7feE2639473DA75427c468ADCe395) |
| RiptideVolatilityOracle | [`0xDc44dE5E0c704511aa5073337B93E0478c563251`](https://sepolia.basescan.org/address/0xDc44dE5E0c704511aa5073337B93E0478c563251) |
| RiptideAuctionSettler | [`0x254DCF81bC0D6116b2e2421D252b9D47Efee2071`](https://sepolia.basescan.org/address/0x254DCF81bC0D6116b2e2421D252b9D47Efee2071) |
| RiptideBatchExecutor | [`0x7F36E1D8A0373cC6244D87816F238f43Db424415`](https://sepolia.basescan.org/address/0x7F36E1D8A0373cC6244D87816F238f43Db424415) |
| RiptideQuoter | [`0x0849a81fA8976e3d391d3F6AC8ed23Ac1E4e017A`](https://sepolia.basescan.org/address/0x0849a81fA8976e3d391d3F6AC8ed23Ac1E4e017A) |
| RiptideLens | [`0x3c5Cc60D38858865D947fd268d453bB219dbbEa8`](https://sepolia.basescan.org/address/0x3c5Cc60D38858865D947fd268d453bB219dbbEa8) |
| RiptideRebalanceKernel | [`0x8e9c8f4123dAfE31421Ef31efb2D24c039C504d2`](https://sepolia.basescan.org/address/0x8e9c8f4123dAfE31421Ef31efb2D24c039C504d2) |
| RBASE | [`0xCd75c96a6659d94004EFBe528D95eAF933A916be`](https://sepolia.basescan.org/address/0xCd75c96a6659d94004EFBe528D95eAF933A916be) |
| RQUOTE | [`0x5A2858D733295000199CA9030e4A094e9E9EF846`](https://sepolia.basescan.org/address/0x5A2858D733295000199CA9030e4A094e9E9EF846) |
| Mock Chainlink feed | [`0x92a149C90d5C43DF299F9db5F8F3c3cC7C7Edd0D`](https://sepolia.basescan.org/address/0x92a149C90d5C43DF299F9db5F8F3c3cC7C7Edd0D) |

## Transactions, in order

| # | Step | Sent by | To | Gas | Tx |
|---|---|---|---|---|---|
| 1 | fund maker (0.004 ETH) | deployer | `0x4ceae713aee2fc2874cf5247db79ec803a8348c4` | 21000 | [`0xfe176843e6c6767e…`](https://sepolia.basescan.org/tx/0xfe176843e6c6767eb606693ac7fcc9574893ce2d235992ef210faf6b06135057) |
| 2 | fund taker / resolver (0.004 ETH) | deployer | `0xc3a0aed8bb5346177ebb3579593717274a78e0ad` | 21000 | [`0xfe762acde0707d7b…`](https://sepolia.basescan.org/tx/0xfe762acde0707d7baa17e25215a00320f5c13f6854786428da91d95c16137440) |
| 3 | faucet RBASE | maker | `0xcd75c96a6659d94004efbe528d95eaf933a916be` | 52767 | [`0xcf4cdbffce9be13f…`](https://sepolia.basescan.org/tx/0xcf4cdbffce9be13f4a4fbfc71b688bd60e1deff0f5a35562f393dfa8c2bc6151) |
| 4 | faucet RQUOTE | maker | `0x5a2858d733295000199ca9030e4a094e9e9ef846` | 52755 | [`0x66e28dc76ea65978…`](https://sepolia.basescan.org/tx/0x66e28dc76ea65978ffa26f63a722e4ee16cb2803e215829dd2ba82a5bd3236ea) |
| 5 | faucet RQUOTE | taker / resolver | `0x5a2858d733295000199ca9030e4a094e9e9ef846` | 52755 | [`0x21cfe6600cdb7677…`](https://sepolia.basescan.org/tx/0x21cfe6600cdb76779fae619daacff6336fac2db69fbd0395d4af871b62946fdc) |
| 6 | ship · Approve base token for Aqua | maker | `0xcd75c96a6659d94004efbe528d95eaf933a916be` | 47415 | [`0x49d0257bffbafba8…`](https://sepolia.basescan.org/tx/0x49d0257bffbafba80e5a76040d2824f7ed61b237d33ba97e02a971c5ca11160f) |
| 7 | ship · Approve quote token for Aqua | maker | `0x5a2858d733295000199ca9030e4a094e9e9ef846` | 47427 | [`0xddba65e766d57c81…`](https://sepolia.basescan.org/tx/0xddba65e766d57c81812b5056955cbad581c14ab44d8ffcec8f7b999c738d3ae5) |
| 8 | ship · Aqua.ship swap order | maker | `0xa6e7714d9956d88c4f26c19a481b12bb60b90ed2` | 89582 | [`0x611297f4927fe926…`](https://sepolia.basescan.org/tx/0x611297f4927fe9268f3af91dc0f2d17eb382db22baa247e625c0a4b26cf2189f) |
| 9 | ship · Register strategy on swap router | maker | `0xf51e8b2f5958ca7702076923d6f0135027e51b06` | 331703 | [`0x8fcfa6c190ed4cb9…`](https://sepolia.basescan.org/tx/0x8fcfa6c190ed4cb9b81023ee4d7266dcfbce34f5ed73582e185d94300202dc80) |
| 10 | ship · Aqua.ship rebalance order | maker | `0xa6e7714d9956d88c4f26c19a481b12bb60b90ed2` | 90117 | [`0x20a9535ffcc2bd90…`](https://sepolia.basescan.org/tx/0x20a9535ffcc2bd9009e4aeb12d32fd397c7f95dc9d992383e848ce6f3ae1d5fc) |
| 11 | ship · Register swap order on rebalance router | maker | `0x65e70c18845b411d456af79306609b474da9eaaa` | 97117 | [`0xdf82b8049c5e0ecf…`](https://sepolia.basescan.org/tx/0xdf82b8049c5e0ecf8c19e5a0417f7e0c025c001ae10e742175fc04c79bfc6baa) |
| 12 | ship · Register rebalance order on rebalance router | maker | `0x65e70c18845b411d456af79306609b474da9eaaa` | 56740 | [`0x8ea473fada4950af…`](https://sepolia.basescan.org/tx/0x8ea473fada4950af96533a055fb53776a4cb4fd0bf49f322bd9d0f170a6477af) |
| 13 | ship · Set rebalance auction start | maker | `0x65e70c18845b411d456af79306609b474da9eaaa` | 51153 | [`0xac48c7eea8d2e25d…`](https://sepolia.basescan.org/tx/0xac48c7eea8d2e25d5e3eee1c96a006324f2cdb32dfe10fa65915291010e9af49) |
| 14 | swap · Approve quote token for the batch executor | taker / resolver | `0x5a2858d733295000199ca9030e4a094e9e9ef846` | 47715 | [`0xbad435b17df4da9c…`](https://sepolia.basescan.org/tx/0xbad435b17df4da9ca990c05dd73e5bd5c2d3f4c8d88f673499c3b99fa513d136) |
| 15 | swap · Execute batch swap route | taker / resolver | `0x7f36e1d8a0373cc6244d87816f238f43db424415` | 1914189 | [`0x8bc62535e677f05c…`](https://sepolia.basescan.org/tx/0x8bc62535e677f05c83782ff801800baea0d59341d3e2567045068c7ef25ca534) |
| 16 | swap exact-out · Execute batch swap route | taker / resolver | `0x7f36e1d8a0373cc6244d87816f238f43db424415` | 1901033 | [`0x015419aef86fffc4…`](https://sepolia.basescan.org/tx/0x015419aef86fffc4620ff5d434d4912db3e167c2637992ae6c33a0280a5df1ff) |
| 17 | skew demo Chainlink feed | deployer (feed owner) | `0x92a149c90d5c43df299f9db5f8f3c3cc7c7edd0d` | 29301 | [`0xf27a2a3c556c6912…`](https://sepolia.basescan.org/tx/0xf27a2a3c556c6912355d764ef5ad516e02384f8c102f1a1f82ca4ad1d405e6fb) |
| 18 | settle · Approve quote token for the settler | taker / resolver | `0x5a2858d733295000199ca9030e4a094e9e9ef846` | 47715 | [`0x88d8353ba8a31d70…`](https://sepolia.basescan.org/tx/0x88d8353ba8a31d70c56164ffc3f223c7fea51d7600e9f7f99bbb3644d6ae32d7) |
| 19 | settle · settleRebalance | taker / resolver | `0x254dcf81bc0d6116b2e2421d252b9d47efee2071` | 587927 | [`0x0ab95258f46f9bf6…`](https://sepolia.basescan.org/tx/0x0ab95258f46f9bf66fa13925b0c43cb0a393bae92a95b56a6a2b7f7497e3d8f0) |
| 20 | dock · Aqua.dock strategy | maker | `0xa6e7714d9956d88c4f26c19a481b12bb60b90ed2` | 38482 | [`0xdf107e51634c03ad…`](https://sepolia.basescan.org/tx/0xdf107e51634c03adc95fc9f25a4a5e2d82ec29ec33fe113138d9ce587d61c950) |

## Assertions

Each row is checked against on-chain state or the indexed data, not against a fixture.

| | Check | Observed |
|---|---|---|
| ✅ | fresh wallets funded from the faucet only |  |
| ✅ | listMarkets returns the demo market | RBASE-RQUOTE |
| ✅ | listStrategies returns the seeded pools | S2,0x6842861d,S3,S1,0xe373a0bc |
| ✅ | each listed pool exposes both identifiers | strategyKey + orderHash |
| ✅ | getStrategy returns live Aqua reserves | aquaBase=99998343424792648245 |
| ✅ | getStrategyPreset rebuilds the committed policy | salt=0x0000000000000000000000000000000000000000000000000000000000000066 |
| ✅ | getControllerState reads sigma + fee from the provider | sigma=0 feeReported=30000 |
| ✅ | getFreshness reports the subgraph as the source | lag 6s |
| ✅ | ship plan carries approvals + both Aqua legs + registrations | 8 steps |
| ✅ | the new pool is discoverable right after shipping | 5 -> 6 strategies |
| ✅ | the new pool belongs to the fresh maker wallet | 0x7f685d909649dd87f58f7868f041ddc94f3d6b9c89a6a90e54b6b2baaf125f09 |
| ✅ | quoteSwap ExactInput returns a fee-bearing quote | out=2493667478348948 fee=20000 |
| ✅ | quoteSwap ExactOutput returns a fee-bearing quote | in=2005074595753221793 |
| ✅ | route splits across several makers | 0x7f685d90+S2+0x6842861d+S3+S1+0xe373a0bc |
| ✅ | route plan carries the approval for a fresh wallet | 2 steps |
| ✅ | taker receives exactly the quoted output | got 2493246737456121, expected 2493246737456121 |
| ✅ | taker pays exactly the quoted input | got 5000000000000000000, expected 5000000000000000000 |
| ✅ | second route needs no approval step | 1 steps |
| ✅ | eth_call simulation of the route passes | {} |
| ✅ | exact-out delivers the requested output | got 1000000000000000, expected 1000000000000000 |
| ✅ | open auctions are listed after the oracle moves | 2 open |
| ✅ | previewRebalance reports a profitable surplus | S=1639163330578493138 |
| ✅ | beta split conserves the surplus | got 1639163330578493138, expected 1639163330578493138 |
| ✅ | LP keeps at least beta of the surplus | retain=1589988430661138344 |
| ✅ | settler forwards the bought base to the caller | got 1000000000000000000, expected 1000000000000000000 |
| ✅ | settler holds no base afterwards | got 0, expected 0 |
| ✅ | settler holds no quote afterwards | got 0, expected 0 |
| ✅ | caller paid amountIn net of the rebate | amountIn≈1561905294437268408, rebate 49174899917354794 |
| ✅ | docked pool leaves the board | 5 strategies remain |
| ✅ | recapture stats reflect this run | recapture=199374191131977084534 fills=21014961642987660383 |
| ✅ | paidToResolvers is tracked | 6166212096865270654 |
| ✅ | atomic routes indexed | 6 routes |
| ✅ | route fill count matches the split | 6,6,6,6,4,4 |
| ✅ | resolver standings attribute the settle to the calling wallet | 1 settle(s), earned 46770012124326838 |
| ✅ | standings earned is positive and no more than the preview quoted | earned 46770012124326838, preview quoted 49174899917354794 |
| ✅ | standings agree with the indexed rebalance event | got 46770012124326838, expected 46770012124326838 |
| ✅ | event feed carries swaps, rebalances and controller updates | SwapFilled,RebalanceSettled,FeeControllerUpdated |
| ✅ | rebalance event is attributed to the settling wallet | settledBy=0xc3a0aed8bb5346177ebb3579593717274a78e0ad |
| ✅ | indexer is within a few blocks of the head | 6s behind |
| ✅ | settling wrote a revealed price into the oracle | sigma=112408564760168733 |
| ✅ | the fee controller has a live target for that pool | target=15954 reported=10892 |

## Reproducing this

```bash
APP=https://riptide-web-production-77f7.up.railway.app node tools/demo/e2e-live.mjs
```

The run funds its own wallets from the deployer, so it needs `DEPLOYER_PRIVATE_KEY`
(or `DEPLOYER_KEY_FILE`) for roughly 0.01 ETH of Base Sepolia gas and for the one
owner-only call in the script — moving the mock Chainlink feed to open a rebalance gap.
Everything else is permissionless.

