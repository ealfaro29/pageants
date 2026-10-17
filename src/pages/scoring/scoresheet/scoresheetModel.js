import { doc } from 'firebase/firestore';
import { db } from '../../../core/firebase-config.js';

// Scoresheets live under sessions/_scoresheets/sheets/{id} so they reuse the public
// `sessions/{document=**}` Firestore rule and stay out of the sessions counter query.
export const SCORESHEET_CODE_PREFIX = 'SS-';
export const SCORESHEET_CODE_LENGTH = 6;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

export const DEFAULT_JUDGE_COUNT = 5;
export const MAX_JUDGES = 20;

export function scoresheetRef(sheetId) {
  return doc(db, 'sessions', '_scoresheets', 'sheets', sheetId);
}

export function buildScoresheetId() {
  let suffix = '';
  for (let index = 0; index < SCORESHEET_CODE_LENGTH; index += 1) {
    suffix += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return `${SCORESHEET_CODE_PREFIX}${suffix}`;
}

export function normalizeScoresheetCode(value) {
  const raw = String(value || '').trim().toUpperCase();
  const withoutPrefix = raw.startsWith(SCORESHEET_CODE_PREFIX) ? raw.slice(SCORESHEET_CODE_PREFIX.length) : raw;
  return withoutPrefix.replace(/[^A-Z0-9]/g, '').slice(0, SCORESHEET_CODE_LENGTH);
}

// Ids are used inside Firestore field paths, so they must stay [a-z0-9].
export function makeId(prefix) {
  let id = prefix;
  for (let index = 0; index < 8; index += 1) {
    id += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
  }
  return id;
}

export function makeEmptyRow(delegate = '') {
  return { delegate, comment: '', scores: {} };
}

export function makePhase(name, { rowCount = 0, qualifyCount = 0, awards = [], delegates = [] } = {}) {
  const rows = {};
  const rowOrder = [];
  for (let index = 0; index < Math.max(rowCount, delegates.length); index += 1) {
    const rowId = makeId('r');
    rows[rowId] = makeEmptyRow(delegates[index] || '');
    rowOrder.push(rowId);
  }
  return {
    name,
    qualifyCount,
    awards: awards.map(label => ({ id: makeId('a'), label, value: '' })),
    rows,
    rowOrder
  };
}

export function buildDefaultScoresheet({ id, title, judgeCount, language, delegates = [] }) {
  const judges = {};
  const judgeOrder = [];
  const count = Math.min(MAX_JUDGES, Math.max(1, Number(judgeCount) || DEFAULT_JUDGE_COUNT));
  for (let index = 0; index < count; index += 1) {
    const judgeId = makeId('j');
    judges[judgeId] = `JUDGE ${index + 1}`;
    judgeOrder.push(judgeId);
  }

  const phaseDefs = [
    makePhase('Opening', {
      rowCount: 20,
      qualifyCount: 15,
      delegates,
      awards: ['Best in National Costume', 'Best in Introduction', 'Best in Preliminaries - Swim', 'Best in Preliminaries - EG']
    }),
    makePhase('Swimsuit', { qualifyCount: 10 }),
    makePhase('Evening Gown', { qualifyCount: 5 }),
    makePhase('Q&A', { qualifyCount: 1 })
  ];
  const phases = {};
  const phaseOrder = [];
  phaseDefs.forEach(phase => {
    const phaseId = makeId('p');
    phases[phaseId] = phase;
    phaseOrder.push(phaseId);
  });

  return {
    id,
    kind: 'scoresheet',
    title,
    language,
    judges,
    judgeOrder,
    phases,
    phaseOrder,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

// One delegate per line (pasted from Excel, Docs or WhatsApp). Keeps only the first column.
export function parseDelegateList(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map(line => line.split('\t')[0].trim())
    .filter(Boolean);
}

// Accepts "9.5", "9,5", " 10 ". Returns null for blank, NaN for garbage.
export function parseScoreInput(value) {
  const text = String(value ?? '').trim().replace(',', '.');
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : Number.NaN;
}

export function formatScore(value) {
  if (value === null || value === undefined || value === '') return '';
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  return String(Math.round(number * 1000) / 1000);
}

export function formatTotal(value) {
  return (Math.round(value * 1000) / 1000).toFixed(2);
}

export function rowTotal(row, judgeOrder) {
  return judgeOrder.reduce((sum, judgeId) => {
    const score = Number(row?.scores?.[judgeId]);
    return Number.isFinite(score) ? sum + score : sum;
  }, 0);
}

export function hasDelegate(row) {
  return Boolean(String(row?.delegate || '').trim());
}

export function hasAnyScore(row, judgeOrder) {
  return judgeOrder.some(judgeId => Number.isFinite(Number(row?.scores?.[judgeId])) && row?.scores?.[judgeId] !== null);
}

export function phaseHasData(phase) {
  return Object.values(phase?.rows || {}).some(row =>
    hasDelegate(row) || String(row?.comment || '').trim() || Object.keys(row?.scores || {}).length > 0
  );
}

// Same behaviour as =RANK(total, totals, 0): highest total is 1, ties share a rank
// and the next rank skips (1, 2, 2, 4). Only rows with a delegate and at least one
// score are ranked, so freshly sent qualifiers don't all show up as rank 1.
export function computePhaseStats(phase, judgeOrder) {
  const rowOrder = (phase?.rowOrder || []).filter(rowId => phase?.rows?.[rowId]);
  const totals = {};
  rowOrder.forEach(rowId => {
    totals[rowId] = rowTotal(phase.rows[rowId], judgeOrder);
  });

  const ranked = rowOrder.filter(rowId => hasDelegate(phase.rows[rowId]) && hasAnyScore(phase.rows[rowId], judgeOrder));
  const ranks = {};
  ranked.forEach(rowId => {
    ranks[rowId] = 1 + ranked.filter(otherId => totals[otherId] > totals[rowId]).length;
  });

  // Rank order with the current row order as a stable tie-breaker.
  const rankedOrder = [...ranked].sort((a, b) => ranks[a] - ranks[b] || rowOrder.indexOf(a) - rowOrder.indexOf(b));

  const qualifyCount = Math.max(0, Math.floor(Number(phase?.qualifyCount) || 0));
  const qualified = new Set(rankedOrder.slice(0, qualifyCount));
  let cutoffTie = null;
  if (qualifyCount > 0 && rankedOrder.length > qualifyCount) {
    const lastIn = rankedOrder[qualifyCount - 1];
    const firstOut = rankedOrder[qualifyCount];
    if (totals[lastIn] === totals[firstOut]) {
      cutoffTie = rankedOrder.filter(rowId => totals[rowId] === totals[lastIn]);
    }
  }

  return { rowOrder, totals, ranks, rankedOrder, qualified, qualifyCount, cutoffTie };
}

// New row order: ranked delegates by rank, then unscored delegates, then blank rows,
// each group keeping its current relative order.
export function sortedRowOrder(phase, judgeOrder) {
  const { rowOrder, rankedOrder } = computePhaseStats(phase, judgeOrder);
  const unranked = rowOrder.filter(rowId => !rankedOrder.includes(rowId));
  const named = unranked.filter(rowId => hasDelegate(phase.rows[rowId]));
  const blank = unranked.filter(rowId => !hasDelegate(phase.rows[rowId]));
  return [...rankedOrder, ...named, ...blank];
}

export function buildAdvancedPhase(targetPhase, qualifierNames) {
  const rows = {};
  const rowOrder = [];
  qualifierNames.forEach(name => {
    const rowId = makeId('r');
    rows[rowId] = makeEmptyRow(name);
    rowOrder.push(rowId);
  });
  return { ...targetPhase, rows, rowOrder };
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function phaseToCsv(sheet, phaseId) {
  const phase = sheet.phases[phaseId];
  const judgeOrder = sheet.judgeOrder || [];
  const { rowOrder, totals, ranks } = computePhaseStats(phase, judgeOrder);
  const header = ['RANK', 'DELEGATES', ...judgeOrder.map(judgeId => sheet.judges[judgeId]), 'TOTAL', 'COMMENTS'];
  const lines = rowOrder.map(rowId => {
    const row = phase.rows[rowId];
    return [
      ranks[rowId] ?? '',
      row.delegate,
      ...judgeOrder.map(judgeId => formatScore(row.scores?.[judgeId])),
      ranks[rowId] !== undefined ? formatTotal(totals[rowId]) : '',
      row.comment
    ];
  });
  return [header, ...lines].map(line => line.map(csvCell).join(',')).join('\n');
}
