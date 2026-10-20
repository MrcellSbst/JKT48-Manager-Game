import { getSessionUser } from '../_session.js';

export async function onRequestPost({ request, env }) {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated.' }, 401);
  return json({ error: 'Legacy cloud save migration has been retired. Refresh the game to continue.', code: 'legacy_migration_retired' }, 410);
}

function json(data, status) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
