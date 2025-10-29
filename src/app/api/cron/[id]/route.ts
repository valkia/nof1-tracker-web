import { NextResponse } from "next/server";
import { cronManager } from "@/server/nof1/cron-manager";

interface RouteParams {
  params: {
    id: string;
  };
}

/**
 * 获取单个 cron 任务
 * GET /api/cron/[id]
 * 
 * TODO: 添加身份验证，仅允许查看自己的任务
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = params;

    // TODO: 从请求中获取用户ID
    // const userId = await getUserIdFromRequest(request);
    const userId = undefined; // 预留

    const task = await cronManager.getTask(id, userId);
    
    if (!task) {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    }

    return NextResponse.json({ data: task });
  } catch (error) {
    const message = error instanceof Error ? error.message : "获取任务失败";
    console.error(`[API] GET /api/cron/${params.id} failed:`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * 更新 cron 任务
 * PUT /api/cron/[id]
 * 
 * Body: {
 *   intervalSeconds?: number;
 *   options?: Partial<CommandOptions>;
 * }
 * 
 * TODO: 添加身份验证，仅允许更新自己的任务
 */
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { id } = params;

    // TODO: 从请求中获取用户ID
    // const userId = await getUserIdFromRequest(request);
    const userId = undefined; // 预留

    const body = await request.json();
    const { intervalSeconds, options } = body;

    // 验证参数
    if (intervalSeconds !== undefined && intervalSeconds < 5) {
      return NextResponse.json(
        { error: "轮询周期不能小于 5 秒" },
        { status: 400 },
      );
    }

    const updates: Parameters<typeof cronManager.updateTask>[1] = {};
    
    if (intervalSeconds !== undefined) {
      updates.intervalSeconds = intervalSeconds;
    }
    
    if (options !== undefined) {
      updates.options = options;
    }

    const task = await cronManager.updateTask(id, updates, userId);
    
    return NextResponse.json({ data: task });
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新任务失败";
    console.error(`[API] PUT /api/cron/${params.id} failed:`, message);
    
    const status = message.includes("不存在") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * 删除 cron 任务
 * DELETE /api/cron/[id]
 * 
 * TODO: 添加身份验证，仅允许删除自己的任务
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = params;

    // TODO: 从请求中获取用户ID
    // const userId = await getUserIdFromRequest(request);
    const userId = undefined; // 预留

    await cronManager.deleteTask(id, userId);
    
    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "删除任务失败";
    console.error(`[API] DELETE /api/cron/${params.id} failed:`, message);
    
    const status = message.includes("不存在") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

