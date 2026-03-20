import { getDb, now } from "@/lib/db";
import { v4 as uuid } from "uuid";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
    }

    const db = getDb();

    const result = await db.execute({
      sql: "SELECT * FROM users WHERE username = ?",
      args: [username.toLowerCase()],
    });

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }

    // Update last seen
    await db.execute({
      sql: "UPDATE users SET last_seen = ? WHERE id = ?",
      args: [now(), user.id],
    });

    // Create session
    const sessionId = uuid();
    const expiresAt = now() + 60 * 60 * 24 * 30;

    await db.execute({
      sql: "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)",
      args: [sessionId, user.id, expiresAt],
    });

    const cookieStore = await cookies();
    cookieStore.set("session_id", sessionId, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        avatarColor: user.avatar_color,
        statusText: user.status_text,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
