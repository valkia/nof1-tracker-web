import { NextResponse } from "next/server";
import type { ProfitRange } from "@/types/agents";
import {
  fetchAgentProfitSeries,
} from "@/server/nof1/service";

const VALID_RANGES: ProfitRange[] = [
  "total",
  "month",
  "week",
  "day",
];
const DEFAULT_RANGE: ProfitRange = "total";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rangeParam = url.searchParams.get("range");
  const range = parseRange(rangeParam);

  try {
    const payload = await fetchAgentProfitSeries(range);
    return NextResponse.json({
      data: {
        ...payload,
      },
    });
  } catch (error) {
    console.error("Failed to load agent equity series", error);
    return NextResponse.json(
      { error: "Unable to load agent equity series" },
      { status: 500 },
    );
  }
}

function parseRange(value: string | null): ProfitRange {
  if (!value) {
    return DEFAULT_RANGE;
  }

  if (VALID_RANGES.includes(value as ProfitRange)) {
    return value as ProfitRange;
  }

  return DEFAULT_RANGE;
}
