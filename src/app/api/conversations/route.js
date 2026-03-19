import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../../../lib/db.mjs';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  const db = getDb();
  const conversations = db.prepare(`
    SELECT c.id, c.type, c.name, c.created_at,
      (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
      (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_time,
      (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND sender_id != ? AND read_at IS NULL) as unread_count
    FROM conversations c
    JOIN conversation_members cm ON cm.conversation_id = c.id
    WHERE cm.user_id = ?
    ORDER BY last_message_time DESC NULLS LAST
  `).all(userId, userId);

  const enriched = conversations.map((conv) => {
    const members = db.prepare(`
      SELECT u.id, u.username, u.display_name, u.avatar_color, u.status
      FROM users u JOIN conversation_members cm ON cm.user_id = u.id
      WHERE cm.conversation_id = ?
    `).all(conv.id);
    return { ...conv, members };
  });

  return NextResponse.json(enriched);
}

export async function POST(request) {
  const { userId, otherUserId } = await request.json();
  const db = getDb();

  const existing = db.prepare(`
    SELECT c.id FROM conversations c
    JOIN conversation_members cm1 ON cm1.conversation_id = c.id AND cm1.user_id = ?
    JOIN conversation_members cm2 ON cm2.conversation_id = c.id AND cm2.user_id = ?
    WHERE c.type = 'private'
  `).get(userId, otherUserId);

  if (existing) {
    const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(existing.id);
    const members = db.prepare(`
      SELECT u.id, u.username, u.display_name, u.avatar_color, u.status
      FROM users u JOIN conversation_members cm ON cm.user_id = u.id WHERE cm.conversation_id = ?
    `).all(conv.id);
    return NextResponse.json({ ...conv, members });
  }

  const id = uuidv4();
  db.prepare('INSERT INTO conversations (id, type) VALUES (?, ?)').run(id, 'private');
  db.prepare('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)').run(id, userId);
  db.prepare('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)').run(id, otherUserId);

  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
  const members = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.avatar_color, u.status
    FROM users u JOIN conversation_members cm ON cm.user_id = u.id WHERE cm.conversation_id = ?
  `).all(id);

  return NextResponse.json({ ...conv, members });
}
