import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") || "";

  if (query.length < 1) {
    return NextResponse.json({ users: [] });
  }

  const db = getDb();
  const result = await db.execute({
    sql: "SELECT id, username, display_name, avatar_color, status_text, last_seen FROM users WHERE (username LIKE ? OR display_name LIKE ?) AND id != ? LIMIT 20",
    args: [`%${query}%`, `%${query}%`, session.userId],
  });

  const users = result.rows.map((r) => ({
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    avatarColor: r.avatar_color,
    statusText: r.status_text,
    lastSeen: r.last_seen,
  }));

  return NextResponse.json({ users });
}
