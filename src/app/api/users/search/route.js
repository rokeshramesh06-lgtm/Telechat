import { NextResponse } from 'next/server';
import { getDb } from '../../../../lib/db.mjs';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');
  const exclude = searchParams.get('exclude') || '';
  if (!q) return NextResponse.json([]);

  const db = getDb();
  const users = db.prepare(
    'SELECT id, username, display_name, avatar_color, status FROM users WHERE (username LIKE ? OR display_name LIKE ?) AND id != ?'
  ).all(`%${q}%`, `%${q}%`, exclude);

  return NextResponse.json(users);
}
