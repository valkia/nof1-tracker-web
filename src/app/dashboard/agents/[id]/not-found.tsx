import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function AgentNotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 bg-surface-50 px-6 text-center">
      <div className="rounded-3xl border border-surface-200 bg-white px-10 py-12 shadow-sm">
        <h1 className="text-2xl font-semibold text-surface-900">
          未找到对应的 Agent
        </h1>
        <p className="pt-2 text-sm text-surface-500">
          请确认 URL 中的模型 ID 是否正确，或返回仪表盘重新选择。
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex items-center gap-2 rounded-full border border-surface-200 px-4 py-2 text-xs font-semibold text-surface-600 transition hover:border-primary/40 hover:text-primary"
        >
          <ArrowLeft size={14} />
          返回仪表盘
        </Link>
      </div>
    </div>
  );
}
