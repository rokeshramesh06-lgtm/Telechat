import { getSession } from "@/lib/auth";
import { ensureDb } from "@/lib/db";
import { v4 as uuid } from "uuid";
import { NextResponse } from "next/server";

// Get messages for a conversation
export async function GET(request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const conversationId = searchParams.get("conversationId");

  if (!conversationId) {
    return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
  }

  const db = await ensureDb();

  // Verify user is member of conversation
  const member = await db.execute({
    sql: "SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?",
    args: [conversationId, session.userId],
  });

  if (member.rows.length === 0) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const result = await db.execute({
    sql: `SELECT m.*, u.username, u.display_name, u.avatar_color
          FROM messages m
          JOIN users u ON m.sender_id = u.id
          WHERE m.conversation_id = ?
          ORDER BY m.created_at ASC`,
    args: [conversationId],
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

// Send a message
export async function POST(request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { conversationId, content } = await request.json();

  if (!conversationId || !content) {
    return NextResponse.json({ error: "conversationId and content are required" }, { status: 400 });
  }

  const db = await ensureDb();

  // Verify membership
  const member = await db.execute({
    sql: "SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?",
    args: [conversationId, session.userId],
  });

  if (member.rows.length === 0) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const messageId = uuid();
  const createdAt = Math.floor(Date.now() / 1000);

  await db.execute({
    sql: "INSERT INTO messages (id, conversation_id, sender_id, content, created_at) VALUES (?, ?, ?, ?, ?)",
    args: [messageId, conversationId, session.userId, content, createdAt],
  });

  return NextResponse.json({
    message: {
      id: messageId,
      conversationId,
      senderId: session.userId,
      senderName: session.displayName,
      senderColor: session.avatarColor,
      content,
      messageType: "text",
      createdAt,
    },
  });
}
