import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const since = parseInt(searchParams.get("since") || "0");

  const db = getDb();

  // Get user's conversation IDs
  const { data: memberships } = await db
    .from("conversation_members")
    .select("conversation_id")
    .eq("user_id", session.userId);

  const convIds = (memberships || []).map((m) => m.conversation_id);

  if (convIds.length === 0) {
    return NextResponse.json({ messages: [] });
  }

  const { data: msgs } = await db
    .from("messages")
    .select("*")
    .in("conversation_id", convIds)
    .gt("created_at", since)
    .neq("sender_id", session.userId)
    .order("created_at", { ascending: true });

  // Get sender details
  const senderIds = [...new Set((msgs || []).map((m) => m.sender_id))];
  const { data: senders } = senderIds.length > 0
    ? await db.from("users").select("id, display_name, avatar_color").in("id", senderIds)
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
