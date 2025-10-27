import { NextResponse } from "next/server";
import { fetchAgentDetail } from "@/server/nof1/service";

interface Params {
  params: {
    id: string;
  };
}

export async function GET(request: Request, { params }: Params) {
  try {
    const agent = await fetchAgentDetail(params.id);

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    return NextResponse.json({ data: agent });
  } catch (error) {
    console.error(`Failed to load agent ${params.id}`, error);
    return NextResponse.json(
      { error: "Unable to load agent" },
      { status: 500 },
    );
  }
}
