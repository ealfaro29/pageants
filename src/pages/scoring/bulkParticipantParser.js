const COUNTRY_ALIASES = {
  USA: 'UNITED STATES',
  US: 'UNITED STATES',
  'U S A': 'UNITED STATES',
  UK: 'UNITED KINGDOM',
  'U K': 'UNITED KINGDOM',
  'DOM REP': 'DOMINICAN REPUBLIC',
  DR: 'DOMINICAN REPUBLIC',
  'PUERTO RICO': 'PUERTO RICO',
  'PUETO RICO': 'PUERTO RICO',
  'FEDERATED STATES OF MICRONESIA': 'MICRONESIA'
};

const FLAG_REGEX = /[\u{1F1E6}-\u{1F1FF}]{2}/gu;

function toUpperLabel(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleUpperCase();
}

function normalizeToken(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(FLAG_REGEX, ' ')
    .replace(/[^\p{L}\p{N}&\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function cleanupHead(value) {
  return String(value || '')
    .replace(/^\s*\d+\s*[.)-]?\s*/, '')
    .replace(/CE\s*#?\s*\d+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildCountryLookup(countries = []) {
  const directMap = new Map();
  const keys = [];

  countries.forEach(country => {
    const nameKey = normalizeToken(country?.name);
    const apiKey = normalizeToken(country?.apiName);
    if (nameKey) {
      if (!directMap.has(nameKey)) directMap.set(nameKey, country);
      keys.push(nameKey);
    }
    if (apiKey && !directMap.has(apiKey)) {
      directMap.set(apiKey, country);
      keys.push(apiKey);
    }
  });

  const uniqueKeys = Array.from(new Set(keys)).sort((a, b) => b.length - a.length);
  return { directMap, keys: uniqueKeys };
}

function extractLineFlag(line) {
  const matches = String(line || '').match(FLAG_REGEX);
  if (!matches?.length) return '';
  return matches[0];
}

function resolveCountry(line, head, lookup) {
  const lookupSafe = lookup || { directMap: new Map(), keys: [] };
  const directMap = lookupSafe.directMap;
  const keys = lookupSafe.keys;

  const normalizedHead = normalizeToken(head);
  const normalizedLine = normalizeToken(line);
  const aliasHead = COUNTRY_ALIASES[normalizedHead] || '';

  const candidates = [normalizedHead, aliasHead, normalizedLine].filter(Boolean);
  for (const candidate of candidates) {
    if (directMap.has(candidate)) return directMap.get(candidate);
    const alias = COUNTRY_ALIASES[candidate];
    if (alias && directMap.has(alias)) return directMap.get(alias);
  }

  const paddedHead = ` ${normalizedHead} `;
  const paddedLine = ` ${normalizedLine} `;

  for (const key of keys) {
    const paddedKey = ` ${key} `;
    if (paddedHead.includes(paddedKey) || paddedLine.includes(paddedKey)) {
      return directMap.get(key);
    }
  }

  for (const [alias, target] of Object.entries(COUNTRY_ALIASES)) {
    const paddedAlias = ` ${alias} `;
    if (!paddedHead.includes(paddedAlias) && !paddedLine.includes(paddedAlias)) continue;
    if (directMap.has(target)) return directMap.get(target);
  }

  return null;
}

function mergeWrappedLines(rawText) {
  const lines = String(rawText || '')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  const merged = [];
  const startsNewEntry = line => /^\d+\s*[.)-]?\s*/.test(line);
  const isContinuationLine = line => {
    const normalized = normalizeToken(line);
    if (!normalized) return false;
    if (/^CE\s*#?\s*\d+/i.test(line)) return true;
    if (/^#\s*\d+/i.test(line)) return true;
    if (/^[-–—]/.test(line)) return true;
    if (/^\(?FIRST DEBUT\)?$/i.test(normalized)) return true;
    return false;
  };

  lines.forEach(line => {
    if (merged.length === 0) {
      merged.push(line);
      return;
    }

    if (startsNewEntry(line)) {
      merged.push(line);
      return;
    }

    if (!isContinuationLine(line)) {
      merged.push(line);
      return;
    }

    merged[merged.length - 1] = `${merged[merged.length - 1]} ${line}`;
  });

  return merged;
}

function parseNationalName(head, line, selectedCountry) {
  const base = cleanupHead((head || line || '').split(/[\-–—]/)[0]);
  const normalizedCountryName = normalizeToken(selectedCountry?.name || selectedCountry?.apiName || '');
  const normalizedBase = normalizeToken(base);

  if (!base) return '';

  if (normalizedCountryName && normalizedBase === normalizedCountryName) {
    return '';
  }

  return toUpperLabel(base);
}

function parseGlobalName(line, head, countryLookup) {
  const country = resolveCountry(line, head, countryLookup);
  if (country) {
    return {
      name: toUpperLabel(country.name),
      id: country.id || country.name,
      flag: country.flag || ''
    };
  }

  const fallback = cleanupHead(head || line);
  if (!fallback) return null;

  return {
    name: toUpperLabel(fallback),
    id: fallback.replace(/\s+/g, '').toUpperCase(),
    flag: extractLineFlag(line) || '🏳️'
  };
}

export function parseParticipantsFromBulkList({ rawText, sessionType, countries = [], selectedParentCountry = null }) {
  const lines = mergeWrappedLines(rawText);
  const parsed = [];
  const skipped = [];
  const countryLookup = buildCountryLookup(countries);

  lines.forEach((line, index) => {
    const withoutCode = line.replace(/CE\s*#?\s*\d+/gi, ' ').trim();
    const cleaned = cleanupHead(withoutCode);
    const head = cleaned.split(/[\-–—]/)[0]?.trim() || cleaned;

    let item = null;
    if (sessionType === 'Global') {
      item = parseGlobalName(line, head, countryLookup);
    } else {
      const nationalName = parseNationalName(head, line, selectedParentCountry);
      if (nationalName) {
        item = {
          name: nationalName,
          id: nationalName.replace(/\s+/g, '').toUpperCase(),
          flag: selectedParentCountry?.flag || ''
        };
      }
    }

    if (!item?.name) {
      skipped.push({ line: index + 1, value: line });
      return;
    }

    const uniqueKey = normalizeToken(item.name);
    if (!uniqueKey) return;
    parsed.push(item);
  });

  return { parsed, skipped, totalLines: lines.length };
}
