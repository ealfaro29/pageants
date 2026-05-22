export const SESSION_CODE_PREFIX = 'MU-';
export const SESSION_CODE_LENGTH = 6;

const SESSION_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function normalizeSessionCodeSuffix(value) {
  const raw = String(value || '').trim().toUpperCase();
  const withoutPrefix = raw.startsWith(SESSION_CODE_PREFIX) ? raw.slice(SESSION_CODE_PREFIX.length) : raw;
  return withoutPrefix.replace(/[^A-Z0-9]/g, '').slice(0, SESSION_CODE_LENGTH);
}

export function formatSessionIdFromSuffix(suffix) {
  return `${SESSION_CODE_PREFIX}${normalizeSessionCodeSuffix(suffix)}`;
}

export function buildSessionId() {
  let suffix = '';
  for (let index = 0; index < SESSION_CODE_LENGTH; index += 1) {
    const randomIndex = Math.floor(Math.random() * SESSION_CODE_CHARS.length);
    suffix += SESSION_CODE_CHARS[randomIndex];
  }
  return `${SESSION_CODE_PREFIX}${suffix}`;
}

export function resolveLookupSessionIds(value) {
  const suffix = normalizeSessionCodeSuffix(value);
  if (!suffix) return [];
  return [`${SESSION_CODE_PREFIX}${suffix}`];
}
