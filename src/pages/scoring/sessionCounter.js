import { collection, doc, getCountFromServer, getDoc, increment, query, setDoc, where } from 'firebase/firestore';
import { db } from '../../core/firebase-config.js';

const SESSION_COUNTER_DOC = doc(db, 'sessions', '_stats');
const SESSION_COUNTER_FIELD = 'sessionCount';
const SESSION_COUNTER_CACHE_KEY = 'pageants.sessionCounter.v1';
const SESSION_COUNTER_CACHE_TTL_MS = 60 * 60 * 1000;

function readCounterCache() {
  try {
    const raw = localStorage.getItem(SESSION_COUNTER_CACHE_KEY);
    if (!raw) return null;

    const cached = JSON.parse(raw);
    const count = Number(cached?.count);
    const cachedAt = Number(cached?.cachedAt);
    if (!Number.isFinite(count) || !Number.isFinite(cachedAt)) return null;
    if (Date.now() - cachedAt > SESSION_COUNTER_CACHE_TTL_MS) return null;

    return count;
  } catch {
    return null;
  }
}

function writeCounterCache(count) {
  if (!Number.isFinite(count)) return;

  try {
    localStorage.setItem(SESSION_COUNTER_CACHE_KEY, JSON.stringify({
      count,
      cachedAt: Date.now()
    }));
  } catch {
    // Cache is only a read-reduction hint. Ignore storage failures.
  }
}

export function getCachedSessionCounter() {
  return readCounterCache();
}

export async function loadSessionCounter() {
  const cachedCount = readCounterCache();
  if (cachedCount !== null) return cachedCount;

  const counterSnapshot = await getDoc(SESSION_COUNTER_DOC);
  if (counterSnapshot.exists()) {
    const count = Number(counterSnapshot.data()?.[SESSION_COUNTER_FIELD]);
    if (Number.isFinite(count)) {
      writeCounterCache(count);
      return count;
    }
  }

  const sessionsQuery = query(collection(db, 'sessions'), where('createdAt', '>', 0));
  const snapshot = await getCountFromServer(sessionsQuery);
  const count = snapshot.data().count;
  await setDoc(SESSION_COUNTER_DOC, {
    [SESSION_COUNTER_FIELD]: count,
    updatedAt: Date.now()
  }, { merge: true });
  writeCounterCache(count);
  return count;
}

export async function incrementSessionCounter() {
  await setDoc(SESSION_COUNTER_DOC, {
    [SESSION_COUNTER_FIELD]: increment(1),
    updatedAt: Date.now()
  }, { merge: true });

  const cachedCount = readCounterCache();
  if (cachedCount !== null) {
    writeCounterCache(cachedCount + 1);
  }
}
