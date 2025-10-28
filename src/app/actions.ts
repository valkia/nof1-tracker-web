/* eslint-disable no-console -- operational logs are intentional */
"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { fetchAgentOverviews } from "@/server/nof1/service";

/**
 * 手动刷新仪表盘数据。
 * 在触发数据同步或外部任务结束后调用，用于刷新缓存并更新页面。
 */
export async function refreshDashboard() {
  await fetchAgentOverviews({ force: true });
  revalidateTag("agent-overviews");
  revalidatePath("/dashboard");
  console.log("Dashboard cache revalidated");
}
