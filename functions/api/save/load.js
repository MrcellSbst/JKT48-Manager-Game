import { getSessionUser } from '../_session.js';

export async function onRequestGet({ request, env }) {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated.' }, 401);

  const row = await env.DB
    .prepare('SELECT save_data, updated_at FROM jkt48_manager_data WHERE user_id = ?')
    .bind(user.user_id)
    .first();

  if (!row) return json({ exists: false }, 404);
  return json({ exists: true, data: row });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
