import { NextResponse } from "next/server";
import { executeFollowAgent } from "@/server/nof1/trading";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const result = await executeFollowAgent(payload);
    return NextResponse.json({ data: result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to execute follow";

    const status = message.includes("BINANCE_API")
      ? 412
      : message.includes("agentId")
        ? 400
        : 500;

    console.error("Failed to execute follow", message);
    return NextResponse.json({ error: message }, { status });
  }
}
