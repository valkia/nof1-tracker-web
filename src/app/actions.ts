/* eslint-disable no-console -- console output is useful for operational feedback */
"use server";

import { revalidatePath } from "next/cache";
import { fetchAgentOverviews } from "@/server/nof1/service";

/**
 * 手动刷新仪表盘数据。
 * 当触发数据同步或外部任务结束后，可以调用该动作重新验证缓存。
 */
export async function refreshDashboard() {
  await fetchAgentOverviews();
  revalidatePath("/dashboard");
  console.log("Dashboard cache revalidated");
}
