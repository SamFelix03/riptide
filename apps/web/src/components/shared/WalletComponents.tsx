"use client";

import { useEffect, useState } from "react";
import type { TxPlan } from "@riptide/frontend-api";
import type { Address, Hash } from "viem";

import { Card } from "./DesignSystem";
import { TxLink } from "./States";
import { useToast } from "./TxToast";
import { formatWad } from "@/lib/format";
import { useWallet } from "@/providers/WalletProvider";

const erc20Abi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

export function TokenBalanceReadout({ token, symbol }: { token: Address; symbol: string }) {
  const { address, readContract, isConnected } = useWallet();
  const [balance, setBalance] = useState<string>("0");

  useEffect(() => {
    if (!address) return;
    void readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [address] }).then((v) => setBalance(String(v)));
  }, [address, token, readContract]);

  if (!isConnected) return null;
  return (
    <span className="balance-chip" data-testid="token-balance">
      <span className="label-xs">{symbol}</span>
      <span className="tabular" title={balance}>{formatWad(balance)}</span>
    </span>
  );
}

export function AllowanceManager({ token, spender, symbol, bare }: { token: Address; spender: Address; symbol: string; bare?: boolean }) {
  const { address, readContract, isConnected } = useWallet();
  const [allowance, setAllowance] = useState<string>("0");

  useEffect(() => {
    if (!address) return;
    void readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [address, spender] }).then((v) => setAllowance(String(v)));
  }, [address, token, spender, readContract]);

  if (!isConnected) return null;

  const body = (
    <>
      <div className="muted" title={allowance}>
        {symbol} → Aqua: {formatWad(allowance)}
      </div>
      <p className="muted">Approvals are included in the ship plan stepper.</p>
    </>
  );

  if (bare) return <div data-testid="allowance-manager">{body}</div>;

  return (
    <Card title={`Allowance: ${symbol} → Aqua`}>
      {body}
    </Card>
  );
}

type ExecutePhase = "idle" | "submitting" | "confirming" | "success" | "error";

type StepResult = {
  label: string;
  hash: Hash;
  blockNumber: string;
};

function stepOutcome(label: string): string {
  if (label.includes("Approve base")) return "Base token allowance granted to the Aqua vault";
  if (label.includes("Approve quote")) return "Quote token allowance granted to the Aqua vault";
  if (label.includes("Aqua.ship")) return "Reserves deposited into Aqua and bound to your swap order";
  if (label.includes("Register strategy")) return "Strategy registered on SwapVM — takers can now quote this pool";
  if (label.includes("Aqua.dock")) return "Strategy liquidity withdrawn from Aqua; pool marked inactive";
  if (label.toLowerCase().includes("settle")) return "Rebalance auction settled; surplus split between LPs and resolver";
  if (label.toLowerCase().includes("skew") || label.toLowerCase().includes("oracle")) {
    return "Oracle price skewed to open a rebalance gap";
  }
  return label;
}

function friendlyExecError(message: string, requiredSigner?: Address, connected?: Address | null): string {
  if (message.includes("0xf7eeda6e") || message.toLowerCase().includes("unauthorized")) {
    const maker = requiredSigner ?? connected;
    return maker
      ? `This step must be sent by the strategy maker (${maker}). Connect that wallet, rebuild the plan, and execute again.`
      : "This step must be sent by the strategy maker. Connect the maker wallet, rebuild the plan, and execute again.";
  }
  return message;
}

export function TransactionStepper({
  plan,
  onExecute,
  onSuccess,
  successLabel = "Transaction confirmed on-chain",
  successFootnote,
  requiredSigner,
}: {
  plan: TxPlan | null;
  onExecute?: () => Promise<Hash | void>;
  onSuccess?: () => void;
  successLabel?: string;
  /** Optional judge-facing note shown after all steps succeed. */
  successFootnote?: string;
  /** When set, Execute is blocked unless the connected wallet matches (e.g. strategy maker). */
  requiredSigner?: Address;
}) {
  const { writeContract, waitForTransaction, address, network } = useWallet();
  const { showToast } = useToast();
  const [phase, setPhase] = useState<ExecutePhase>("idle");
  const [currentStep, setCurrentStep] = useState(0);
  const [stepResults, setStepResults] = useState<StepResult[]>([]);
  const [execError, setExecError] = useState<string | null>(null);

  useEffect(() => {
    setPhase("idle");
    setCurrentStep(0);
    setStepResults([]);
    setExecError(null);
  }, [plan?.to, plan?.data]);

  if (!plan) return null;

  const busy = phase === "submitting" || phase === "confirming";
  const activeStep = plan.steps[currentStep];

  async function runStep(step: TxPlan["steps"][number]): Promise<StepResult> {
    const hash = await writeContract({ address: step.to, data: step.data });
    showToast({ txHash: hash, status: "pending", label: step.label, explorerBaseUrl: `${network.explorerUrl.replace(/\/$/, "")}/tx/` });
    setPhase("confirming");
    const receipt = await waitForTransaction(hash);
    if (receipt.status === "reverted") {
      throw new Error(`"${step.label}" reverted on-chain`);
    }
    return { label: step.label, hash, blockNumber: receipt.blockNumber.toString() };
  }

  async function handleClick() {
    if (!plan?.sendable || busy) return;
    if (requiredSigner && address && requiredSigner.toLowerCase() !== address.toLowerCase()) {
      setExecError(
        `Active signer (${address}) does not match the plan maker (${requiredSigner}). Connect that wallet and rebuild the plan.`,
      );
      setPhase("error");
      return;
    }
    setExecError(null);
    setStepResults([]);
    setCurrentStep(0);

    try {
      if (onExecute) {
        setPhase("submitting");
        const hash = await onExecute();
        if (!hash) {
          setPhase("idle");
          return;
        }
        showToast({ txHash: hash, status: "pending", label: successLabel, explorerBaseUrl: `${network.explorerUrl.replace(/\/$/, "")}/tx/` });
        setPhase("confirming");
        const receipt = await waitForTransaction(hash);
        if (receipt.status === "reverted") {
          throw new Error("Transaction reverted on-chain");
        }
        const label = plan.steps[0]?.label ?? plan.description;
        setStepResults([{ label, hash, blockNumber: receipt.blockNumber.toString() }]);
        setPhase("success");
        showToast({ txHash: hash, status: "confirmed", label: successLabel, explorerBaseUrl: `${network.explorerUrl.replace(/\/$/, "")}/tx/` });
        onSuccess?.();
        return;
      }

      const results: StepResult[] = [];
      for (let i = 0; i < plan.steps.length; i++) {
        setCurrentStep(i);
        setPhase("submitting");
        results.push(await runStep(plan.steps[i]!));
        setStepResults([...results]);
      }
      setPhase("success");
      const last = results.at(-1);
      if (last) {
        showToast({ txHash: last.hash, status: "confirmed", label: successLabel, explorerBaseUrl: `${network.explorerUrl.replace(/\/$/, "")}/tx/` });
      }
      onSuccess?.();
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      setExecError(friendlyExecError(raw, requiredSigner, address));
      setPhase("error");
      showToast({ txHash: stepResults.at(-1)?.hash ?? "0x", status: "failed", label: friendlyExecError(raw, requiredSigner, address) });
    }
  }

  const lastResult = stepResults.at(-1);

  return (
    <Card title="Transaction plan" testId="transaction-stepper">
      <p className="muted">{plan.description}</p>
      <ol data-testid="execution-steps">
        {plan.steps.map((step, i) => {
          const result = stepResults[i];
          const running = busy && currentStep === i;
          const done = Boolean(result);
          return (
            <li key={i} data-testid={`execution-step-${i}`} style={{ marginBottom: "0.35rem" }}>
              <span aria-hidden>{done ? "✓ " : running ? "… " : "○ "}</span>
              {step.label}
              {result ? (
                <>
                  {" "}
                  · block #{result.blockNumber} · <TxLink hash={result.hash} explorerUrl={network.explorerUrl} />
                </>
              ) : null}
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        disabled={!plan.sendable || busy}
        onClick={() => void handleClick()}
        style={{ width: "100%", marginTop: "0.75rem" }}
        title={plan.sendable ? undefined : "Connect a wallet to send this transaction"}
      >
        {phase === "submitting"
          ? activeStep
            ? `Submitting step ${currentStep + 1}/${plan.steps.length}: ${activeStep.label}…`
            : "Submitting…"
          : phase === "confirming"
            ? `Confirming step ${currentStep + 1}/${plan.steps.length}…`
            : plan.sendable
              ? plan.steps.length > 1 && !onExecute
                ? `Execute all ${plan.steps.length} steps`
                : "Execute"
              : "Execute (not sendable)"}
      </button>

      {phase === "submitting" || phase === "confirming" ? (
        <div className="card muted" data-testid="execution-pending" style={{ marginTop: "0.75rem" }}>
          {activeStep ? (
            <>
              Step {currentStep + 1} of {plan.steps.length}: <strong>{activeStep.label}</strong>
            </>
          ) : (
            "Processing transaction…"
          )}
        </div>
      ) : null}

      {phase === "success" && stepResults.length > 0 ? (
        <div className="card success" data-testid="execution-result" style={{ marginTop: "0.75rem", borderColor: "var(--success)" }}>
          <strong>{successLabel}</strong>
          <p className="muted" style={{ margin: "0.35rem 0 0" }}>{plan.description}</p>

          <div data-testid="execution-outcome" style={{ marginTop: "0.75rem" }}>
            <strong>What happened</strong>
            <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem" }}>
              {stepResults.map((result) => (
                <li key={result.hash}>{stepOutcome(result.label)}</li>
              ))}
            </ul>
          </div>

          <div data-testid="execution-receipts" style={{ marginTop: "0.75rem" }}>
            <strong>On-chain receipts</strong>
            <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem" }}>
              {stepResults.map((result, i) => (
                <li key={result.hash}>
                  {i + 1}. {result.label} · block #{result.blockNumber} ·{" "}
                  <TxLink hash={result.hash} explorerUrl={network.explorerUrl} />
                </li>
              ))}
            </ul>
          </div>

          {lastResult ? (
            <p className="muted" style={{ margin: "0.75rem 0 0" }}>
              Final confirmation: block #{lastResult.blockNumber}
            </p>
          ) : null}

          {successFootnote ? (
            <p style={{ margin: "0.75rem 0 0" }}>{successFootnote}</p>
          ) : null}
        </div>
      ) : null}

      {phase === "error" ? (
        <div className="card error" data-testid="execution-error" style={{ marginTop: "0.75rem", borderColor: "var(--danger)" }}>
          <strong>Transaction failed</strong>
          {activeStep && busy === false && currentStep < plan.steps.length ? (
            <p style={{ margin: "0.5rem 0 0" }}>
              Failed on step {currentStep + 1}: {plan.steps[currentStep]?.label}
            </p>
          ) : null}
          <p style={{ margin: "0.5rem 0 0" }}>{execError ?? "Unknown error"}</p>
          {stepResults.length > 0 ? (
            <div style={{ marginTop: "0.75rem" }}>
              <strong>Completed before failure</strong>
              <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem" }}>
                {stepResults.map((result) => (
                  <li key={result.hash}>
                    ✓ {result.label} · <TxLink hash={result.hash} explorerUrl={network.explorerUrl} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
