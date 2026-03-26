import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { NextResponse } from "next/server";

export async function POST() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("session_id")?.value;

  if (sessionId) {
    const db = getDb();
    await db.from("sessions").delete().eq("id", sessionId);
    cookieStore.delete("session_id");
  }

  return NextResponse.json({ ok: true });
}
