export const SCORING_MODE_TOTAL = 'total';
export const SCORING_MODE_PHASE = 'phase';

export function normalizeScoringMode(value) {
  return value === SCORING_MODE_PHASE ? SCORING_MODE_PHASE : SCORING_MODE_TOTAL;
}

export function isTotalScoringMode(value) {
  return normalizeScoringMode(value) === SCORING_MODE_TOTAL;
}
