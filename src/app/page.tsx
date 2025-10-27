import Link from "next/link";
import { Activity, ArrowRight, Bot } from "lucide-react";
import { fetchAgentOverviews } from "@/server/nof1/service";

export default async function Home() {
  const agents = await fetchAgentOverviews();
  const totalExposure = agents.reduce(
    (sum, agent) => sum + agent.stats.totalExposure,
    0,
  );
  const netUnrealized = agents.reduce(
    (sum, agent) => sum + agent.stats.netUnrealizedPnl,
    0,
  );

  return (
    <div className="min-h-lvh bg-gradient-to-br from-surface-50 via-white to-surface-100">
      <main className="mx-auto flex w-full max-w-6xl flex-col items-center gap-16 px-6 py-24 lg:flex-row lg:items-start lg:gap-24">
        <section className="flex w-full flex-1 flex-col items-start gap-6 text-left">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
            <Bot size={18} />
            实盘 AI Agent 跟单管控中心
          </div>

          <h1 className="text-balance text-4xl font-semibold text-surface-900 sm:text-5xl lg:text-6xl">
            可视化监控与控制 Nof1 AI 量化交易
          </h1>

          <p className="text-lg text-surface-600 sm:text-xl">
            使用全新的 Next.js Web 界面实时查看 AI Agent 持仓、风险指标与盈利表现，
            并为跟单执行提供服务端接口。
          </p>

          <div className="flex flex-wrap items-center gap-4 pt-2">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-full bg-surface-900 px-6 py-3 text-base font-semibold text-white shadow-lg transition hover:bg-surface-800"
            >
              打开控制台
              <ArrowRight size={18} />
            </Link>

            <Link
              href="https://github.com/lmsqueezy/nextjs-billing"
              target="_blank"
              className="inline-flex items-center gap-2 rounded-full border border-surface-200 px-6 py-3 text-base font-semibold text-surface-600 transition hover:border-surface-400 hover:text-surface-800"
            >
              基于 LMSqueezy 模板构建
            </Link>
          </div>
        </section>

        <section className="w-full max-w-xl flex-1 rounded-3xl border border-surface-200 bg-white/80 p-8 shadow-2xl backdrop-blur">
          <header className="flex items-center justify-between pb-6">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-surface-400">
                当前总览
              </h2>
              <p className="text-2xl font-semibold text-surface-900">
                {agents.length} 个活跃 Agent
              </p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm text-primary">
              <Activity size={16} />
              实时同步
            </div>
          </header>

          <dl className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="rounded-2xl border border-surface-100 bg-surface-50/70 p-4 shadow-inner">
              <dt className="text-sm text-surface-500">总名义敞口</dt>
              <dd className="pt-2 text-2xl font-semibold text-surface-900">
                ${totalExposure.toFixed(2)}
              </dd>
              <p className="pt-1 text-xs text-surface-400">所有持仓市值之和</p>
            </div>

            <div className="rounded-2xl border border-surface-100 bg-surface-50/70 p-4 shadow-inner">
              <dt className="text-sm text-surface-500">总浮动盈亏</dt>
              <dd
                className={`pt-2 text-2xl font-semibold ${
                  netUnrealized >= 0 ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                {netUnrealized >= 0 ? "+" : "-"}$
                {Math.abs(netUnrealized).toFixed(2)}
              </dd>
              <p className="pt-1 text-xs text-surface-400">按仓位实时价格计算</p>
            </div>
          </dl>

          <div className="mt-8 space-y-3">
            {agents.slice(0, 4).map((agent) => (
              <Link
                key={agent.modelId}
                href={`/dashboard/agents/${agent.modelId}`}
                className="group flex items-center justify-between rounded-2xl border border-surface-100 px-4 py-3 transition hover:border-primary/40 hover:bg-primary/5"
              >
                <div>
                  <p className="text-sm font-semibold text-surface-800">
                    {agent.modelId}
                  </p>
                  <p className="text-xs text-surface-400">
                    {agent.stats.positionsCount} 个持仓 · 最后更新{" "}
                    {new Date(agent.lastUpdated).toLocaleString()}
                  </p>
                </div>
                <ArrowRight
                  size={18}
                  className="text-surface-300 transition group-hover:text-primary"
                />
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
