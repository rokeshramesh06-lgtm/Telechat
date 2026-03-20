import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { NextResponse } from "next/server";

// Poll for new messages across all conversations
export async function GET(request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const since = searchParams.get("since") || "0";

  const db = getDb();

  const result = await db.execute({
    sql: `SELECT m.*, u.username, u.display_name, u.avatar_color
          FROM messages m
          JOIN users u ON m.sender_id = u.id
          JOIN conversation_members cm ON m.conversation_id = cm.conversation_id
          WHERE cm.user_id = ? AND m.created_at > ? AND m.sender_id != ?
          ORDER BY m.created_at ASC`,
    args: [session.userId, parseInt(since), session.userId],
  });

  const messages = result.rows.map((r) => ({
    id: r.id,
    conversationId: r.conversation_id,
    senderId: r.sender_id,
    senderName: r.display_name,
    senderColor: r.avatar_color,
    content: r.content,
    messageType: r.message_type,
    createdAt: r.created_at,
  }));

  return NextResponse.json({ messages });
}
