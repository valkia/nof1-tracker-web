import {
  Activity,
  BookOpen,
  Bot,
  LayoutDashboard,
  ListTree,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { SidebarNav } from "./sidebar-nav";

export function Sidebar() {
  return (
    <aside className="m-4 mr-0 hidden flex-col gap-8 rounded-3xl border border-surface-200 bg-white/80 px-4 pb-6 pt-6 shadow-sm md:flex">
      <Link
        href="/dashboard"
        className="flex items-center gap-3 text-primary"
        aria-label="返回控制中心"
      >
        <span className="inline-flex size-10 items-center justify-center rounded-2xl bg-primary/10">
          <Bot size={22} />
        </span>
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide">
            Nof1 Tracker
          </p>
          <p className="text-xs text-surface-400">AI Agent 控制台</p>
        </div>
      </Link>

      <SidebarNav aria-label="仪表盘导航" className="space-y-2">
        <SidebarNav.Item
          icon={<LayoutDashboard size={16} />}
          href="/dashboard"
        >
          交易概览
        </SidebarNav.Item>
        <SidebarNav.Item
          icon={<BookOpen size={16} />}
          href="/dashboard?tab=guide"
        >
          使用引导
        </SidebarNav.Item>
        <SidebarNav.Item
          icon={<Activity size={16} />}
          href="/dashboard?tab=trading"
        >
          交易执行
        </SidebarNav.Item>
        <SidebarNav.Item
          icon={<Settings size={16} />}
          href="/dashboard?tab=settings"
        >
          系统设置
        </SidebarNav.Item>
      </SidebarNav>

      <SidebarNav aria-label="数据导航" className="space-y-2">
        <SidebarNav.Item icon={<ListTree size={16} />} href="/dashboard#agents">
          Agent 列表
        </SidebarNav.Item>
      </SidebarNav>

      <div className="mt-auto rounded-2xl border border-surface-200 bg-surface-50/80 p-4 text-xs text-surface-500">
        <p className="font-semibold text-surface-700">使用提示</p>
        <p className="pt-2 leading-relaxed">
          在“系统设置”中填入 Binance API Key、Secret 以及 Testnet 选项，保存后即可启用实时跟单。
        </p>
      </div>
    </aside>
  );
}
