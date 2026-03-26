import { getSession } from "@/lib/auth";
import { getDb, now } from "@/lib/db";
import { v4 as uuid } from "uuid";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const db = getDb();

  const { data: rows } = await db
    .from("call_signals")
    .select("*")
    .eq("callee_id", session.userId)
    .eq("consumed", 0)
    .order("created_at", { ascending: true });

  if (rows && rows.length > 0) {
    const ids = rows.map((r) => r.id);
    await db.from("call_signals").update({ consumed: 1 }).in("id", ids);
  }

  // Get caller details
  const callerIds = [...new Set((rows || []).map((r) => r.caller_id))];
  const { data: callers } = callerIds.length > 0
    ? await db.from("users").select("id, display_name, avatar_color").in("id", callerIds)
    : { data: [] };

  const callerMap = {};
  for (const c of callers || []) {
    callerMap[c.id] = c;
  }

  const signals = (rows || []).map((r) => ({
    id: r.id,
    callerId: r.caller_id,
    calleeId: r.callee_id,
    callerName: callerMap[r.caller_id]?.display_name || "Unknown",
    callerColor: callerMap[r.caller_id]?.avatar_color || "#00a884",
    conversationId: r.conversation_id,
    signalType: r.signal_type,
    signalData: JSON.parse(r.signal_data),
    createdAt: r.created_at,
  }));

  return NextResponse.json({ signals });
}

export async function POST(request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { calleeId, conversationId, signalType, signalData } = await request.json();

  if (!calleeId || !signalType || !signalData) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const db = getDb();

  await db.from("call_signals").insert({
    id: uuid(),
    caller_id: session.userId,
    callee_id: calleeId,
    conversation_id: conversationId || null,
    signal_type: signalType,
    signal_data: JSON.stringify(signalData),
    created_at: now(),
  });

  return NextResponse.json({ ok: true });
}
