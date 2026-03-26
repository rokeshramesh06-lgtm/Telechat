import { getSession } from "@/lib/auth";
import { getDb, now } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const db = getDb();
  await db.from("users").update({ last_seen: now() }).eq("id", session.userId);

  return NextResponse.json({ user: session });
}
