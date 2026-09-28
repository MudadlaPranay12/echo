// app/api/echo/route.ts
import { runAgent, type EchoRequestMessage } from "@/lib/echo_agent_core";

interface AgentRequestBody { messages: EchoRequestMessage[]; memoryOn?: boolean }

export async function POST(req: Request) {
  try {
    const { messages, memoryOn } = (await req.json()) as AgentRequestBody;
    return Response.json(await runAgent(messages, memoryOn !== false));
  } catch (e: unknown) {
    console.error("echo route error:", e instanceof Error ? e.message : e);
    return Response.json({ reply: "Something went wrong. Please try again.", trace: [] }, { status: 500 });
  }
}
