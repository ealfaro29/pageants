const COUNTER_SUFFIX_REGEX = /\s\((\d+)\)\s*$/;

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getBaseParticipantName(value) {
  return String(value || '').trim().replace(COUNTER_SUFFIX_REGEX, '').trim();
}

function buildCountMap(participants = []) {
  const map = new Map();
  participants.forEach(participant => {
    const baseName = getBaseParticipantName(participant?.baseName || participant?.name);
    if (!baseName) return;
    map.set(baseName, (map.get(baseName) || 0) + 1);
  });
  return map;
}

export function buildNumberedParticipant(item, existingParticipants = [], fallbackType = 'country') {
  const baseName = getBaseParticipantName(item?.name);
  const counts = buildCountMap(existingParticipants);
  const existingCount = counts.get(baseName) || 0;
  const nextIndex = existingCount + 1;
  const numberedName = existingCount > 0 ? `${baseName} (${nextIndex})` : baseName;
  const seed = `${item?.id || slugify(baseName) || 'participant'}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    ...item,
    id: seed,
    baseName,
    name: numberedName,
    type: item?.type || fallbackType
  };
}
