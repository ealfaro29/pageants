import { Link, useSearchParams } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { AlertTriangle, Camera, Crown, Loader2, Moon, Sun } from 'lucide-react';
import { getStoredScoringLanguage, normalizeScoringLanguage } from '../scoringI18n';
import {
  getScoringBodyBackground,
  getScoringThemeStyleVars,
  getStoredScoringAccent,
  getStoredScoringTheme,
  persistScoringAccent,
  persistScoringTheme,
  SCORING_ACCENTS
} from '../scoringTheme';
import { GOOGLE_SHEETS_WEBAPP_URL } from './googleSheetsExport';

const COPY = {
  es: {
    title: 'Resultados para compartir',
    loading: 'Cargando resultados...',
    notFound: 'No se encontró este scoresheet.',
    error: 'No se pudieron cargar los resultados.',
    back: 'Inicio',
    showScores: 'Puntajes por juez',
    download: 'Descargar PNG',
    downloading: 'Generando...',
    judge: n => `JUEZ ${n}`,
    rank: 'RANK',
    delegate: 'DELEGADA',
    total: 'TOTAL',
    status: 'ESTADO',
    anonymous: 'Jueces anónimos',
    empty: 'Todavía no hay delegadas en esta fase.'
  },
  en: {
    title: 'Shareable results',
    loading: 'Loading results...',
    notFound: 'This scoresheet was not found.',
    error: 'Could not load the results.',
    back: 'Home',
    showScores: 'Judge scores',
    download: 'Download PNG',
    downloading: 'Generating...',
    judge: n => `JUDGE ${n}`,
    rank: 'RANK',
    delegate: 'DELEGATE',
    total: 'TOTAL',
    status: 'STATUS',
    anonymous: 'Anonymous judges',
    empty: 'There are no delegates in this phase yet.'
  }
};

function formatNumber(value, decimals) {
  if (value === null || value === undefined) return '';
  return decimals ? Number(value).toFixed(decimals) : String(Math.round(Number(value) * 1000) / 1000);
}

// Shareable results image for a Google Sheets scoresheet: data comes from the Apps Script
// web app, and judges are shown only as "JUEZ 1", "JUEZ 2"…
export default function SheetResultsImage() {
  const [params, setParams] = useSearchParams();
  const sheetId = params.get('id') || '';
  const tab = params.get('tab') || '';
  const [state, setState] = useState({ status: 'loading', data: null });
  const [showScores, setShowScores] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [theme, setTheme] = useState(getStoredScoringTheme());
  const [accentColor, setAccentColor] = useState(getStoredScoringAccent());
  const t = COPY[normalizeScoringLanguage(getStoredScoringLanguage())];
  const cardRef = useRef(null);

  useEffect(() => {
    document.body.style.background = getScoringBodyBackground(theme);
  }, [theme]);

  useEffect(() => {
    let active = true;
    setState(prev => ({ status: 'loading', data: prev.data }));
    const url = `${GOOGLE_SHEETS_WEBAPP_URL}?sheet=${encodeURIComponent(sheetId)}&tab=${encodeURIComponent(tab)}`;
    fetch(url)
      .then(response => response.json())
      .then(data => {
        if (!active) return;
        if (!data?.ok) {
          setState({ status: data?.code === 'not-found' ? 'missing' : 'error', data: null });
          return;
        }
        setState({ status: 'ready', data });
        document.title = `${data.title} · ${data.phase}`;
      })
      .catch(() => active && setState({ status: 'error', data: null }));
    return () => { active = false; };
  }, [sheetId, tab]);

  const download = async () => {
    if (!cardRef.current || exporting) return;
    setExporting(true);
    try {
      const dataUrl = await toPng(cardRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        skipFonts: true,
        backgroundColor: getScoringBodyBackground(theme)
      });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${state.data.title} - ${state.data.phase}.png`.replace(/[\\/:*?"<>|]/g, '');
      link.click();
    } catch (error) {
      console.error('Failed to export image', error);
    } finally {
      setExporting(false);
    }
  };

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    persistScoringTheme(next);
  };

  const rootClass = `theme-scoring-${theme} min-h-screen bg-app-bg text-app-text font-sans`;
  const rootStyle = getScoringThemeStyleVars(accentColor, theme);
  const data = state.data;

  if (!data) {
    const message = state.status === 'missing' ? t.notFound : state.status === 'error' ? t.error : t.loading;
    return (
      <div className={`${rootClass} flex flex-col items-center justify-center gap-4 p-6`} style={rootStyle}>
        {state.status === 'loading' ? <Loader2 className="w-6 h-6 animate-spin text-app-muted" /> : <AlertTriangle className="w-6 h-6 text-app-muted" />}
        <p className="text-sm text-app-muted">{message}</p>
        {state.status !== 'loading' && (
          <Link to="/" className="scoring-btn-secondary rounded-lg h-10 px-4 inline-flex items-center text-xs font-bold uppercase tracking-widest no-underline">{t.back}</Link>
        )}
      </div>
    );
  }

  const judges = Array.from({ length: data.judgeCount }, (_, index) => t.judge(index + 1));
  const cut = data.qualify + data.wildcard;

  return (
    <div className={rootClass} style={rootStyle}>
      <header className="sticky top-0 z-30 border-b border-app-border/70 bg-app-card/90 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
          <Link to="/" className="inline-flex items-center gap-2 no-underline mr-2" title={t.back}>
            <Crown className="w-5 h-5 text-app-accent" />
            <span className="text-sm font-bold text-app-text hidden sm:inline">{t.title}</span>
          </Link>
          <div className="flex flex-wrap gap-1 mr-auto">
            {data.phases.map(phase => (
              <button
                key={phase}
                type="button"
                onClick={() => setParams({ id: sheetId, tab: phase })}
                className={`rounded-lg px-3 h-9 text-[11px] font-bold uppercase tracking-widest transition-colors ${
                  phase === data.phase ? 'bg-app-accent/15 text-app-accent ring-1 ring-inset ring-app-accent/40' : 'text-app-muted hover:text-app-text hover:bg-app-text/5'
                }`}
              >
                {phase}
              </button>
            ))}
          </div>
          <label className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-app-muted cursor-pointer">
            <input type="checkbox" checked={showScores} onChange={event => setShowScores(event.target.checked)} className="accent-current" />
            {t.showScores}
          </label>
          <div className="flex items-center gap-1.5 rounded-full border border-app-border/60 bg-app-card/60 px-2.5 h-9">
            {SCORING_ACCENTS.map(accent => (
              <button
                key={accent.key}
                type="button"
                aria-label={accent.key}
                onClick={() => { setAccentColor(accent.color); persistScoringAccent(accent.color); }}
                className={`w-3.5 h-3.5 rounded-full border transition-all ${accentColor === accent.color ? 'scale-125 border-app-text' : 'border-transparent opacity-50 hover:opacity-100'}`}
                style={{ backgroundColor: theme === 'light' && accent.key === 'white' ? '#0f172a' : accent.color }}
              />
            ))}
          </div>
          <button type="button" onClick={toggleTheme} className="scoring-btn-icon w-9 h-9 rounded-full inline-flex items-center justify-center">
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={download}
            disabled={exporting || state.status === 'loading'}
            className="scoring-btn-primary inline-flex items-center gap-2 rounded-lg h-9 px-4 text-[11px] font-bold uppercase tracking-widest disabled:opacity-50"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
            {exporting ? t.downloading : t.download}
          </button>
        </div>
      </header>

      <main className="px-3 md:px-6 py-6 overflow-x-auto">
        <div ref={cardRef} className={`mx-auto w-max min-w-[min(100%,640px)] bg-app-bg p-6 md:p-8 transition-opacity ${state.status === 'loading' ? 'opacity-50' : ''}`}>
          <div className="flex items-end justify-between gap-10 border-b-2 border-app-accent pb-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-app-accent">{data.title}</p>
              <h1 className="mt-1 text-3xl md:text-4xl font-black uppercase tracking-tight text-app-text">{data.phase}</h1>
            </div>
            <Crown className="w-8 h-8 text-app-accent shrink-0" />
          </div>

          {data.rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-app-muted">{t.empty}</p>
          ) : (
            <table className="mt-5 w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-[0.14em] text-app-muted">
                  <th className="px-3 py-2 text-center border-b border-app-border">{t.rank}</th>
                  <th className="px-3 py-2 text-left border-b border-app-border">{t.delegate}</th>
                  {showScores && judges.map(name => (
                    <th key={name} className="px-3 py-2 text-right border-b border-app-border whitespace-nowrap">{name}</th>
                  ))}
                  <th className="px-3 py-2 text-right border-b border-app-border">{t.total}</th>
                  <th className="px-3 py-2 text-left border-b border-app-border">{t.status}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, index) => {
                  const qualified = row.rank !== null && row.rank <= data.qualify;
                  const wildcard = row.rank !== null && !qualified && row.rank <= cut;
                  const medal = row.rank === 1 ? 'bg-[#fbbf24] text-[#0b0b0c]' : row.rank === 2 ? 'bg-[#e5e7eb] text-[#1c1917]' : row.rank === 3 ? 'bg-[#f1d3b5] text-[#1c1917]' : 'text-app-muted';
                  return (
                    <tr key={`${row.delegate}-${index}`} className={qualified ? 'bg-app-accent/10' : wildcard ? 'bg-violet-500/10' : ''}>
                      <td className="px-3 py-2 text-center border-b border-app-border/60">
                        <span className={`inline-flex min-w-8 h-7 px-2 items-center justify-center rounded-md font-black tabular-nums ${medal}`}>{row.rank ?? '—'}</span>
                      </td>
                      <td className="px-3 py-2 font-semibold text-app-text border-b border-app-border/60 whitespace-nowrap">{row.delegate}</td>
                      {showScores && row.scores.map((score, scoreIndex) => (
                        <td key={scoreIndex} className="px-3 py-2 text-right tabular-nums text-app-muted border-b border-app-border/60">{formatNumber(score)}</td>
                      ))}
                      <td className="px-3 py-2 text-right font-bold tabular-nums text-app-text border-b border-app-border/60">{formatNumber(row.total, 2)}</td>
                      <td className={`px-3 py-2 text-[11px] font-bold border-b border-app-border/60 whitespace-nowrap ${wildcard ? 'text-violet-400' : 'text-app-accent'}`}>{row.status}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <div className="mt-5 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.2em] text-app-muted/70">
            <span>{showScores ? t.anonymous : ''}</span>
            <span>pageants.app</span>
          </div>
        </div>
      </main>
    </div>
  );
}
