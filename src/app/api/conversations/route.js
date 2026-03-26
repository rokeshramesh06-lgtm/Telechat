import { getSession } from "@/lib/auth";
import { getDb, now } from "@/lib/db";
import { v4 as uuid } from "uuid";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const db = getDb();

  // Get conversation IDs the user is a member of
  const { data: memberships } = await db
    .from("conversation_members")
    .select("conversation_id")
    .eq("user_id", session.userId);

  if (!memberships || memberships.length === 0) {
    return NextResponse.json({ conversations: [] });
  }

  const convIds = memberships.map((m) => m.conversation_id);

  // Get conversations
  const { data: convs } = await db
    .from("conversations")
    .select("*")
    .in("id", convIds);

  // Get all members for these conversations
  const { data: allMembers } = await db
    .from("conversation_members")
    .select("conversation_id, user_id")
    .in("conversation_id", convIds);

  // Get all user details for members
  const memberUserIds = [...new Set((allMembers || []).map((m) => m.user_id))];
  const { data: memberUsers } = await db
    .from("users")
    .select("id, username, display_name, avatar_color, last_seen")
    .in("id", memberUserIds);

  const usersMap = {};
  for (const u of memberUsers || []) {
    usersMap[u.id] = u;
  }

  // Get last message for each conversation
  const conversations = [];
  for (const conv of convs || []) {
    const { data: lastMsg } = await db
      .from("messages")
      .select("content, created_at, sender_id")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const members = (allMembers || [])
      .filter((m) => m.conversation_id === conv.id)
      .map((m) => {
        const u = usersMap[m.user_id];
        return u
          ? {
              id: u.id,
              username: u.username,
              displayName: u.display_name,
              avatarColor: u.avatar_color,
              lastSeen: u.last_seen,
            }
          : null;
      })
      .filter(Boolean);

    const otherMember = members.find((m) => m.id !== session.userId);

    conversations.push({
      id: conv.id,
      isGroup: conv.is_group,
      name: conv.is_group ? conv.name : otherMember?.displayName || "Unknown",
      avatarColor: otherMember?.avatarColor || "#00a884",
      lastMessage: lastMsg?.content || null,
      lastMessageTime: lastMsg?.created_at || null,
      lastSenderId: lastMsg?.sender_id || null,
      members,
    });
  }

  // Sort by last message time
  conversations.sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0));

  return NextResponse.json({ conversations });
}

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

  // Check if DM already exists
  const { data: myConvs } = await db
    .from("conversation_members")
    .select("conversation_id")
    .eq("user_id", session.userId);

  const { data: theirConvs } = await db
    .from("conversation_members")
    .select("conversation_id")
    .eq("user_id", userId);

  const myIds = new Set((myConvs || []).map((m) => m.conversation_id));
  const sharedIds = (theirConvs || [])
    .map((m) => m.conversation_id)
    .filter((id) => myIds.has(id));

  if (sharedIds.length > 0) {
    // Check if any shared conversation is a DM (not group)
    const { data: sharedConvs } = await db
      .from("conversations")
      .select("id")
      .in("id", sharedIds)
      .eq("is_group", 0);

    if (sharedConvs && sharedConvs.length > 0) {
      return NextResponse.json({ conversationId: sharedConvs[0].id });
    }
  }

  // Create new conversation
  const conversationId = uuid();

  await db.from("conversations").insert({
    id: conversationId,
    is_group: 0,
    created_at: now(),
  });

  await db.from("conversation_members").insert([
    { conversation_id: conversationId, user_id: session.userId, joined_at: now() },
    { conversation_id: conversationId, user_id: userId, joined_at: now() },
  ]);

  return NextResponse.json({ conversationId });
}
