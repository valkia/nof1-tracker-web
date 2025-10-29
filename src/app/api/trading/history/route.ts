import { NextResponse } from "next/server";
import { getTradeHistory } from "@/server/nof1/trading";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const { searchParams } = url;

  const symbol = searchParams.get("symbol") ?? undefined;
  const range = searchParams.get("range") ?? undefined;

  const startTimeParam = searchParams.get("startTime");
  const endTimeParam = searchParams.get("endTime");
  const forceRefresh = searchParams.get("forceRefresh") === "true";

  const startTime =
    startTimeParam !== null ? Number.parseInt(startTimeParam, 10) : undefined;
  const endTime =
    endTimeParam !== null ? Number.parseInt(endTimeParam, 10) : undefined;

  try {
    const history = await getTradeHistory({
      symbol,
      range: range ?? undefined,
      startTime:
        typeof startTime === "number" && Number.isFinite(startTime)
          ? startTime
          : undefined,
      endTime:
        typeof endTime === "number" && Number.isFinite(endTime) ? endTime : undefined,
      forceRefresh,
    });
    return NextResponse.json({ data: history });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load trade history";
    const status =
      message.includes("Binance API Key") || message.includes("BINANCE_API")
        ? 412
        : 500;
    console.error("Failed to load trade history", message);
    return NextResponse.json({ error: message }, { status });
  }
}
