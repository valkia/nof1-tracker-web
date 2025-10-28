import { NextResponse } from "next/server";
import {
  getTrackerSettings,
  updateTrackerSettings,
} from "@/server/nof1/settings";

export async function GET() {
  try {
    const settings = await getTrackerSettings();
    return NextResponse.json({ data: settings });
  } catch (error) {
    console.error("Failed to load tracker settings", error);
    return NextResponse.json(
      { error: "Unable to load settings" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const payload = await request.json();
    const settings = await updateTrackerSettings(payload);
    return NextResponse.json({ data: settings });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to update settings";
    console.error("Failed to update tracker settings", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
