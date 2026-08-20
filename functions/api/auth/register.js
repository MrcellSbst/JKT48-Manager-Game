import { buildSessionCookie, generateToken, hashPassword } from '../_session.js';

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }

  const username = (body.username || '').trim();
  const password = (body.password || '').trim();
  if (!username || !password) return json({ error: 'Username and password are required.' }, 400);
  if (username.length < 3 || username.length > 32) return json({ error: 'Username must be 3-32 characters.' }, 400);
  if (password.length < 6) return json({ error: 'Password must be at least 6 characters.' }, 400);
  if (!/^[a-zA-Z0-9_]+$/.test(username)) return json({ error: 'Username may only contain letters, numbers, and underscores.' }, 400);

  const existing = await env.DB.prepare('SELECT user_id FROM user_h WHERE username = ?').bind(username).first();
  if (existing) return json({ error: 'Username already taken.' }, 409);

  const userId = crypto.randomUUID();
  await env.DB
    .prepare('INSERT INTO user_h (user_id, username, password) VALUES (?, ?, ?)')
    .bind(userId, username, await hashPassword(password))
    .run();

  const token = generateToken();
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await env.DB
    .prepare('INSERT INTO sessions (session_token, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(token, userId, expires.toISOString())
    .run();

  return new Response(JSON.stringify({ ok: true, username, user_id: userId }), {
    status: 201,
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': buildSessionCookie(token, expires, request.url) },
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
