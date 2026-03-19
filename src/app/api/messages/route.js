import { NextResponse } from 'next/server';
import { getDb } from '../../../lib/db.mjs';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const conversationId = searchParams.get('conversationId');
  if (!conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 });

  const db = getDb();
  const messages = db.prepare(`
    SELECT m.*, u.username as sender_username, u.display_name as sender_name, u.avatar_color as sender_color
    FROM messages m JOIN users u ON u.id = m.sender_id
    WHERE m.conversation_id = ?
    ORDER BY m.created_at ASC
  `).all(conversationId);

  return NextResponse.json(messages);
}
