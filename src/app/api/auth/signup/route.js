import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../../../../lib/db.mjs';

export async function POST(request) {
  const { username, displayName, password } = await request.json();
  if (!username || !password || !displayName) {
    return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
  }
  if (username.length < 3 || password.length < 6) {
    return NextResponse.json({ error: 'Username must be 3+ chars, password 6+ chars' }, { status: 400 });
  }

  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return NextResponse.json({ error: 'Username already taken' }, { status: 409 });
  }

  const id = uuidv4();
  const passwordHash = bcrypt.hashSync(password, 10);
  const colors = ['#0088cc', '#e53935', '#43a047', '#fb8c00', '#8e24aa', '#00acc1'];
  const avatarColor = colors[Math.floor(Math.random() * colors.length)];

  db.prepare('INSERT INTO users (id, username, display_name, password_hash, avatar_color) VALUES (?, ?, ?, ?, ?)')
    .run(id, username, displayName, passwordHash, avatarColor);

  return NextResponse.json({ id, username, displayName, avatarColor });
}
