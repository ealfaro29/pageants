import { useEffect, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { db } from '../../core/firebase-config.js';
import { arrayUnion, doc, getDoc, updateDoc } from 'firebase/firestore';
import { ArrowLeft, Loader2 } from 'lucide-react';
import ScoringLanguageToggle from './ScoringLanguageToggle';
import { getStoredScoringLanguage, normalizeScoringLanguage, persistScoringLanguage, scoringCopy } from './scoringI18n';
import { getScoringThemeStyleVars, getStoredScoringAccent, getStoredScoringTheme } from './scoringTheme';

function normalizeJudgeIdentity(value) {
  return String(value || '').trim().toLowerCase();
}

export default function JoinSession() {
  const [theme] = useState(getStoredScoringTheme());
  const [accentColor] = useState(getStoredScoringAccent());
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [judgeName, setJudgeName] = useState('');
  const [sessionCode, setSessionCode] = useState(searchParams.get('code')?.toUpperCase() || '');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [language, setLanguage] = useState(getStoredScoringLanguage());
  const t = scoringCopy[language];

  useEffect(() => {
    persistScoringLanguage(language);
    document.title = t.appTitle;
  }, [language, t]);

  useEffect(() => {
    const prefilledCode = searchParams.get('code');
    if (prefilledCode) {
      setSessionCode(prev => prev || prefilledCode.toUpperCase());
    }

    if (searchParams.get('removed') === '1') {
      setError(t.join.removedJudge);
    }
  }, [searchParams, t]);

  const handleJoin = async (e) => {
    e.preventDefault();
    const normalizedJudgeName = judgeName.trim();
    if (!normalizedJudgeName || !sessionCode.trim()) return;
    if (submitting) return;
    
    setSubmitting(true);
    setError('');

    try {
      const code = sessionCode.trim().toUpperCase();
      const sessionRef = doc(db, "sessions", code);
      const docSnap = await getDoc(sessionRef);
      
      if (docSnap.exists()) {
        const sessionData = docSnap.data();
        const sessionLanguage = normalizeScoringLanguage(sessionData?.language || language);
        persistScoringLanguage(sessionLanguage);
        const removedJudge = (sessionData?.removedJudges || []).some(
          removedName => normalizeJudgeIdentity(removedName) === normalizeJudgeIdentity(judgeName)
        );
        if (removedJudge) {
          setError(scoringCopy[sessionLanguage].join.removedJudge);
          setSubmitting(false);
          return;
        }

        const isHostJudge = normalizeJudgeIdentity(sessionData?.host) === normalizeJudgeIdentity(normalizedJudgeName);
        const isApprovedJudge = (sessionData?.judges || []).some(
          existingJudge => normalizeJudgeIdentity(existingJudge) === normalizeJudgeIdentity(normalizedJudgeName)
        );

        if (!isHostJudge && !isApprovedJudge) {
          await updateDoc(sessionRef, {
            pendingJudges: arrayUnion(normalizedJudgeName)
          });
        }

        navigate(`/session/${code}?judge=${encodeURIComponent(normalizedJudgeName)}`);
      } else {
        setError(t.join.sessionMissing);
        setSubmitting(false);
      }
    } catch(err) {
      console.error(err);
      setError(t.join.connectionError);
      setSubmitting(false);
    }
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
            <h1 className="text-2xl font-bold text-app-text mb-2 text-center tracking-tight">{t.join.title}</h1>
            <p className="text-sm text-app-muted/80 text-center leading-relaxed">{t.join.subtitle}</p>
          </div>
          
          <form onSubmit={handleJoin} className="space-y-5">
            <div>
              <label className="block text-xs font-bold tracking-widest text-app-muted/80 uppercase mb-2">{t.join.judgeNameLabel}</label>
              <input 
                type="text" 
                required
                value={judgeName}
                onChange={e => { setJudgeName(e.target.value); setError(''); }}
                className="scoring-input w-full rounded-lg h-12 px-4 text-sm"
                placeholder={t.join.judgeNamePlaceholder}
              />
            </div>
            
            <div>
              <label className="block text-xs font-bold tracking-widest text-app-muted/80 uppercase mb-2">{t.join.sessionCodeLabel}</label>
              <input 
                type="text" 
                required
                value={sessionCode}
                onChange={e => { setSessionCode(e.target.value); setError(''); }}
                className="scoring-input w-full rounded-lg h-12 px-4 text-sm uppercase font-mono tracking-widest"
                placeholder={t.join.sessionCodePlaceholder}
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs p-3 rounded-lg text-center">
                {error}
              </div>
            )}

            <button 
              type="submit" 
              disabled={submitting}
              className="scoring-btn-primary w-full h-12 mt-6 font-bold uppercase tracking-widest text-xs rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> {t.join.submitBusy}</> : t.join.submitIdle}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
