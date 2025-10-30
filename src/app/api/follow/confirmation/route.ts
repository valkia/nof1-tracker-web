import { NextResponse } from "next/server";
import { Position } from "@/server/core/scripts/analyze-api";

interface ConfirmationRequest {
  agentId: string;
  action: 'trust_actual' | 'rebuild_history' | 'abort';
  currentPositions?: Position[];
}

interface ConfirmationCheckRequest {
  agentId: string;
  currentPositions: Position[];
}

/**
 * 检查是否需要用户确认
 */
export async function POST(request: Request) {
  try {
    const body: ConfirmationCheckRequest = await request.json();
    const { agentId, currentPositions } = body;

    if (!agentId || !currentPositions) {
      return NextResponse.json(
        { error: "Missing required fields: agentId, currentPositions" },
        { status: 400 }
      );
    }

    // 这里需要从实际的服务中获取FollowService实例
    // 由于FollowService需要依赖注入，这里简化处理
    // 实际项目中应该通过依赖注入容器获取
    // 为了演示，这里返回模拟数据

    // 模拟持仓验证逻辑
    const needsConfirmation = currentPositions.some(pos => {
      // 如果有新持仓或者价格/数量差异较大，则需要确认
      return pos.entry_price < 1000 || pos.quantity > 1; // 简单的模拟条件
    });

    return NextResponse.json({
      needsConfirmation,
      message: needsConfirmation
        ? "检测到持仓不一致，需要用户确认"
        : "持仓一致，无需确认"
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to check confirmation requirement:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * 处理用户确认
 */
export async function PUT(request: Request) {
  try {
    const body: ConfirmationRequest = await request.json();
    const { agentId, action, currentPositions } = body;

    if (!agentId || !action) {
      return NextResponse.json(
        { error: "Missing required fields: agentId, action" },
        { status: 400 }
      );
    }

    // 这里需要从实际的服务中获取FollowService实例
    // 实际项目中应该通过依赖注入容器获取
    // 为了演示，这里返回模拟数据

    // 模拟用户确认处理逻辑
    let message = '';
    switch (action) {
      case 'trust_actual':
        message = "已选择信任实际持仓，将基于当前实际持仓进行操作";
        break;
      case 'rebuild_history':
        message = "已选择重建历史记录，将基于实际持仓重新构建历史";
        break;
      case 'abort':
        message = "已选择中止操作，暂停跟单直到手动检查";
        break;
    }

    return NextResponse.json({
      success: true,
      action,
      message,
      timestamp: Date.now()
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to process user confirmation:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}