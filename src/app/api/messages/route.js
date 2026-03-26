import { getSession } from "@/lib/auth";
import { getDb, now } from "@/lib/db";
import { v4 as uuid } from "uuid";
import { NextResponse } from "next/server";

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

  const db = getDb();

  // Verify membership
  const { data: member } = await db
    .from("conversation_members")
    .select("user_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", session.userId)
    .single();

  if (!member) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const { data: msgs } = await db
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  // Get sender details
  const senderIds = [...new Set((msgs || []).map((m) => m.sender_id))];
  const { data: senders } = senderIds.length > 0
    ? await db.from("users").select("id, username, display_name, avatar_color").in("id", senderIds)
    : { data: [] };

  const senderMap = {};
  for (const s of senders || []) {
    senderMap[s.id] = s;
  }

  const messages = (msgs || []).map((m) => ({
    id: m.id,
    conversationId: m.conversation_id,
    senderId: m.sender_id,
    senderName: senderMap[m.sender_id]?.display_name || "Unknown",
    senderColor: senderMap[m.sender_id]?.avatar_color || "#00a884",
    content: m.content,
    messageType: m.message_type,
    createdAt: m.created_at,
  }));

  return NextResponse.json({ messages });
}

export async function POST(request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { conversationId, content } = await request.json();

  if (!conversationId || !content) {
    return NextResponse.json({ error: "conversationId and content are required" }, { status: 400 });
  }

  const db = getDb();

  // Verify membership
  const { data: member } = await db
    .from("conversation_members")
    .select("user_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", session.userId)
    .single();

  if (!member) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const messageId = uuid();
  const createdAt = now();

  await db.from("messages").insert({
    id: messageId,
    conversation_id: conversationId,
    sender_id: session.userId,
    content,
    message_type: "text",
    created_at: createdAt,
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
