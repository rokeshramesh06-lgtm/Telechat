import { getSession } from "@/lib/auth";
import { getDb, now } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Update last seen
  const db = getDb();
  await db.execute({
    sql: "UPDATE users SET last_seen = ? WHERE id = ?",
    args: [now(), session.userId],
  });

  return NextResponse.json({ user: session });
}
