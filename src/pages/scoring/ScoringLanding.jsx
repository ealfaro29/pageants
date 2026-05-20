import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { arrayUnion, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { Crown, Sun, Moon, ShieldCheck, Users, Eye, BookOpen, UserCog, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { db } from '../../core/firebase-config.js';
import ScoringLanguageToggle from './ScoringLanguageToggle';
import {
  getDefaultPhaseName,
  getStoredScoringLanguage,
  normalizeScoringLanguage,
  persistScoringLanguage,
  scoringCopy
} from './scoringI18n';
import {
  getScoringThemeStyleVars,
  getStoredScoringAccent,
  getStoredScoringTheme,
  persistScoringAccent,
  persistScoringTheme
} from './scoringTheme';

function normalizeJudgeIdentity(value) {
  return String(value || '').trim().toLowerCase();
}

export default function ScoringLanding() {
  const navigate = useNavigate();
  const [theme, setTheme] = useState(getStoredScoringTheme());
  const [accentColor, setAccentColor] = useState(getStoredScoringAccent());
  const [language, setLanguage] = useState(getStoredScoringLanguage());
  const [activeRole, setActiveRole] = useState(null);
  const [hostName, setHostName] = useState('');
  const [sessionName, setSessionName] = useState('');
  const [sessionType, setSessionType] = useState('Global');
  const [judgeName, setJudgeName] = useState('');
  const [sessionCode, setSessionCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const t = scoringCopy[language];

  const accents = [
    { key: 'white', color: '#ffffff' },
    { key: 'gold', color: '#fbbf24' },
    { key: 'rose', color: '#fb7185' },
    { key: 'cyan', color: '#22d3ee' },
    { key: 'purple', color: '#c084fc' },
  ];

  useEffect(() => {
    persistScoringLanguage(language);
    document.title = t.appTitle;
  }, [language, t]);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { staggerChildren: 0.1, delayChildren: 0.2 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } }
  };

  const generateSessionId = () => 'MU-' + Math.random().toString(36).substring(2, 7).toUpperCase();

  const resetRoleFlow = () => {
    setActiveRole(null);
    setError('');
    setSubmitting(false);
  };

  const handleHostSubmit = async (event) => {
    event.preventDefault();
    if (!hostName.trim() || !sessionName.trim()) {
      setError(t.create.completeFields);
      return;
    }
    if (submitting) return;

    setSubmitting(true);
    setError('');
    const nextSessionId = generateSessionId();
    const sessionData = {
      id: nextSessionId,
      name: sessionName.trim(),
      type: sessionType,
      language,
      host: hostName.trim(),
      currentPhaseIndex: 0,
      phases: [{ name: getDefaultPhaseName(0, language), cutoff: null, status: 'active' }],
      participants: [],
      judges: [hostName.trim()],
      pendingJudges: [],
      removedJudges: [],
      createdAt: Date.now()
    };

    try {
      await setDoc(doc(db, 'sessions', nextSessionId), sessionData);
      navigate(`/session/${nextSessionId}?judge=${encodeURIComponent(hostName.trim())}`);
    } catch (submitError) {
      console.error(submitError);
      setError(t.create.createError);
      setSubmitting(false);
    }
  };

  const handleJudgeSubmit = async (event) => {
    event.preventDefault();
    if (!judgeName.trim() || !sessionCode.trim()) return;
    if (submitting) return;

    setSubmitting(true);
    setError('');
    const code = sessionCode.trim().toUpperCase();

    try {
      const sessionRef = doc(db, 'sessions', code);
      const sessionSnapshot = await getDoc(sessionRef);

      if (!sessionSnapshot.exists()) {
        setError(t.join.sessionMissing);
        setSubmitting(false);
        return;
      }

      const sessionData = sessionSnapshot.data();
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

      const normalizedJudgeName = judgeName.trim();
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
    } catch (submitError) {
      console.error(submitError);
      setError(t.join.connectionError);
      setSubmitting(false);
    }
  };

  const handleSpectatorSubmit = (event) => {
    event.preventDefault();
    if (!sessionCode.trim()) return;
    const code = sessionCode.trim().toUpperCase();
    navigate(`/session/${encodeURIComponent(code)}/results`);
  };

  return (
    <div 
      className={`theme-scoring-${theme} min-h-screen bg-app-bg text-app-text font-sans flex flex-col items-center relative overflow-hidden`}
      style={getScoringThemeStyleVars(accentColor, theme)}
    >
      {/* Background Aesthetic Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-app-accent/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-app-accent/5 blur-[120px] rounded-full pointer-events-none" />

      <motion.nav 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="w-full max-w-7xl px-6 py-6 flex flex-wrap justify-between items-center gap-4 z-20"
      >
        <Link to="/" className="flex items-center gap-2 no-underline group">
          <Crown className="w-6 h-6 text-app-accent transition-transform group-hover:scale-110" />
          <span className="text-xl font-bold tracking-tight text-app-text">Pageants <span className="text-app-accent">App</span></span>
        </Link>
        
        <div className="flex items-center gap-4">
          <ScoringLanguageToggle language={language} label={t.languageLabel} onChange={setLanguage} />
          
          <div className="hidden sm:flex items-center gap-2 bg-app-card/50 backdrop-blur-md border border-app-border/50 px-3 py-1.5 rounded-full shadow-lg">
            {accents.map(acc => {
              const displayColor = (theme === 'light' && acc.key === 'white') ? '#0f172a' : acc.color;
              return (
                <button
                  key={acc.color}
                  onClick={() => {
                    setAccentColor(acc.color);
                    persistScoringAccent(acc.color);
                  }}
                  className={`w-3.5 h-3.5 rounded-full border transition-all ${accentColor === acc.color ? 'scale-125 border-app-text ring-2 ring-app-accent/20' : 'border-transparent opacity-40 hover:opacity-100'}`}
                  style={{ backgroundColor: displayColor }}
                  title={`${t.accentLabel}: ${t.accentNames[acc.key]}`}
                />
              );
            })}
          </div>

          <button onClick={() => {
            const newTheme = theme === 'dark' ? 'light' : 'dark';
            setTheme(newTheme);
            persistScoringTheme(newTheme);
          }} className="w-10 h-10 flex items-center justify-center bg-app-card/50 backdrop-blur-md border border-app-border/50 rounded-full cursor-pointer transition-all text-app-muted hover:text-app-text hover:border-app-accent/30 shadow-lg">
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4 text-app-accent" />}
          </button>
        </div>
      </motion.nav>

      <motion.main 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="flex-grow flex flex-col items-center justify-center w-full max-w-6xl px-6 pb-20 z-10"
      >
        <motion.div variants={itemVariants} className="text-center mb-16 space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-app-accent/10 border border-app-accent/20 text-[10px] font-bold tracking-widest text-app-accent uppercase mb-4">
            <ShieldCheck className="w-3 h-3" />
            Official Scoring System
          </div>
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tighter text-app-text leading-[1.1]">
            {t.landing.title.split(' ').map((word, i) => (
              <span key={i} className={i === t.landing.title.split(' ').length - 1 ? 'text-app-accent' : ''}>
                {word}{' '}
              </span>
            ))}
          </h1>
          <p className="text-lg md:text-xl text-app-muted/80 max-w-2xl mx-auto font-medium leading-relaxed">
            {t.landing.subtitle}
          </p>
          <Link
            to="/manual"
            className="mt-3 inline-flex items-center gap-2 rounded-full border border-app-border/70 bg-app-card/40 px-4 py-2 text-xs font-bold uppercase tracking-widest text-app-muted hover:text-app-text hover:border-app-accent/40 transition-colors no-underline"
          >
            <BookOpen className="w-3.5 h-3.5" />
            {t.landing.howToButton}
          </Link>
        </motion.div>

        <motion.section variants={itemVariants} className="w-full max-w-3xl">
          <div className="scoring-panel rounded-[2rem] border border-app-border/70 bg-app-card/50 p-6 md:p-8">
            <div className="text-center mb-6">
              <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-app-accent/85">{t.landing.workflowTitle}</p>
              <p className="text-sm text-app-muted/80 mt-2">{t.landing.workflowSubtitle}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => { setActiveRole('host'); setError(''); }}
                className="text-left rounded-2xl border border-app-border/70 bg-app-card/45 px-4 py-5 hover:border-app-accent/45 transition-colors"
              >
                <span className="inline-flex w-10 h-10 items-center justify-center rounded-xl bg-app-accent/12 text-app-accent">
                  <UserCog className="w-5 h-5" />
                </span>
                <p className="mt-4 text-base font-bold text-app-text">{t.landing.roleHost}</p>
                <p className="text-xs text-app-muted/80 mt-1">{t.landing.createDescription}</p>
              </button>

              <button
                type="button"
                onClick={() => { setActiveRole('judge'); setError(''); }}
                className="text-left rounded-2xl border border-app-border/70 bg-app-card/45 px-4 py-5 hover:border-app-accent/45 transition-colors"
              >
                <span className="inline-flex w-10 h-10 items-center justify-center rounded-xl bg-app-accent/12 text-app-accent">
                  <Users className="w-5 h-5" />
                </span>
                <p className="mt-4 text-base font-bold text-app-text">{t.landing.roleJudge}</p>
                <p className="text-xs text-app-muted/80 mt-1">{t.landing.joinDescription}</p>
              </button>

              <button
                type="button"
                onClick={() => { setActiveRole('spectator'); setError(''); }}
                className="text-left rounded-2xl border border-app-border/70 bg-app-card/45 px-4 py-5 hover:border-app-accent/45 transition-colors"
              >
                <span className="inline-flex w-10 h-10 items-center justify-center rounded-xl bg-app-accent/12 text-app-accent">
                  <Eye className="w-5 h-5" />
                </span>
                <p className="mt-4 text-base font-bold text-app-text">{t.landing.roleSpectator}</p>
                <p className="text-xs text-app-muted/80 mt-1">{t.landing.liveResultsDescription}</p>
              </button>
            </div>

            {activeRole && (
              <div className="mt-4 rounded-2xl border border-app-border/70 bg-app-card/35 p-4 md:p-5">
                {activeRole === 'host' && (
                  <form onSubmit={handleHostSubmit} className="space-y-3">
                    <input
                      type="text"
                      value={hostName}
                      onChange={event => { setHostName(event.target.value); setError(''); }}
                      className="scoring-input w-full rounded-lg h-11 px-3 text-sm"
                      placeholder={t.create.hostPlaceholder}
                      required
                    />
                    <input
                      type="text"
                      value={sessionName}
                      onChange={event => { setSessionName(event.target.value); setError(''); }}
                      className="scoring-input w-full rounded-lg h-11 px-3 text-sm"
                      placeholder={t.create.sessionNamePlaceholder}
                      required
                    />
                    <select
                      value={sessionType}
                      onChange={event => setSessionType(event.target.value)}
                      className="scoring-input w-full rounded-lg h-11 px-3 text-sm"
                    >
                      <option value="Global">{t.create.globalOption}</option>
                      <option value="Nacional">{t.create.nationalOption}</option>
                    </select>
                    <div className="flex items-center gap-2 pt-1">
                      <button type="button" onClick={resetRoleFlow} className="scoring-btn-secondary rounded-lg h-11 px-4 text-xs font-bold uppercase tracking-widest">
                        {t.landing.workflowBack}
                      </button>
                      <button type="submit" disabled={submitting} className="scoring-btn-primary flex-1 rounded-lg h-11 px-4 text-xs font-bold uppercase tracking-widest disabled:opacity-50 inline-flex items-center justify-center gap-2">
                        {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> {t.create.submitBusy}</> : t.create.submitIdle}
                      </button>
                    </div>
                  </form>
                )}

                {activeRole === 'judge' && (
                  <form onSubmit={handleJudgeSubmit} className="space-y-3">
                    <input
                      type="text"
                      value={judgeName}
                      onChange={event => { setJudgeName(event.target.value); setError(''); }}
                      className="scoring-input w-full rounded-lg h-11 px-3 text-sm"
                      placeholder={t.join.judgeNamePlaceholder}
                      required
                    />
                    <input
                      type="text"
                      value={sessionCode}
                      onChange={event => { setSessionCode(event.target.value); setError(''); }}
                      className="scoring-input w-full rounded-lg h-11 px-3 text-sm uppercase font-mono tracking-widest"
                      placeholder={t.join.sessionCodePlaceholder}
                      required
                    />
                    <div className="flex items-center gap-2 pt-1">
                      <button type="button" onClick={resetRoleFlow} className="scoring-btn-secondary rounded-lg h-11 px-4 text-xs font-bold uppercase tracking-widest">
                        {t.landing.workflowBack}
                      </button>
                      <button type="submit" disabled={submitting} className="scoring-btn-primary flex-1 rounded-lg h-11 px-4 text-xs font-bold uppercase tracking-widest disabled:opacity-50 inline-flex items-center justify-center gap-2">
                        {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> {t.join.submitBusy}</> : t.join.submitIdle}
                      </button>
                    </div>
                  </form>
                )}

                {activeRole === 'spectator' && (
                  <form onSubmit={handleSpectatorSubmit} className="space-y-3">
                    <input
                      type="text"
                      value={sessionCode}
                      onChange={event => { setSessionCode(event.target.value); setError(''); }}
                      className="scoring-input w-full rounded-lg h-11 px-3 text-sm uppercase font-mono tracking-widest"
                      placeholder={t.resultsAccess.sessionCodePlaceholder}
                      required
                    />
                    <div className="flex items-center gap-2 pt-1">
                      <button type="button" onClick={resetRoleFlow} className="scoring-btn-secondary rounded-lg h-11 px-4 text-xs font-bold uppercase tracking-widest">
                        {t.landing.workflowBack}
                      </button>
                      <button type="submit" className="scoring-btn-primary flex-1 rounded-lg h-11 px-4 text-xs font-bold uppercase tracking-widest">
                        {t.resultsAccess.submitIdle}
                      </button>
                    </div>
                  </form>
                )}

                {error && (
                  <div className="mt-3 rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-xs text-red-300 text-center">
                    {error}
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.section>
      </motion.main>

      <motion.footer 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="w-full py-10 text-center border-t border-app-border/20 z-10"
      >
        <p className="text-[12px] text-app-muted/40 font-medium tracking-wide">
          &copy; {new Date().getFullYear()} PAGEANTS APP &bull; {t.footerByLabel.toUpperCase()}{' '}
          <a href="https://discord.com/users/angelmuse_87856" target="_blank" rel="noopener noreferrer" className="text-app-text/60 hover:text-app-accent transition-colors underline decoration-app-border underline-offset-4 font-bold">ANGEL MUSE DOLL</a>
        </p>
      </motion.footer>
    </div>
  );
}
