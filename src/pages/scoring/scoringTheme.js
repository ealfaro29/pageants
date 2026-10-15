export const DEFAULT_SCORING_THEME = 'dark';
export const DEFAULT_SCORING_ACCENT = '#ffffff';

export const SCORING_ACCENTS = [
  { key: 'white', color: '#ffffff' },
  { key: 'gold', color: '#fbbf24' },
  { key: 'rose', color: '#fb7185' },
  { key: 'cyan', color: '#22d3ee' },
  { key: 'purple', color: '#c084fc' },
];

const THEME_KEY = 'pageants-scoring-theme';
const ACCENT_KEY = 'pageants-scoring-accent';

export function normalizeScoringTheme(value) {
  return value === 'light' ? 'light' : DEFAULT_SCORING_THEME;
}

export function getStoredScoringTheme() {
  if (typeof window === 'undefined') return DEFAULT_SCORING_THEME;
  return normalizeScoringTheme(window.localStorage.getItem(THEME_KEY));
}

export function persistScoringTheme(theme) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(THEME_KEY, normalizeScoringTheme(theme));
}

export function getStoredScoringAccent() {
  if (typeof window === 'undefined') return DEFAULT_SCORING_ACCENT;
  return window.localStorage.getItem(ACCENT_KEY) || DEFAULT_SCORING_ACCENT;
}

export function persistScoringAccent(accent) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ACCENT_KEY, accent || DEFAULT_SCORING_ACCENT);
}

export function getScoringThemeStyleVars(accent, theme) {
  let accentColor = accent || DEFAULT_SCORING_ACCENT;
  
  // High contrast override for light theme: if white accent is selected, use a dark color
  if (normalizeScoringTheme(theme) === 'light' && (accentColor === '#ffffff' || accentColor === 'white')) {
    accentColor = '#0f172a'; // Navy/Black for light mode white accent
  }
  
  return {
    '--color-app-accent': accentColor,
    '--color-app-accent-muted': `${accentColor}22`
  };
}

export function getScoringBodyBackground(theme) {
  return normalizeScoringTheme(theme) === 'light' ? '#f8fafc' : '#070707';
}
