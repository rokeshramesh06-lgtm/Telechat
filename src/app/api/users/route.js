import { NextResponse } from 'next/server';
import { getDb } from '../../../lib/db.mjs';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const exclude = searchParams.get('exclude');
  const db = getDb();

  let users;
  if (exclude) {
    users = db.prepare('SELECT id, username, display_name, avatar_color, status, last_seen FROM users WHERE id != ?').all(exclude);
  } else {
    users = db.prepare('SELECT id, username, display_name, avatar_color, status, last_seen FROM users').all();
  }
  return NextResponse.json(users);
}
