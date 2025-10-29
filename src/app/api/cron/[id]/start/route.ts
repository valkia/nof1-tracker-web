import { NextResponse } from "next/server";
import { cronManager } from "@/server/nof1/cron-manager";

interface RouteParams {
  params: {
    id: string;
  };
}

/**
 * 启动 cron 任务
 * POST /api/cron/[id]/start
 * 
 * TODO: 添加身份验证，仅允许启动自己的任务
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = params;

    // TODO: 从请求中获取用户ID
    // const userId = await getUserIdFromRequest(request);
    const userId = undefined; // 预留

    const task = await cronManager.startTask(id, userId);
    
    return NextResponse.json({ data: task });
  } catch (error) {
    const message = error instanceof Error ? error.message : "启动任务失败";
    console.error(`[API] POST /api/cron/${params.id}/start failed:`, message);
    
    const status = message.includes("不存在") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

