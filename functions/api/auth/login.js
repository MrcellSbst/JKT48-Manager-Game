import { buildSessionCookie, generateToken, verifyPassword } from '../_session.js';

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

  const user = await env.DB.prepare('SELECT user_id, password FROM user_h WHERE username = ?').bind(username).first();
  if (!user || !(await verifyPassword(password, user.password))) return json({ error: 'Invalid username or password.' }, 401);

  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.user_id).run();
  const token = generateToken();
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await env.DB
    .prepare('INSERT INTO sessions (session_token, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(token, user.user_id, expires.toISOString())
    .run();

  return new Response(JSON.stringify({ ok: true, username, user_id: user.user_id }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': buildSessionCookie(token, expires, request.url) },
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
