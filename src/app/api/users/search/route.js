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

  const { data } = await db
    .from("users")
    .select("id, username, display_name, avatar_color, status_text, last_seen")
    .neq("id", session.userId)
    .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
    .limit(20);

  const users = (data || []).map((r) => ({
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    avatarColor: r.avatar_color,
    statusText: r.status_text,
    lastSeen: r.last_seen,
  }));

  return NextResponse.json({ users });
}
