import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { db } from '../../core/firebase-config.js';
import { doc, setDoc } from 'firebase/firestore';
import { ArrowLeft, Loader2 } from 'lucide-react';
import ScoringLanguageToggle from './ScoringLanguageToggle';
import { getDefaultPhaseName, getStoredScoringLanguage, persistScoringLanguage, scoringCopy } from './scoringI18n';
import { getScoringThemeStyleVars, getStoredScoringAccent, getStoredScoringTheme } from './scoringTheme';
import { SCORING_MODE_PHASE, SCORING_MODE_TOTAL } from './scoringMode';
import { buildSessionId } from './sessionCodeUtils';
import { incrementSessionCounter } from './sessionCounter';

export default function CreateSession() {
  const [theme] = useState(getStoredScoringTheme());
  const [accentColor] = useState(getStoredScoringAccent());
  const navigate = useNavigate();
  const [judgeName, setJudgeName] = useState('');
  const [sessionName, setSessionName] = useState('');
  const [type, setType] = useState('Global');
  const [scoringMode, setScoringMode] = useState(SCORING_MODE_TOTAL);
  const [hostCanVote, setHostCanVote] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [language, setLanguage] = useState(getStoredScoringLanguage());
  const t = scoringCopy[language];

  useEffect(() => {
    persistScoringLanguage(language);
    document.title = t.appTitle;
  }, [language, t]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!judgeName.trim() || !sessionName.trim()) { setError(t.create.completeFields); return; }
    if (submitting) return;
    
    setSubmitting(true);
    setError('');
    const sessionId = buildSessionId();
    
    const sessionData = {
      id: sessionId,
      name: sessionName.trim(),
      type,
      scoringMode,
      hostCanVote,
      language,
      host: judgeName.trim(),
      controlHost: judgeName.trim(),
      hostLastSeenAt: Date.now(),
      currentPhaseIndex: 0,
      phases: [{ name: getDefaultPhaseName(0, language), cutoff: null, status: 'active' }],
      participants: [],
      judges: hostCanVote ? [judgeName.trim()] : [],
      pendingJudges: [],
      removedJudges: [],
      createdAt: Date.now()
    };

    try {
      await setDoc(doc(db, "sessions", sessionId), sessionData);
      incrementSessionCounter().catch(() => {});
      navigate(`/session/${sessionId}?judge=${encodeURIComponent(judgeName.trim())}`);
    } catch(err) {
      console.error(err);
      setError(t.create.createError);
      setSubmitting(false);
    }
  };

  return (
    <div 
      className={`theme-scoring-${theme} min-h-screen bg-app-bg text-app-text font-sans flex justify-center p-4 md:p-10`}
      style={getScoringThemeStyleVars(accentColor)}
    >
      <div className="w-full max-w-md h-fit">
        <Link to="/" className="inline-flex items-center gap-2 text-xs text-app-muted/80 hover:text-app-text transition-colors mb-6 no-underline uppercase tracking-widest">
          <ArrowLeft className="w-4 h-4" /> {t.backToStart}
        </Link>

        <div className="scoring-panel rounded-2xl p-6 md:p-8">
          <div className="mb-6 flex justify-end">
            <ScoringLanguageToggle language={language} label={t.languageLabel} onChange={setLanguage} />
          </div>
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-app-text mb-2 tracking-tight">{t.create.title}</h1>
            <p className="text-app-muted/80 text-sm leading-relaxed">{t.create.subtitle}</p>
          </div>
          
          <form onSubmit={handleCreate} className="space-y-5">
            <div>
              <label className="block text-xs font-bold tracking-widest text-app-muted/80 uppercase mb-2">{t.create.hostLabel}</label>
              <input 
                required type="text" value={judgeName} onChange={e => { setJudgeName(e.target.value); setError(''); }}
                className="scoring-input w-full rounded-lg h-12 px-4 text-sm"
                placeholder={t.create.hostPlaceholder}
              />
            </div>
            <div>
              <label className="block text-xs font-bold tracking-widest text-app-muted/80 uppercase mb-2">{t.create.sessionNameLabel}</label>
              <input 
                required type="text" value={sessionName} onChange={e => { setSessionName(e.target.value); setError(''); }}
                className="scoring-input w-full rounded-lg h-12 px-4 text-sm"
                placeholder={t.create.sessionNamePlaceholder}
              />
            </div>
            
            <div>
              <label className="block text-xs font-bold tracking-widest text-app-muted/80 uppercase mb-2">{t.create.typeLabel}</label>
              <select 
                value={type} onChange={e => setType(e.target.value)} 
                className="scoring-input w-full rounded-lg h-12 px-4 text-sm appearance-none cursor-pointer"
              >
                <option value="Global">{t.create.globalOption}</option>
                <option value="Nacional">{t.create.nationalOption}</option>
              </select>
            </div>
            <div className="rounded-lg border border-app-border/60 bg-app-card/35 p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-app-muted/80 mb-2">{t.create.scoringModeLabel}</p>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setScoringMode(SCORING_MODE_TOTAL)}
                  className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${scoringMode === SCORING_MODE_TOTAL ? 'border-app-accent bg-app-accent/10' : 'border-app-border/60 bg-app-card/40'}`}
                >
                  <p className="text-xs font-bold text-app-text">{t.create.scoringModeTotal}</p>
                  <p className="text-[10px] text-app-muted/80 mt-1">{t.create.scoringModeTotalDescription}</p>
                </button>
                <button
                  type="button"
                  onClick={() => setScoringMode(SCORING_MODE_PHASE)}
                  className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${scoringMode === SCORING_MODE_PHASE ? 'border-app-accent bg-app-accent/10' : 'border-app-border/60 bg-app-card/40'}`}
                >
                  <p className="text-xs font-bold text-app-text">{t.create.scoringModePhase}</p>
                  <p className="text-[10px] text-app-muted/80 mt-1">{t.create.scoringModePhaseDescription}</p>
                </button>
              </div>
            </div>
            <div className="rounded-lg border border-app-border/60 bg-app-card/35 p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-app-muted/80 mb-2">{t.create.hostVotingLabel}</p>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setHostCanVote(true)}
                  className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${hostCanVote ? 'border-app-accent bg-app-accent/10' : 'border-app-border/60 bg-app-card/40'}`}
                >
                  <p className="text-xs font-bold text-app-text">{t.create.hostVotingYes}</p>
                </button>
                <button
                  type="button"
                  onClick={() => setHostCanVote(false)}
                  className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${!hostCanVote ? 'border-app-accent bg-app-accent/10' : 'border-app-border/60 bg-app-card/40'}`}
                >
                  <p className="text-xs font-bold text-app-text">{t.create.hostVotingNo}</p>
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs p-3 rounded-lg text-center">
                {error}
              </div>
            )}

            <button 
              type="submit" 
              disabled={submitting}
              className="scoring-btn-primary w-full h-14 mt-4 font-bold uppercase tracking-widest text-sm rounded-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> {t.create.submitBusy}</> : t.create.submitIdle}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
