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

    const { data: user } = await db
      .from("users")
      .select("*")
      .eq("username", username.toLowerCase())
      .single();

    if (!user) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }

    await db.from("users").update({ last_seen: now() }).eq("id", user.id);

    const sessionId = uuid();
    const expiresAt = now() + 60 * 60 * 24 * 30;

    await db.from("sessions").insert({
      id: sessionId,
      user_id: user.id,
      created_at: now(),
      expires_at: expiresAt,
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
