export const PATCHNOTE_SEEN_KEY = 'jkt48-manager-patchnote-seen-v1';
export const JAKARTA_TIME_ZONE = 'Asia/Jakarta';

export function readSeenPatchnote(storage = null) {
  try {
    const target = storage ?? globalThis.localStorage;
    const value = JSON.parse(target?.getItem(PATCHNOTE_SEEN_KEY) ?? 'null');
    if (!value || typeof value !== 'object') return null;
    const publishedAt = String(value.publishedAt ?? '');
    return Number.isNaN(Date.parse(publishedAt)) ? null : {
      patchnoteId: String(value.patchnoteId ?? ''),
      publishedAt,
    };
  } catch {
    return null;
  }
}

export function shouldShowPatchnote(patchnote, seen = readSeenPatchnote()) {
  const publishedAt = Date.parse(patchnote?.publishedAt ?? '');
  if (!patchnote?.patchnoteId || Number.isNaN(publishedAt)) return false;
  if (!seen) return true;
  const seenAt = Date.parse(seen.publishedAt ?? '');
  return Number.isNaN(seenAt)
    || publishedAt > seenAt
    || (publishedAt === seenAt && patchnote.patchnoteId !== seen.patchnoteId);
}

export function rememberPatchnote(patchnote, storage = null) {
  if (!patchnote?.patchnoteId || Number.isNaN(Date.parse(patchnote?.publishedAt ?? ''))) return false;
  try {
    const target = storage ?? globalThis.localStorage;
    target?.setItem(PATCHNOTE_SEEN_KEY, JSON.stringify({
      patchnoteId: patchnote.patchnoteId,
      publishedAt: patchnote.publishedAt,
    }));
    return true;
  } catch {
    return false;
  }
}

export async function hardRefreshPage({
  navigatorObject = globalThis.navigator,
  cachesObject = globalThis.caches,
  locationObject = globalThis.location,
} = {}) {
  try {
    if (navigatorObject && 'serviceWorker' in navigatorObject) {
      const registrations = await navigatorObject.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    if (cachesObject?.keys) {
      const keys = await cachesObject.keys();
      await Promise.all(keys.map((key) => cachesObject.delete(key)));
    }
  } finally {
    locationObject?.reload?.(true);
  }
}

export function toJakartaDateTimeLocal(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: JAKARTA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date).filter(({ type }) => type !== 'literal').map(({ type, value: part }) => [type, part]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
