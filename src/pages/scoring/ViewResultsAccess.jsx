import { useEffect, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import ScoringLanguageToggle from './ScoringLanguageToggle';
import { getStoredScoringLanguage, persistScoringLanguage, scoringCopy } from './scoringI18n';
import { getScoringThemeStyleVars, getStoredScoringAccent, getStoredScoringTheme } from './scoringTheme';
import { normalizeSessionCodeSuffix, resolveLookupSessionIds, SESSION_CODE_PREFIX } from './sessionCodeUtils';

export default function ViewResultsAccess() {
  const [theme] = useState(getStoredScoringTheme());
  const [accentColor] = useState(getStoredScoringAccent());
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [sessionCode, setSessionCode] = useState(normalizeSessionCodeSuffix(searchParams.get('code')));
  const [language, setLanguage] = useState(getStoredScoringLanguage());
  const t = scoringCopy[language];

  useEffect(() => {
    persistScoringLanguage(language);
    document.title = t.appTitle;
  }, [language, t]);

  const handleViewResults = (event) => {
    event.preventDefault();
    const [code] = resolveLookupSessionIds(sessionCode);
    if (!code) return;
    navigate(`/session/${encodeURIComponent(code)}/results`);
  };

  return (
    <div
      className={`theme-scoring-${theme} min-h-screen bg-app-bg text-app-text font-sans flex items-center justify-center p-4`}
      style={getScoringThemeStyleVars(accentColor)}
    >
      <div className="w-full max-w-sm">
        <Link to="/" className="inline-flex items-center gap-2 text-xs text-app-muted/80 hover:text-app-text transition-colors mb-6 no-underline uppercase tracking-widest">
          <ArrowLeft className="w-4 h-4" /> {t.backToStart}
        </Link>

        <div className="scoring-panel rounded-2xl p-6 md:p-8">
          <div className="mb-6 flex justify-end">
            <ScoringLanguageToggle language={language} label={t.languageLabel} onChange={setLanguage} />
          </div>
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-app-text mb-2 text-center tracking-tight">{t.resultsAccess.title}</h1>
            <p className="text-sm text-app-muted/80 text-center leading-relaxed">{t.resultsAccess.subtitle}</p>
          </div>

          <form onSubmit={handleViewResults} className="space-y-5">
            <div>
              <label className="block text-xs font-bold tracking-widest text-app-muted/80 uppercase mb-2">{t.resultsAccess.sessionCodeLabel}</label>
              <div className="flex items-center">
                <span className="scoring-input inline-flex h-12 items-center rounded-l-lg border-r-0 px-4 text-sm font-mono tracking-widest text-app-muted/70">
                  {SESSION_CODE_PREFIX}
                </span>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={sessionCode}
                  onChange={event => setSessionCode(normalizeSessionCodeSuffix(event.target.value))}
                  className="scoring-input w-full rounded-r-lg rounded-l-none h-12 px-4 text-sm uppercase font-mono tracking-widest"
                  placeholder={t.resultsAccess.sessionCodePlaceholder}
                />
              </div>
            </div>

            <button
              type="submit"
              className="scoring-btn-primary w-full h-12 mt-6 font-bold uppercase tracking-widest text-xs rounded-lg"
            >
              {t.resultsAccess.submitIdle}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
