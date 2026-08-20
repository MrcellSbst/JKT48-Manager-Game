import { clearSessionCookie } from '../_session.js';

function parseCookie(cookieString, name) {
  const match = cookieString
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

export async function onRequestPost({ request, env }) {
  const token = parseCookie(request.headers.get('Cookie') || '', 'session_token');
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE session_token = ?').bind(token).run();

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': clearSessionCookie(request.url) },
  });
}
