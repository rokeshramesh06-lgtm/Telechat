import { ensureDb, now } from "./db";
import { cookies } from "next/headers";

export async function getSession() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("session_id")?.value;
  if (!sessionId) return null;

  const db = await ensureDb();
  const result = await db.execute({
    sql: "SELECT s.*, u.id as uid, u.username, u.display_name, u.avatar_color, u.status_text FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.id = ? AND s.expires_at > ?",
    args: [sessionId, now()],
  });

  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    sessionId: row.id,
    userId: row.uid,
    username: row.username,
    displayName: row.display_name,
    avatarColor: row.avatar_color,
    statusText: row.status_text,
  };
}
