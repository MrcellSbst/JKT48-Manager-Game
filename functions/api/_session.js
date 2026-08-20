export async function getSessionUser(request, env) {
  const token = parseCookie(request.headers.get('Cookie') || '', 'session_token');
  if (!token) return null;

  const row = await env.DB
    .prepare(
      `SELECT s.user_id, s.expires_at, u.username
       FROM sessions s
       JOIN user_h u ON u.user_id = s.user_id
       WHERE s.session_token = ?`,
    )
    .bind(token)
    .first();

  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    await env.DB.prepare('DELETE FROM sessions WHERE session_token = ?').bind(token).run();
    return null;
  }

  return { user_id: row.user_id, username: row.username };
}

function parseCookie(cookieString, name) {
  const match = cookieString
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

export function buildSessionCookie(token, expires, requestUrl = '') {
  const secure = requestUrl.startsWith('https://') ? '; Secure' : '';
  return `session_token=${token}; HttpOnly${secure}; SameSite=Lax; Path=/; Expires=${expires.toUTCString()}`;
}

export function clearSessionCookie(requestUrl = '') {
  const secure = requestUrl.startsWith('https://') ? '; Secure' : '';
  return `session_token=; HttpOnly${secure}; SameSite=Lax; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

export function generateToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function hashPassword(password) {
  const salt = generateToken();
  return `${salt}:${await deriveKey(password, salt)}`;
}

export async function verifyPassword(password, stored) {
  const [salt, expectedHash] = stored.split(':');
  if (!salt || !expectedHash) return false;
  return (await deriveKey(password, salt)) === expectedHash;
}

async function deriveKey(password, salt) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: encoder.encode(salt), iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  return Array.from(new Uint8Array(bits), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
