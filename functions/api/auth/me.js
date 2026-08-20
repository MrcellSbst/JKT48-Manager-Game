import { getSessionUser } from '../_session.js';

export async function onRequestGet({ request, env }) {
  const user = await getSessionUser(request, env);
  return user
    ? json({ ok: true, username: user.username, user_id: user.user_id })
    : json({ error: 'Not authenticated.' }, 401);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
