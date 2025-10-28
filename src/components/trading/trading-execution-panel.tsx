"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { AgentOverview } from "@/server/nof1/service";
import type { TrackerSettings } from "@/server/nof1/settings";
import type { FollowExecutionResponse } from "@/server/nof1/trading";

interface TradingExecutionPanelProps {
  agents: AgentOverview[];
  settings: TrackerSettings;
  onOpenSettings: () => void;
}

export function TradingExecutionPanel({
  agents,
  settings,
  onOpenSettings,
}: TradingExecutionPanelProps) {
  const [selectedAgent, setSelectedAgent] = useState<string>(
    agents[0]?.modelId ?? "",
  );
  const [priceTolerance, setPriceTolerance] = useState<number>(
    settings.priceTolerance,
  );
  const [totalMargin, setTotalMargin] = useState<number>(
    settings.totalMargin,
  );
  const [profitTarget, setProfitTarget] = useState<string>(
    settings.profitTarget?.toString() ?? "",
  );
  const [autoRefollow, setAutoRefollow] = useState<boolean>(
    settings.autoRefollow,
  );
  const [marginType, setMarginType] = useState<"CROSSED" | "ISOLATED">(
    settings.marginType,
  );
  const [riskOnly, setRiskOnly] = useState<boolean>(settings.riskOnly);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [result, setResult] = useState<FollowExecutionResponse | null>(null);

  const agentOptions = useMemo(
    () =>
      agents.map((agent) => ({
        value: agent.modelId,
        label: `${agent.modelId} (${agent.positions.length} 仓位)`,
      })),
    [agents],
  );

  useEffect(() => {
    setPriceTolerance(settings.priceTolerance);
    setTotalMargin(settings.totalMargin);
    setProfitTarget(settings.profitTarget?.toString() ?? "");
    setAutoRefollow(settings.autoRefollow);
    setMarginType(settings.marginType);
    setRiskOnly(settings.riskOnly);
  }, [settings]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedAgent) {
      toast.error("请选择要跟随的 Agent");
      return;
    }

    setIsSubmitting(true);
    setResult(null);

    try {
      const payload = {
        agentId: selectedAgent,
        options: {
          priceTolerance,
          totalMargin,
          profit:
            profitTarget.trim().length > 0
              ? Number.parseFloat(profitTarget)
              : undefined,
          autoRefollow,
          marginType,
          riskOnly,
        },
      };

      const response = await fetch("/api/trading/follow", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        const message =
          response.status === 412
            ? "缺少 Binance API Key 或 Secret，请先在环境变量中配置后再执行交易。"
            : data.error || "跟单执行失败";
        throw new Error(message);
      }

      setResult(data.data as FollowExecutionResponse);
      toast.success("跟单执行完成");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "无法执行跟单操作";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const hasAgents = agentOptions.length > 0;

  return (
    <section className="rounded-3xl border border-surface-200 bg-white/90 p-6 shadow-sm">
      <header className="flex flex-col gap-3 border-b border-surface-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-surface-900">
            执行 AI Agent 跟单
          </h2>
          <p className="text-xs text-surface-500">
            设置跟单参数后，即可直接调用原生 Nof1 Trading Executor 完成下单与风险校验。
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenSettings}
          className="inline-flex items-center justify-center rounded-full border border-surface-200 px-3 py-2 text-xs font-medium text-surface-600 transition hover:border-primary/40 hover:text-primary"
        >
          快速打开设置
        </button>
      </header>

      {!hasAgents ? (
        <p className="pt-6 text-sm text-surface-500">
          暂无可用 Agent，请先在概览中确认数据是否正常。
        </p>
      ) : (
        <form
          className="grid grid-cols-1 gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={handleSubmit}
        >
          <FormField label="目标 Agent">
            <select
              className="rounded-xl border border-surface-200 bg-white px-4 py-3 text-sm text-surface-700 shadow-sm transition hover:border-primary/40 focus:border-primary focus:outline-none"
              value={selectedAgent}
              onChange={(event) => setSelectedAgent(event.target.value)}
            >
              {agentOptions.map((agent) => (
                <option key={agent.value} value={agent.value}>
                  {agent.label}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="价格容忍度 (%)">
            <input
              type="number"
              min={0.01}
              step={0.01}
              value={priceTolerance}
              onChange={(event) =>
                setPriceTolerance(() => {
                  const value = Number.parseFloat(event.target.value);
                  return Number.isNaN(value) ? 0 : value;
                })
              }
              className="w-full rounded-xl border border-surface-200 bg-white px-4 py-3 text-sm text-surface-700 shadow-sm transition hover:border-primary/40 focus:border-primary focus:outline-none"
            />
          </FormField>

          <FormField label="总保证金 (USDT)">
            <input
              type="number"
              min={0}
              step={0.01}
              value={totalMargin}
              onChange={(event) =>
                setTotalMargin(() => {
                  const value = Number.parseFloat(event.target.value);
                  return Number.isNaN(value) ? 0 : value;
                })
              }
              className="w-full rounded-xl border border-surface-200 bg-white px-4 py-3 text-sm text-surface-700 shadow-sm transition hover:border-primary/40 focus:border-primary focus:outline-none"
            />
          </FormField>

          <FormField
            label="盈利目标 (%)"
            description="留空则使用 Agent 自带止盈策略"
          >
            <input
              type="number"
              min={0}
              step={0.1}
              value={profitTarget}
              onChange={(event) => setProfitTarget(event.target.value)}
              className="w-full rounded-xl border border-surface-200 bg-white px-4 py-3 text-sm text-surface-700 shadow-sm transition hover:border-primary/40 focus:border-primary focus:outline-none"
            />
          </FormField>

          <FormField label="保证金模式">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 rounded-xl border border-surface-200 bg-white px-4 py-3 text-sm text-surface-600 transition hover:border-primary/40">
                <input
                  type="radio"
                  name="marginType"
                  value="CROSSED"
                  checked={marginType === "CROSSED"}
                  onChange={() => setMarginType("CROSSED")}
                />
                全仓
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-surface-200 bg-white px-4 py-3 text-sm text-surface-600 transition hover:border-primary/40">
                <input
                  type="radio"
                  name="marginType"
                  value="ISOLATED"
                  checked={marginType === "ISOLATED"}
                  onChange={() => setMarginType("ISOLATED")}
                />
                逐仓
              </label>
            </div>
          </FormField>

          <FormField label="自动选项">
            <div className="flex flex-col gap-2 text-xs text-surface-500">
              <label className="inline-flex items-center gap-2 rounded-xl border border-surface-200 bg-white px-4 py-3 text-surface-600 transition hover:border-primary/40">
                <input
                  type="checkbox"
                  checked={autoRefollow}
                  onChange={(event) => setAutoRefollow(event.target.checked)}
                />
                盈利目标后自动再次跟随
              </label>

              <label className="inline-flex items-center gap-2 rounded-xl border border-surface-200 bg-white px-4 py-3 text-surface-600 transition hover:border-primary/40">
                <input
                  type="checkbox"
                  checked={riskOnly}
                  onChange={(event) => setRiskOnly(event.target.checked)}
                />
                仅进行风险评估 (不真实下单)
              </label>
            </div>
          </FormField>

          <div className="sm:col-span-2 lg:col-span-3">
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex w-full items-center justify-center rounded-2xl bg-primary px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-surface-300"
            >
              {isSubmitting ? "执行中..." : "执行跟单"}
            </button>
            <p className="pt-2 text-center text-xs text-surface-400">
              请确认已正确配置 Binance API Key，执行后将直接调用交易接口。
            </p>
          </div>
        </form>
      )}

      {result ? (
        <ExecutionResultPanel result={result} />
      ) : null}
    </section>
  );
}

interface FormFieldProps {
  label: string;
  children: React.ReactNode;
  description?: string;
}

function FormField({ label, children, description }: FormFieldProps) {
  return (
    <label className="flex flex-col gap-2 text-xs text-surface-500">
      <span className="font-semibold text-surface-700">{label}</span>
      {children}
      {description ? (
        <span className="text-[11px] text-surface-400">{description}</span>
      ) : null}
    </label>
  );
}

interface ExecutionResultPanelProps {
  result: FollowExecutionResponse;
}

function ExecutionResultPanel({ result }: ExecutionResultPanelProps) {
  const { summary } = result;

  return (
    <div className="mt-8 space-y-4 rounded-3xl border border-surface-200 bg-surface-50/80 p-6">
      <header className="flex flex-col gap-2 border-b border-surface-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-primary">
            执行结果
          </p>
          <h3 className="text-lg font-semibold text-surface-900">
            {result.agentId} · {new Date(result.executedAt).toLocaleString()}
          </h3>
        </div>

        <dl className="grid grid-cols-2 gap-3 text-xs text-surface-500 sm:grid-cols-3">
          <SummaryItem label="执行成功" value={summary.executed} />
          <SummaryItem label="风险阻断" value={summary.blocked} />
          <SummaryItem label="仅风险评估" value={summary.riskOnly} />
          <SummaryItem label="跳过" value={summary.skipped} />
          <SummaryItem label="免操作" value={summary.noop} />
          <SummaryItem label="计划总数" value={summary.total} />
        </dl>
      </header>

      <div className="space-y-3">
        {result.plans.map((plan) => (
          <PlanResultCard key={plan.tradingPlan.id} plan={plan} />
        ))}
      </div>
    </div>
  );
}

interface SummaryItemProps {
  label: string;
  value: number;
}

function SummaryItem({ label, value }: SummaryItemProps) {
  return (
    <div className="rounded-xl border border-surface-100 bg-white px-3 py-2 text-center shadow-sm">
      <p className="text-[11px] text-surface-400">{label}</p>
      <p className="text-sm font-semibold text-surface-700">{value}</p>
    </div>
  );
}

function PlanResultCard({
  plan,
}: {
  plan: FollowExecutionResponse["plans"][number];
}) {
  const statusLabel = {
    executed: "已执行",
    blocked: "风险阻断",
    "risk-only": "风险评估",
    skipped: "执行失败",
    noop: "无需操作",
  }[plan.status];

  const statusClass = {
    executed: "bg-emerald-100 text-emerald-700",
    blocked: "bg-amber-100 text-amber-700",
    "risk-only": "bg-sky-100 text-sky-700",
    skipped: "bg-rose-100 text-rose-700",
    noop: "bg-surface-200 text-surface-600",
  }[plan.status];

  return (
    <article className="rounded-2xl border border-surface-100 bg-white p-4 shadow-sm">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-surface-900">
            {plan.plan.symbol} · {plan.plan.action}
          </p>
          <p className="text-xs text-surface-400">
            {plan.plan.side} · {plan.plan.quantity.toFixed(4)} 张 ·{" "}
            {plan.plan.leverage}x
          </p>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${statusClass}`}
        >
          {statusLabel}
        </span>
      </header>

      <div className="mt-3 grid grid-cols-1 gap-3 text-xs text-surface-500 sm:grid-cols-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-surface-400">
            风险评分
          </p>
          <p className="pt-1 text-sm font-semibold text-surface-800">
            {plan.risk.riskScore}/100
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-surface-400">
            建议仓位
          </p>
          <p className="pt-1 text-sm font-semibold text-surface-800">
            {plan.risk.suggestedPositionSize.toFixed(4)} 张
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-surface-400">
            最大亏损估计
          </p>
          <p className="pt-1 text-sm font-semibold text-surface-800">
            ${plan.risk.maxLoss.toFixed(2)}
          </p>
        </div>
      </div>

      {plan.risk.priceTolerance ? (
        <div className="mt-3 rounded-xl border border-surface-100 bg-surface-50 p-3 text-[11px] text-surface-500">
          <p>
            价格容忍度：当前差异{" "}
            {plan.risk.priceTolerance.priceDifference.toFixed(2)}%，阈值{" "}
            {plan.risk.priceTolerance.tolerance}%。
          </p>
          <p>{plan.risk.priceTolerance.reason}</p>
        </div>
      ) : null}

      {plan.risk.warnings.length > 0 ? (
        <ul className="mt-3 list-inside list-disc rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-700">
          {plan.risk.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}

      {plan.execution ? (
        <div className="mt-3 rounded-xl border border-surface-100 bg-surface-50 p-3 text-[11px] text-surface-500">
          {plan.execution.success ? (
            <>
              <p>订单 ID：{plan.execution.orderId}</p>
              {plan.execution.takeProfitOrderId ? (
                <p>止盈 ID：{plan.execution.takeProfitOrderId}</p>
              ) : null}
              {plan.execution.stopLossOrderId ? (
                <p>止损 ID：{plan.execution.stopLossOrderId}</p>
              ) : null}
            </>
          ) : plan.execution.error ? (
            <p className="text-rose-500">{plan.execution.error}</p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
