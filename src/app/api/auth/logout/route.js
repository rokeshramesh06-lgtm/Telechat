import { cookies } from "next/headers";
import { ensureDb } from "@/lib/db";
import { NextResponse } from "next/server";

export async function POST() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("session_id")?.value;

  if (sessionId) {
    const db = await ensureDb();
    await db.execute({ sql: "DELETE FROM sessions WHERE id = ?", args: [sessionId] });
    cookieStore.delete("session_id");
  }

  return NextResponse.json({ ok: true });
}
