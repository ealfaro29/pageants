import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { db } from '../../core/firebase-config.js';
import { doc, setDoc } from 'firebase/firestore';
import { ArrowLeft, Loader2 } from 'lucide-react';
import ScoringLanguageToggle from './ScoringLanguageToggle';
import { getDefaultPhaseName, getStoredScoringLanguage, persistScoringLanguage, scoringCopy } from './scoringI18n';
import { getScoringThemeStyleVars, getStoredScoringAccent, getStoredScoringTheme } from './scoringTheme';

export default function CreateSession() {
  const [theme] = useState(getStoredScoringTheme());
  const [accentColor] = useState(getStoredScoringAccent());
  const navigate = useNavigate();
  const [judgeName, setJudgeName] = useState('');
  const [sessionName, setSessionName] = useState('');
  const [type, setType] = useState('Global');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [language, setLanguage] = useState(getStoredScoringLanguage());
  const t = scoringCopy[language];

  useEffect(() => {
    persistScoringLanguage(language);
    document.title = t.appTitle;
  }, [language, t]);

  const generateSessionId = () => 'MU-' + Math.random().toString(36).substring(2, 7).toUpperCase();

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!judgeName.trim() || !sessionName.trim()) { setError(t.create.completeFields); return; }
    if (submitting) return;
    
    setSubmitting(true);
    setError('');
    const sessionId = generateSessionId();
    
    const sessionData = {
      id: sessionId,
      name: sessionName.trim(),
      type,
      language,
      host: judgeName.trim(),
      currentPhaseIndex: 0,
      phases: [{ name: getDefaultPhaseName(0, language), cutoff: null, status: 'active' }],
      participants: [],
      judges: [judgeName.trim()],
      pendingJudges: [],
      removedJudges: [],
      createdAt: Date.now()
    };

    try {
      await setDoc(doc(db, "sessions", sessionId), sessionData);
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
        <Link to="/session" className="inline-flex items-center gap-2 text-xs text-app-muted/80 hover:text-app-text transition-colors mb-6 no-underline uppercase tracking-widest">
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
