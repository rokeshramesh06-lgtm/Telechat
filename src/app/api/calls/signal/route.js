import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { v4 as uuid } from "uuid";
import { NextResponse } from "next/server";

// Get pending signals for current user
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const db = getDb();

  const result = await db.execute({
    sql: `SELECT cs.*, u.display_name as caller_name, u.avatar_color as caller_color
          FROM call_signals cs
          JOIN users u ON cs.caller_id = u.id
          WHERE cs.callee_id = ? AND cs.consumed = 0
          ORDER BY cs.created_at ASC`,
    args: [session.userId],
  });

  // Mark as consumed
  if (result.rows.length > 0) {
    const ids = result.rows.map((r) => r.id);
    for (const id of ids) {
      await db.execute({
        sql: "UPDATE call_signals SET consumed = 1 WHERE id = ?",
        args: [id],
      });
    }
  }

  const signals = result.rows.map((r) => ({
    id: r.id,
    callerId: r.caller_id,
    calleeId: r.callee_id,
    callerName: r.caller_name,
    callerColor: r.caller_color,
    conversationId: r.conversation_id,
    signalType: r.signal_type,
    signalData: JSON.parse(r.signal_data),
    createdAt: r.created_at,
  }));

  return NextResponse.json({ signals });
}

// Send a signal
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
  const signalId = uuid();

  await db.execute({
    sql: "INSERT INTO call_signals (id, caller_id, callee_id, conversation_id, signal_type, signal_data) VALUES (?, ?, ?, ?, ?, ?)",
    args: [signalId, session.userId, calleeId, conversationId || null, signalType, JSON.stringify(signalData)],
  });

  return NextResponse.json({ ok: true });
}
