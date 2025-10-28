import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Bot,
  Cpu,
  Layers3,
  Rocket,
  Shield,
} from "lucide-react";
import { fetchAgentOverviews } from "@/server/nof1/service";

export default async function Home() {
  const agents = await fetchAgentOverviews();

  const totals = agents.reduce(
    (acc, agent) => {
      acc.totalExposure += agent.stats.totalExposure;
      acc.netUnrealized += agent.stats.netUnrealizedPnl;
      acc.totalMargin += agent.stats.totalMargin;
      if (agent.stats.averageConfidence !== null) {
        acc.confidenceSum += agent.stats.averageConfidence;
        acc.confidenceSamples += 1;
      }
      return acc;
    },
    {
      totalExposure: 0,
      netUnrealized: 0,
      totalMargin: 0,
      confidenceSum: 0,
      confidenceSamples: 0,
    },
  );

  const averageConfidence =
    totals.confidenceSamples > 0
      ? totals.confidenceSum / totals.confidenceSamples
      : null;

  const latestAgents = agents.slice(0, 4);

  const formatCurrency = (value: number) =>
    `$${value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  return (
    <div className="min-h-lvh bg-gradient-to-br from-surface-50 via-white to-surface-100">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-24 px-6 py-24">
        <section className="flex flex-col-reverse items-center gap-16 lg:flex-row lg:items-start lg:gap-24">
          <div className="flex w-full flex-1 flex-col items-start gap-6 text-left">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
              <Bot size={18} />
              实盘 AI Agent 跟单管控中心
            </div>

            <h1 className="text-balance text-4xl font-semibold text-surface-900 sm:text-5xl lg:text-6xl">
              以可视化方式掌控 Nof1 AI 量化交易
            </h1>

            <p className="text-lg leading-relaxed text-surface-600 sm:text-xl">
              Nof1 Tracker Web 提供服务端渲染的 Next.js 控制台，与原生
              CLI 交易引擎打通，支持实时监控持仓、风控指标以及一键触发跟单执行。
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
                href="https://github.com/nof1-labs"
                target="_blank"
                className="inline-flex items-center gap-2 rounded-full border border-surface-200 px-6 py-3 text-base font-semibold text-surface-600 transition hover:border-surface-400 hover:text-surface-800"
              >
                查看项目代码
              </Link>
            </div>
          </div>

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
                  {formatCurrency(totals.totalExposure)}
                </dd>
                <p className="pt-1 text-xs text-surface-400">
                  所有持仓按最新价格折算。
                </p>
              </div>

              <div className="rounded-2xl border border-surface-100 bg-surface-50/70 p-4 shadow-inner">
                <dt className="text-sm text-surface-500">总浮动盈亏</dt>
                <dd
                  className={`pt-2 text-2xl font-semibold ${
                    totals.netUnrealized >= 0
                      ? "text-emerald-600"
                      : "text-rose-600"
                  }`}
                >
                  {totals.netUnrealized >= 0 ? "+" : "-"}
                  {formatCurrency(Math.abs(totals.netUnrealized))}
                </dd>
                <p className="pt-1 text-xs text-surface-400">
                  基于仓位实时价格计算。
                </p>
              </div>

              <div className="rounded-2xl border border-surface-100 bg-surface-50/70 p-4 shadow-inner">
                <dt className="text-sm text-surface-500">已占用保证金</dt>
                <dd className="pt-2 text-2xl font-semibold text-surface-900">
                  {formatCurrency(totals.totalMargin)}
                </dd>
                <p className="pt-1 text-xs text-surface-400">
                  汇总所有 Agent 的仓位保证金。
                </p>
              </div>

              <div className="rounded-2xl border border-surface-100 bg-surface-50/70 p-4 shadow-inner">
                <dt className="text-sm text-surface-500">平均信心分</dt>
                <dd className="pt-2 text-2xl font-semibold text-surface-900">
                  {averageConfidence !== null
                    ? `${averageConfidence.toFixed(1)} / 100`
                    : "暂无数据"}
                </dd>
                <p className="pt-1 text-xs text-surface-400">
                  基于 Agent 持仓信心值平均计算。
                </p>
              </div>
            </dl>

            <div className="mt-8 space-y-3">
              {latestAgents.length > 0 ? (
                latestAgents.map((agent) => (
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
                ))
              ) : (
                <p className="rounded-2xl border border-surface-100 bg-surface-50 px-4 py-6 text-sm text-surface-400">
                  当前尚未同步到任何 Agent 数据，可在 `.env` 中配置
                  NOF1 API 后刷新页面。
                </p>
              )}
            </div>
          </section>
        </section>

        <section className="space-y-8">
          <h2 className="text-2xl font-semibold text-surface-900">
            平台特点
          </h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <FeatureCard
              icon={<Rocket className="text-primary" size={24} />}
              title="一体化操控"
              description="以仪表盘形式聚合 Agent 概览、交易执行与风险参数，运营团队可在浏览器内完成完整跟单流程。"
            />
            <FeatureCard
              icon={<Shield className="text-primary" size={24} />}
              title="风险前置"
              description="复用核心 CLI 风控逻辑，包括价格偏差、仓位限额与信心阈值，避免重复实现校验规则。"
            />
            <FeatureCard
              icon={<Cpu className="text-primary" size={24} />}
              title="服务端驱动"
              description="通过 Next.js App Router 与 server actions 将 CLI 能力以 API 形式暴露，兼容多终端调用场景。"
            />
          </div>
        </section>

        <section className="space-y-8">
          <h2 className="text-2xl font-semibold text-surface-900">
            架构速览
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <ArchitectureCard
              title="Next.js Web 层"
              description="位于 src/app，采用 App Router + Tailwind 打造仪表盘体验，支持 SSR 与流式数据更新。"
            />
            <ArchitectureCard
              title="Core Trading Engine"
              description="src/server/core 保留原生 CLI 引擎与 Jest 测试，涵盖 Binance API、风险与盈利模块。"
            />
            <ArchitectureCard
              title="NOF1 Facade"
              description="src/server/nof1 通过轻量服务封装核心库，提供 fetchAgentOverviews、trading executor 等接口。"
            />
          </div>
        </section>

        <section className="space-y-6 rounded-3xl border border-surface-200 bg-white/80 p-8 shadow-sm">
          <div className="flex items-center gap-3 text-primary">
            <Layers3 size={24} />
            <h2 className="text-xl font-semibold text-surface-900">
              三步上手
            </h2>
          </div>
          <ol className="space-y-4 text-sm text-surface-600">
            <li>
              1. 复制 <code>.env.example</code> 为 <code>.env</code>，填写
              NOF1 API 以及 Binance 测试网密钥。
            </li>
            <li>
              2. 运行 <code>npm run dev</code> 加载仪表盘，使用{" "}
              <code>npm test</code> 校验核心逻辑。
            </li>
            <li>
              3. 在控制台中配置跟单参数，触发交易执行并实时观察 Agent 表现。
            </li>
          </ol>
        </section>
      </main>
    </div>
  );
}

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <article className="flex flex-col gap-3 rounded-3xl border border-surface-200 bg-white/80 p-6 shadow-sm">
      <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-primary/10">
        {icon}
      </span>
      <h3 className="text-lg font-semibold text-surface-900">{title}</h3>
      <p className="text-sm leading-relaxed text-surface-600">
        {description}
      </p>
    </article>
  );
}

interface ArchitectureCardProps {
  title: string;
  description: string;
}

function ArchitectureCard({ title, description }: ArchitectureCardProps) {
  return (
    <article className="rounded-3xl border border-surface-200 bg-white/80 p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-surface-900">{title}</h3>
      <p className="pt-2 text-sm leading-relaxed text-surface-600">
        {description}
      </p>
    </article>
  );
}
