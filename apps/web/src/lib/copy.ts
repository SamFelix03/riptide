export const LANDING_STORY = {
  problem: {
    kicker: "The leak",
    title: "Pools bleed to whoever is fastest",
    body: "A normal AMM does not know the street price. When the real market jumps, your pool still quotes the old number for a few blocks. Faster traders buy the cheap side and sell it elsewhere. You posted the inventory. They kept the difference. That money never comes back to the pool.",
  },
  solution: {
    kicker: "The fix",
    title: "Keep the leak in the market",
    body: "RIPTIDE charges a swap fee that rises when prices are wild, so quoting is not free during a storm. When the pool drifts, it auctions the right to push it back. Most of that leftover value returns to the liquidity that was sitting there — instead of leaving with a searcher.",
  },
  people: {
    kicker: "Who it is for",
    roles: [
      {
        n: "01",
        title: "Makers",
        body: "You ship a strategy and keep custody in Aqua. Fees track how risky it is to quote, and most of a rebalance's surplus stays in your balance.",
      },
      {
        n: "02",
        title: "Takers",
        body: "You swap against live pools. The fee is that day's turbulence — not a padded constant that overcharges on quiet days and undercharges when it matters.",
      },
      {
        n: "03",
        title: "Resolvers",
        body: "You get paid to close the gap. Winning the Dutch auction is a posted job with a known split, not a private race in the mempool.",
      },
    ],
  },
} as const;

const DOCS = "https://github.com/SamFelix03/riptide/blob/main/docs";

export const LANDING_MATH = {
  kicker: "The identities",
  title: "Fees must cover LVR; the rest is recaptured",
  lead: "An LP beats a frictionless rebalancing portfolio if and only if fees exceed accumulated LVR. Mechanism 1 raises fees with σ. Mechanism 2 recaptures a fraction β. The identities below are the on-chain finals.",
  blocks: [
    {
      kicker: "K1 · cost",
      title: "Instantaneous LVR",
      body: "A CPMM leaks σ²/8 of pool value per unit time to informed flow — 1/8 per year at 100% vol, before any fee.",
      equations: [
        String.raw`\ell(\sigma,P)=\frac{\sigma^{2}P^{2}}{2}\,\lvert x^{*\prime}(P)\rvert`,
        String.raw`\frac{\ell}{V}=\frac{\sigma^{2}}{8}`,
        String.raw`LP_{T}-\text{rebalancing}_{T}=\text{fees}_{T}-\int_{0}^{T}\ell(\sigma_{t},P_{t})\,dt`,
      ],
      spec: { label: "LVR_MATH §2", href: `${DOCS}/LVR_MATH.md` },
      paper: { label: "LVR_PAPER.pdf · arXiv:2208.06046", href: `${DOCS}/LVR_PAPER.pdf` },
    },
    {
      kicker: "K3 · Mechanism 1",
      title: "Break-even fee",
      body: "Break-even is the LVR rate divided by the maker’s flow-intensity set-point, then clamped into fee units. The provider steps toward that target — it is not a guessed constant.",
      equations: [
        String.raw`\phi^{\ast}=\frac{\sigma^{2}/8}{\lambda_{Q}}`,
        String.raw`\mathrm{feeTarget}=\mathrm{clamp}(\phi^{\ast}\cdot 10^{7},\;\mathrm{feeMin},\;\mathrm{feeMax})`,
      ],
      spec: { label: "LVR_MATH §4", href: `${DOCS}/LVR_MATH.md` },
      paper: { label: "FEESvLVR.pdf · arXiv:2305.14604", href: `${DOCS}/FEESvLVR.pdf` },
    },
    {
      kicker: "K2 · Mechanism 2",
      title: "β-split surplus",
      body: "Surplus S is extra input versus the stale curve. The rebate is floored so the maker keeps at least βS. Sims use β = 0.95.",
      equations: [
        String.raw`S=\mathrm{executedIn}-\mathrm{staleIn}`,
        String.raw`\mathrm{payToResolver}=\left\lfloor(1-\beta)\,S\right\rfloor`,
        String.raw`\mathrm{retainToLP}=S-\mathrm{payToResolver}\ge\beta S`,
        String.raw`\mathbb{E}[\text{LVR to arbitrageurs}]\le(1-\beta)\,L`,
      ],
      spec: { label: "LVR_MATH §5", href: `${DOCS}/LVR_MATH.md` },
      paper: { label: "DIAMOND_LVR.pdf · arXiv:2210.10601", href: `${DOCS}/DIAMOND_LVR.pdf` },
    },
  ],
  loop: {
    body: "A competitive resolver only fills when it is profitable, so the auction price is a paid-for observation. That price updates σ, which updates feeTarget for the next swap — a design property, not a theorem.",
    spec: { label: "LVR_MATH §6", href: `${DOCS}/LVR_MATH.md` },
  },
  sources: [
    { label: "SOURCES.md — honesty ledger (K1–K3)", href: `${DOCS}/SOURCES.md` },
    { label: "PROTOCOL.md — mechanisms as product", href: `${DOCS}/PROTOCOL.md` },
    { label: "LVR_MATH.md — normative identities", href: `${DOCS}/LVR_MATH.md` },
  ],
} as const;

export const HOW_IT_WORKS = [
  {
    n: "01",
    title: "Configure",
    body: "Choose a market, set fee and auction policies, and preview the volatility-indexed fee curve.",
  },
  {
    n: "02",
    title: "Ship",
    body: "Approve tokens, publish the Aqua-backed strategy, and register both swap and rebalance legs.",
  },
  {
    n: "03",
    title: "Earn",
    body: "Collect dynamic fees that track LVR while the rebalance auction returns surplus to your balance.",
  },
  {
    n: "04",
    title: "Iterate",
    body: "Monitor controller telemetry, dock when needed, and republish with tuned parameters.",
  },
] as const;

export const MECHANISMS = {
  m1: {
    title: "Mechanism 1",
    subtitle: "Volatility-Indexed Fee",
    body: "The swap fee is not a fixed number. It automatically adjusts with realized volatility so that expected fee revenue tracks expected LVR — the structural cost of adverse selection.",
  },
  m2: {
    title: "Mechanism 2",
    subtitle: "Dutch Rebalance + \u03B2-Split",
    body: "When external price gaps, RIPTIDE auctions the right to re-price the pool. Resolvers compete in a declining-price auction; the LP retains \u2265\u03B2 of the surplus. \u03B2 is set by the maker \u2014 the three live pools run 0.90, 0.95 and 0.97.",
  },
  loop: {
    title: "The Loop",
    subtitle: "Self-Reinforcing Calibration",
    body: "The auction\u2019s revealed price feeds the volatility oracle, recalibrating the fee controller. A paid-for, incentive-compatible observation \u2014 reducing dependence on external oracles.",
  },
} as const;

export const LOOP_STEPS = [
  { n: "01", label: "Resolver wins auction at market-revealed price" },
  { n: "02", label: "Price fed to RiptideVolatilityOracle" },
  { n: "03", label: "Volatility estimate (\u03C3) updates via EWMA" },
  { n: "04", label: "Fee controller recalibrates for next swap" },
] as const;

export const COMPARISON = [
  {
    ordinary: "Fixed or manually tuned fee",
    riptide: "Volatility-indexed fee targeting LVR break-even",
  },
  {
    ordinary: "Arbitrage value leaks to mempool searchers",
    riptide: "Auctioned on-chain; LP retains \u03B2 of surplus",
  },
  {
    ordinary: "Passive LP hopes fees > losses",
    riptide: "Active strategy: charge + recapture structural cost",
  },
  {
    ordinary: "Custody vault or LP shares",
    riptide: "Self-custody in Aqua; one explicit strategy per maker",
  },
  {
    ordinary: "Forks the VM to add behaviour",
    riptide: "One custom instruction via SwapVM\u2019s own _instructions() override \u2014 no fork",
  },
  {
    ordinary: "Relies on external oracle alone",
    riptide: "Self-reinforcing loop from auction-revealed prices",
  },
] as const;
