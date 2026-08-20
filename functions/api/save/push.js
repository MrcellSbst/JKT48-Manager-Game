import { getSessionUser } from '../_session.js';

const MAX_SAVE_LENGTH = 8_000_000;

export async function onRequestPost({ request, env }) {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated.' }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }

  if (typeof body.save_data !== 'string' || body.save_data.length === 0) {
    return json({ error: 'Encrypted save data is required.' }, 400);
  }
  if (body.save_data.length > MAX_SAVE_LENGTH) return json({ error: 'Save data is too large.' }, 413);

  await env.DB
    .prepare(
      `INSERT INTO jkt48_manager_data (user_id, username, save_data, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         username = excluded.username,
         save_data = excluded.save_data,
         updated_at = datetime('now')`,
    )
    .bind(user.user_id, user.username, body.save_data)
    .run();

  return json({ ok: true, updated_at: new Date().toISOString() });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
