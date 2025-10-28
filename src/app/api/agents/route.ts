import { NextResponse } from "next/server";
import { fetchAgentOverviews } from "@/server/nof1/service";

export async function GET() {
  try {
    const agents = await fetchAgentOverviews({ force: true });
    return NextResponse.json({ data: agents });
  } catch (error) {
    console.error("Failed to load agents", error);
    return NextResponse.json(
      { error: "Unable to load agents" },
      { status: 500 },
    );
  }
}
