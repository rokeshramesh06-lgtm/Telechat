import { NextResponse } from 'next/server';
import { getDb } from '../../../lib/db.mjs';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  const db = getDb();
  const calls = db.prepare(`
    SELECT cl.*,
      caller.display_name as caller_name, caller.avatar_color as caller_color,
      callee.display_name as callee_name, callee.avatar_color as callee_color
    FROM call_logs cl
    JOIN users caller ON caller.id = cl.caller_id
    JOIN users callee ON callee.id = cl.callee_id
    WHERE cl.caller_id = ? OR cl.callee_id = ?
    ORDER BY cl.started_at DESC LIMIT 50
  `).all(userId, userId);

  return NextResponse.json(calls);
}
