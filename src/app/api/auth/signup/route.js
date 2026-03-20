import { getDb, now } from "@/lib/db";
import { v4 as uuid } from "uuid";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const AVATAR_COLORS = [
  "#00a884", "#53bdeb", "#e44da5", "#ff9500",
  "#7c5cfc", "#ff6b6b", "#2ed573", "#ffa502",
];

export async function POST(request) {
  try {
    const { username, displayName, password } = await request.json();

    if (!username || !displayName || !password) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 });
    }

    if (username.length < 3 || username.length > 20) {
      return NextResponse.json({ error: "Username must be 3-20 characters" }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    const db = getDb();

    // Check if username exists
    const existing = await db.execute({
      sql: "SELECT id FROM users WHERE username = ?",
      args: [username.toLowerCase()],
    });

    if (existing.rows.length > 0) {
      return NextResponse.json({ error: "Username already taken" }, { status: 409 });
    }

    const userId = uuid();
    const passwordHash = await bcrypt.hash(password, 10);
    const avatarColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

    await db.execute({
      sql: "INSERT INTO users (id, username, display_name, password_hash, avatar_color) VALUES (?, ?, ?, ?, ?)",
      args: [userId, username.toLowerCase(), displayName, passwordHash, avatarColor],
    });

    // Create session
    const sessionId = uuid();
    const expiresAt = now() + 60 * 60 * 24 * 30; // 30 days

    await db.execute({
      sql: "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)",
      args: [sessionId, userId, expiresAt],
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
        id: userId,
        username: username.toLowerCase(),
        displayName,
        avatarColor,
      },
    });
  } catch (err) {
    console.error("Signup error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
