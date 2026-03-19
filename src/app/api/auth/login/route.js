import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getDb } from '../../../../lib/db.mjs';

export async function POST(request) {
  const { username, password } = await request.json();
  if (!username || !password) {
    return NextResponse.json({ error: 'Username and password required' }, { status: 400 });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
  }

  return NextResponse.json({
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    avatarColor: user.avatar_color,
  });
}
