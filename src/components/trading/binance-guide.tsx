import type { ReactNode } from "react";
import { ArrowUpRight, BookOpenCheck, ShieldCheck, Wrench } from "lucide-react";
import Link from "next/link";

interface BinanceGuideProps {
  onOpenSettings?: () => void;
}

export function BinanceGuide({ onOpenSettings }: BinanceGuideProps) {
  const binanceReferralUrl = process.env.NEXT_PUBLIC_BINANCE_REFERRAL_URL || "https://www.binance.com/register";

  return (
    <section className="space-y-6 rounded-3xl border border-surface-200 bg-white p-6 shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-surface-100 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Binance 接入
          </p>
          <h2 className="text-xl font-semibold text-surface-900">
            三步完成注册、API 创建与接入配置
          </h2>
          <p className="pt-2 text-xs text-surface-500">
            如果你此前未使用过币安，按照以下流程先完成账号安全校验，再把 API
            Key 与 Secret 填入系统设置即可启用自动跟单。
          </p>
        </div>
        <Link
          href={binanceReferralUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-primary/30 px-4 py-2 text-xs font-semibold text-primary transition hover:border-primary hover:bg-primary/10"
        >
          前往币安注册
          <ArrowUpRight size={14} />
        </Link>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <GuideCard
          icon={<BookOpenCheck size={18} className="text-primary" />}
          title="步骤一：注册并完成安全认证"
          points={[
            "访问币安官网或 App，完成邮箱/手机号注册",
            "依次通过身份 KYC、人脸识别与资金密码设置",
            "建议启用 2FA（Google Authenticator）增强账户安全",
          ]}
        />
        <GuideCard
          icon={<ShieldCheck size={18} className="text-emerald-500" />}
          title="步骤二：创建 API 并限制权限"
          points={[
            "在「用户中心 > API 管理」中创建新的 API Key",
            "命名后生成 Key 与 Secret，并妥善保存 Secret 值",
            "仅勾选「合约交易」与「读取权限」，关闭提现相关权限",
          ]}
        />
        <GuideCard
          icon={<Wrench size={18} className="text-surface-900" />}
          title="步骤三：在系统设置中填写参数"
          points={[
            "在控制台的「系统设置」页填写 API Key、Secret 与 Testnet 开关",
            "需要连接币安合约测试网时，将 Testnet 设为 true",
            "保存设置后即可在「交易执行」页测试跟单与风控流程",
          ]}
        />
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-50 px-4 py-3 text-xs text-surface-500">
        <p>
          小贴士：建议先在币安测试网完成跟单验证，确认风控流程无误后再切换到正式环境。
        </p>
        {onOpenSettings ? (
          <button
            type="button"
            onClick={onOpenSettings}
            className="inline-flex items-center gap-2 rounded-xl border border-primary/40 px-3 py-2 text-xs font-semibold text-primary transition hover:border-primary hover:bg-primary/10"
          >
            前往系统设置
          </button>
        ) : null}
      </footer>
    </section>
  );
}

function GuideCard({
  icon,
  title,
  points,
}: {
  icon: ReactNode;
  title: string;
  points: string[];
}) {
  return (
    <article className="space-y-3 rounded-2xl border border-surface-100 bg-surface-50/70 p-4">
      <header className="flex items-center gap-2">
        <span className="inline-flex items-center justify-center rounded-xl bg-white p-2 shadow-sm">
          {icon}
        </span>
        <h3 className="text-sm font-semibold text-surface-900">{title}</h3>
      </header>
      <ul className="list-disc space-y-2 pl-6 text-xs leading-relaxed text-surface-500">
        {points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
    </article>
  );
}
