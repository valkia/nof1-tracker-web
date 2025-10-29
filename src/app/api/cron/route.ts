import { NextResponse } from "next/server";
import { cronManager } from "@/server/nof1/cron-manager";
import type { CronTaskCreateInput } from "@/server/nof1/cron-manager";

/**
 * 获取所有 cron 任务
 * GET /api/cron
 * 
 * TODO: 添加身份验证，根据登录用户过滤任务
 */
export async function GET(request: Request) {
  try {
    // TODO: 从请求中获取用户ID
    // const userId = await getUserIdFromRequest(request);
    const userId = undefined; // 预留

    const tasks = await cronManager.getAllTasks(userId);
    
    return NextResponse.json({ data: tasks });
  } catch (error) {
    const message = error instanceof Error ? error.message : "获取任务列表失败";
    console.error("[API] GET /api/cron failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * 创建新的 cron 任务
 * POST /api/cron
 * 
 * Body: {
 *   agentId: string;
 *   options: Partial<CommandOptions>;
 *   intervalSeconds: number;
 * }
 * 
 * TODO: 添加身份验证，仅允许登录用户创建任务
 */
export async function POST(request: Request) {
  try {
    // TODO: 验证用户是否已登录
    // const userId = await getUserIdFromRequest(request);
    // if (!userId) {
    //   return NextResponse.json({ error: "需要登录" }, { status: 401 });
    // }

    const body = await request.json();
    const { agentId, options, intervalSeconds } = body;

    // 验证必需参数
    if (!agentId || typeof agentId !== "string") {
      return NextResponse.json(
        { error: "缺少必需参数: agentId" },
        { status: 400 },
      );
    }

    if (!intervalSeconds || typeof intervalSeconds !== "number") {
      return NextResponse.json(
        { error: "缺少必需参数: intervalSeconds" },
        { status: 400 },
      );
    }

    if (intervalSeconds < 5) {
      return NextResponse.json(
        { error: "轮询周期不能小于 5 秒" },
        { status: 400 },
      );
    }

    const input: CronTaskCreateInput = {
      agentId,
      options: options || {},
      intervalSeconds,
      // userId, // TODO: 添加用户ID
    };

    const task = await cronManager.createTask(input);
    
    return NextResponse.json({ data: task }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "创建任务失败";
    console.error("[API] POST /api/cron failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

