import { getDb, now } from "./db";
import { cookies } from "next/headers";

export async function getSession() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("session_id")?.value;
  if (!sessionId) return null;

  const db = getDb();

  const { data: session } = await db
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .gt("expires_at", now())
    .single();

  if (!session) return null;

  const { data: user } = await db
    .from("users")
    .select("id, username, display_name, avatar_color, status_text")
    .eq("id", session.user_id)
    .single();

  if (!user) return null;

  return {
    sessionId: session.id,
    userId: user.id,
    username: user.username,
    displayName: user.display_name,
    avatarColor: user.avatar_color,
    statusText: user.status_text,
  };
}
