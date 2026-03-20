import { createClient } from "@libsql/client";
import path from "path";

let client = null;

export function getDb() {
  if (!client) {
    const dbPath = path.join(process.cwd(), "telechat.db");
    client = createClient({ url: `file:${dbPath}` });
    initDb(client);
  }
  return client;
}

async function initDb(db) {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      avatar_color TEXT DEFAULT '#00a884',
      status_text TEXT DEFAULT 'Hey there! I am using TeleChat',
      last_seen INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      is_group INTEGER DEFAULT 0,
      name TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS conversation_members (
      conversation_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      joined_at INTEGER DEFAULT (strftime('%s','now')),
      PRIMARY KEY (conversation_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      content TEXT NOT NULL,
      message_type TEXT DEFAULT 'text',
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS call_signals (
      id TEXT PRIMARY KEY,
      caller_id TEXT NOT NULL,
      callee_id TEXT NOT NULL,
      conversation_id TEXT,
      signal_type TEXT NOT NULL,
      signal_data TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      consumed INTEGER DEFAULT 0
    );
  `);
}

// Helper to get current unix timestamp
export function now() {
  return Math.floor(Date.now() / 1000);
}
