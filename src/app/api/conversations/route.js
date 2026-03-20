import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { v4 as uuid } from "uuid";
import { NextResponse } from "next/server";

// Get all conversations for current user
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const db = getDb();

  const result = await db.execute({
    sql: `SELECT c.id, c.is_group, c.name, c.created_at,
          (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
          (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_time,
          (SELECT sender_id FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_sender_id
          FROM conversations c
          JOIN conversation_members cm ON c.id = cm.conversation_id
          WHERE cm.user_id = ?
          ORDER BY last_message_time DESC NULLS LAST, c.created_at DESC`,
    args: [session.userId],
  });

  // Get members for each conversation
  const conversations = [];
  for (const row of result.rows) {
    const members = await db.execute({
      sql: `SELECT u.id, u.username, u.display_name, u.avatar_color, u.last_seen
            FROM conversation_members cm
            JOIN users u ON cm.user_id = u.id
            WHERE cm.conversation_id = ?`,
      args: [row.id],
    });

    const otherMember = members.rows.find((m) => m.id !== session.userId);

    conversations.push({
      id: row.id,
      isGroup: row.is_group,
      name: row.is_group ? row.name : otherMember?.display_name || "Unknown",
      avatarColor: otherMember?.avatar_color || "#00a884",
      lastMessage: row.last_message,
      lastMessageTime: row.last_message_time,
      lastSenderId: row.last_sender_id,
      members: members.rows.map((m) => ({
        id: m.id,
        username: m.username,
        displayName: m.display_name,
        avatarColor: m.avatar_color,
        lastSeen: m.last_seen,
      })),
    });
  }

  return NextResponse.json({ conversations });
}

// Create a new conversation (or return existing DM)
export async function POST(request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { userId } = await request.json();
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const db = getDb();

  // Check if DM conversation already exists between these two users
  const existing = await db.execute({
    sql: `SELECT c.id FROM conversations c
          JOIN conversation_members cm1 ON c.id = cm1.conversation_id AND cm1.user_id = ?
          JOIN conversation_members cm2 ON c.id = cm2.conversation_id AND cm2.user_id = ?
          WHERE c.is_group = 0`,
    args: [session.userId, userId],
  });

  if (existing.rows.length > 0) {
    return NextResponse.json({ conversationId: existing.rows[0].id });
  }

  // Create new conversation
  const conversationId = uuid();
  await db.execute({
    sql: "INSERT INTO conversations (id, is_group) VALUES (?, 0)",
    args: [conversationId],
  });

  await db.execute({
    sql: "INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)",
    args: [conversationId, session.userId],
  });

  await db.execute({
    sql: "INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)",
    args: [conversationId, userId],
  });

  return NextResponse.json({ conversationId });
}
