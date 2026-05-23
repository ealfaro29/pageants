import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { arrayUnion, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { Crown, Sun, Moon, ShieldCheck, Users, Eye, BookOpen, UserCog, Loader2, House, ClipboardList, X } from 'lucide-react';
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
import { SCORING_MODE_PHASE, SCORING_MODE_TOTAL } from './scoringMode';
import { buildSessionId, normalizeSessionCodeSuffix, resolveLookupSessionIds, SESSION_CODE_PREFIX } from './sessionCodeUtils';
import { getCachedSessionCounter, incrementSessionCounter, loadSessionCounter } from './sessionCounter';

function normalizeJudgeIdentity(value) {
  return String(value || '').trim().toLowerCase();
}

function getCreateSessionErrorMessage(error, fallbackMessage) {
  const code = String(error?.code || '').toLowerCase();
  if (code.includes('resource-exhausted')) {
    return `${fallbackMessage} Firebase quota exceeded (resource-exhausted).`;
  }
  if (code.includes('permission-denied')) {
    return `${fallbackMessage} Firestore permission denied.`;
  }
  if (code.includes('unavailable')) {
    return `${fallbackMessage} Firestore temporarily unavailable.`;
  }
  return code ? `${fallbackMessage} (${code})` : fallbackMessage;
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
  const [scoringMode, setScoringMode] = useState(SCORING_MODE_TOTAL);
  const [hostCanVote, setHostCanVote] = useState(true);
  const [judgeName, setJudgeName] = useState('');
  const [sessionCode, setSessionCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [sessionCounter, setSessionCounter] = useState(() => getCachedSessionCounter());
  const [mobileSection, setMobileSection] = useState('home');
  const [showWelcomeSplash, setShowWelcomeSplash] = useState(true);
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

  useEffect(() => {
    document.body.style.overflow = showWelcomeSplash ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [showWelcomeSplash]);

  useEffect(() => {
    let active = true;
    const cachedAtStart = getCachedSessionCounter();
    loadSessionCounter()
      .then(count => {
        if (!active) return;
        setSessionCounter(count);
      })
      .catch(() => {
        if (!active || cachedAtStart !== null) return;
        setSessionCounter(null);
      });
    return () => { active = false; };
  }, []);

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
    const nextSessionId = buildSessionId();
    const sessionData = {
      id: nextSessionId,
      name: sessionName.trim(),
      type: sessionType,
      scoringMode,
      hostCanVote,
      language,
      host: hostName.trim(),
      controlHost: hostName.trim(),
      hostLastSeenAt: Date.now(),
      currentPhaseIndex: 0,
      phases: [{ name: getDefaultPhaseName(0, language), cutoff: null, status: 'active' }],
      participants: [],
      judges: hostCanVote ? [hostName.trim()] : [],
      pendingJudges: [],
      removedJudges: [],
      createdAt: Date.now()
    };

    try {
      await setDoc(doc(db, 'sessions', nextSessionId), sessionData);
      incrementSessionCounter().catch(() => {});
      navigate(`/session/${nextSessionId}?judge=${encodeURIComponent(hostName.trim())}`);
    } catch (submitError) {
      console.error(submitError);
      setError(getCreateSessionErrorMessage(submitError, t.create.createError));
      setSubmitting(false);
    }
  };

  const handleJudgeSubmit = async (event) => {
    event.preventDefault();
    if (!judgeName.trim() || !sessionCode.trim()) return;
    if (submitting) return;

    setSubmitting(true);
    setError('');
    const [code] = resolveLookupSessionIds(sessionCode);
    if (!code) return;

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
    const [code] = resolveLookupSessionIds(sessionCode);
    if (!code) return;
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
        className="hidden md:flex w-full max-w-7xl px-6 py-6 flex-wrap justify-between items-center gap-4 z-20"
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
        className="hidden md:flex flex-grow flex-col items-center justify-center w-full max-w-6xl px-6 pb-20 z-10"
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
                    <div className="rounded-lg border border-app-border/60 bg-app-card/35 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-app-muted/80 mb-2">{t.create.scoringModeLabel}</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setScoringMode(SCORING_MODE_TOTAL)}
                          className={`rounded-lg border px-3 py-2 text-left transition-colors ${scoringMode === SCORING_MODE_TOTAL ? 'border-app-accent bg-app-accent/10' : 'border-app-border/60 bg-app-card/40'}`}
                        >
                          <p className="text-xs font-bold text-app-text">{t.create.scoringModeTotal}</p>
                          <p className="text-[10px] text-app-muted/80 mt-1">{t.create.scoringModeTotalDescription}</p>
                        </button>
                        <button
                          type="button"
                          onClick={() => setScoringMode(SCORING_MODE_PHASE)}
                          className={`rounded-lg border px-3 py-2 text-left transition-colors ${scoringMode === SCORING_MODE_PHASE ? 'border-app-accent bg-app-accent/10' : 'border-app-border/60 bg-app-card/40'}`}
                        >
                          <p className="text-xs font-bold text-app-text">{t.create.scoringModePhase}</p>
                          <p className="text-[10px] text-app-muted/80 mt-1">{t.create.scoringModePhaseDescription}</p>
                        </button>
                      </div>
                    </div>
                    <div className="rounded-lg border border-app-border/60 bg-app-card/35 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-app-muted/80 mb-2">{t.create.hostVotingLabel}</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setHostCanVote(true)}
                          className={`rounded-lg border px-3 py-2 text-left transition-colors ${hostCanVote ? 'border-app-accent bg-app-accent/10' : 'border-app-border/60 bg-app-card/40'}`}
                        >
                          <p className="text-xs font-bold text-app-text">{t.create.hostVotingYes}</p>
                        </button>
                        <button
                          type="button"
                          onClick={() => setHostCanVote(false)}
                          className={`rounded-lg border px-3 py-2 text-left transition-colors ${!hostCanVote ? 'border-app-accent bg-app-accent/10' : 'border-app-border/60 bg-app-card/40'}`}
                        >
                          <p className="text-xs font-bold text-app-text">{t.create.hostVotingNo}</p>
                        </button>
                      </div>
                    </div>
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
                    <div className="flex items-center">
                      <span className="scoring-input inline-flex h-11 items-center rounded-l-lg border-r-0 px-3 text-sm font-mono tracking-widest text-app-muted/70">
                        {SESSION_CODE_PREFIX}
                      </span>
                      <input
                        type="text"
                        value={sessionCode}
                        onChange={event => { setSessionCode(normalizeSessionCodeSuffix(event.target.value)); setError(''); }}
                        className="scoring-input w-full rounded-r-lg rounded-l-none h-11 px-3 text-sm uppercase font-mono tracking-widest"
                        placeholder={t.join.sessionCodePlaceholder}
                        maxLength={6}
                        required
                      />
                    </div>
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
                    <div className="flex items-center">
                      <span className="scoring-input inline-flex h-11 items-center rounded-l-lg border-r-0 px-3 text-sm font-mono tracking-widest text-app-muted/70">
                        {SESSION_CODE_PREFIX}
                      </span>
                      <input
                        type="text"
                        value={sessionCode}
                        onChange={event => { setSessionCode(normalizeSessionCodeSuffix(event.target.value)); setError(''); }}
                        className="scoring-input w-full rounded-r-lg rounded-l-none h-11 px-3 text-sm uppercase font-mono tracking-widest"
                        placeholder={t.resultsAccess.sessionCodePlaceholder}
                        maxLength={6}
                        required
                      />
                    </div>
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

      <div className="md:hidden w-full min-h-screen flex flex-col pb-20">
        <header className="px-4 pt-4 pb-3 border-b border-app-border/50 bg-app-card/50 backdrop-blur-md">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.22em] text-app-muted/70">Scoring System</p>
              <h1 className="text-lg font-black tracking-tight truncate">{t.landing.title}</h1>
            </div>
            <div className="flex items-center gap-2">
              <ScoringLanguageToggle language={language} label={t.languageLabel} onChange={setLanguage} />
              <button onClick={() => {
                const newTheme = theme === 'dark' ? 'light' : 'dark';
                setTheme(newTheme);
                persistScoringTheme(newTheme);
              }} className="w-9 h-9 flex items-center justify-center bg-app-card/60 border border-app-border/50 rounded-full transition-all text-app-muted">
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4 text-app-accent" />}
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-4">
          {mobileSection === 'home' && (
            <section className="scoring-panel rounded-2xl p-4 space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-app-accent/10 border border-app-accent/20 text-[10px] font-bold tracking-widest text-app-accent uppercase">
                <ShieldCheck className="w-3 h-3" />
                Official Scoring System
              </div>
              <h2 className="text-2xl font-black tracking-tight">{t.landing.mobileWelcomeTitle}</h2>
              <p className="text-sm text-app-muted/85 leading-relaxed">{t.landing.mobileWelcomeBody}</p>
              <div className="grid grid-cols-1 gap-2">
                <button type="button" onClick={() => setMobileSection('host')} className="text-left rounded-xl border border-app-border/70 bg-app-card/45 px-4 py-3">
                  <p className="text-sm font-bold">{t.landing.roleHost}</p>
                  <p className="text-xs text-app-muted/80 mt-1">{t.landing.createDescription}</p>
                </button>
                <button type="button" onClick={() => setMobileSection('judge')} className="text-left rounded-xl border border-app-border/70 bg-app-card/45 px-4 py-3">
                  <p className="text-sm font-bold">{t.landing.roleJudge}</p>
                  <p className="text-xs text-app-muted/80 mt-1">{t.landing.joinDescription}</p>
                </button>
                <button type="button" onClick={() => setMobileSection('spectator')} className="text-left rounded-xl border border-app-border/70 bg-app-card/45 px-4 py-3">
                  <p className="text-sm font-bold">{t.landing.roleSpectator}</p>
                  <p className="text-xs text-app-muted/80 mt-1">{t.landing.liveResultsDescription}</p>
                </button>
              </div>
            </section>
          )}

          {mobileSection === 'host' && (
            <section className="scoring-panel rounded-2xl p-4">
              <h3 className="text-lg font-black mb-3">{t.landing.roleHost}</h3>
              <form onSubmit={handleHostSubmit} className="space-y-3">
                <input type="text" value={hostName} onChange={event => { setHostName(event.target.value); setError(''); }} className="scoring-input w-full rounded-lg h-11 px-3 text-sm" placeholder={t.create.hostPlaceholder} required />
                <input type="text" value={sessionName} onChange={event => { setSessionName(event.target.value); setError(''); }} className="scoring-input w-full rounded-lg h-11 px-3 text-sm" placeholder={t.create.sessionNamePlaceholder} required />
                <select value={sessionType} onChange={event => setSessionType(event.target.value)} className="scoring-input w-full rounded-lg h-11 px-3 text-sm">
                  <option value="Global">{t.create.globalOption}</option>
                  <option value="Nacional">{t.create.nationalOption}</option>
                </select>
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
                <button type="submit" disabled={submitting} className="scoring-btn-primary w-full rounded-lg h-12 text-xs font-bold uppercase tracking-widest disabled:opacity-50 inline-flex items-center justify-center gap-2">
                  {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> {t.create.submitBusy}</> : t.create.submitIdle}
                </button>
              </form>
            </section>
          )}

          {mobileSection === 'judge' && (
            <section className="scoring-panel rounded-2xl p-4">
              <h3 className="text-lg font-black mb-3">{t.landing.roleJudge}</h3>
              <form onSubmit={handleJudgeSubmit} className="space-y-3">
                <input type="text" value={judgeName} onChange={event => { setJudgeName(event.target.value); setError(''); }} className="scoring-input w-full rounded-lg h-11 px-3 text-sm" placeholder={t.join.judgeNamePlaceholder} required />
                <div className="flex items-center">
                  <span className="scoring-input inline-flex h-11 items-center rounded-l-lg border-r-0 px-3 text-sm font-mono tracking-widest text-app-muted/70">
                    {SESSION_CODE_PREFIX}
                  </span>
                  <input type="text" value={sessionCode} onChange={event => { setSessionCode(normalizeSessionCodeSuffix(event.target.value)); setError(''); }} className="scoring-input w-full rounded-r-lg rounded-l-none h-11 px-3 text-sm uppercase font-mono tracking-widest" placeholder={t.join.sessionCodePlaceholder} maxLength={6} required />
                </div>
                <button type="submit" disabled={submitting} className="scoring-btn-primary w-full rounded-lg h-12 text-xs font-bold uppercase tracking-widest disabled:opacity-50 inline-flex items-center justify-center gap-2">
                  {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> {t.join.submitBusy}</> : t.join.submitIdle}
                </button>
              </form>
            </section>
          )}

          {mobileSection === 'spectator' && (
            <section className="scoring-panel rounded-2xl p-4">
              <h3 className="text-lg font-black mb-3">{t.landing.roleSpectator}</h3>
              <form onSubmit={handleSpectatorSubmit} className="space-y-3">
                <div className="flex items-center">
                  <span className="scoring-input inline-flex h-11 items-center rounded-l-lg border-r-0 px-3 text-sm font-mono tracking-widest text-app-muted/70">
                    {SESSION_CODE_PREFIX}
                  </span>
                  <input type="text" value={sessionCode} onChange={event => { setSessionCode(normalizeSessionCodeSuffix(event.target.value)); setError(''); }} className="scoring-input w-full rounded-r-lg rounded-l-none h-11 px-3 text-sm uppercase font-mono tracking-widest" placeholder={t.resultsAccess.sessionCodePlaceholder} maxLength={6} required />
                </div>
                <button type="submit" className="scoring-btn-primary w-full rounded-lg h-12 text-xs font-bold uppercase tracking-widest">
                  {t.resultsAccess.submitIdle}
                </button>
              </form>
            </section>
          )}

          {mobileSection === 'manual' && (
            <section className="scoring-panel rounded-2xl p-4 space-y-3">
              <h3 className="text-lg font-black">{t.landing.howToButton}</h3>
              <p className="text-sm text-app-muted/85">Open the full visual guide with real screenshots and step-by-step instructions.</p>
              <Link to="/manual" className="scoring-btn-secondary w-full rounded-lg h-11 text-xs font-bold uppercase tracking-widest no-underline inline-flex items-center justify-center">
                {t.landing.howToButton}
              </Link>
            </section>
          )}

          {error && (
            <div className="mt-3 rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-xs text-red-300 text-center">
              {error}
            </div>
          )}

          <div className="pt-4 pb-2 text-center">
            <p className="text-[10px] uppercase tracking-[0.18em] text-app-muted/55">
              {t.landing.sessionCounterLabel}: <span className="text-app-text/70 font-bold">{sessionCounter ?? t.landing.sessionCounterUnavailable}</span>
            </p>
          </div>
        </main>

        <nav
          className="fixed bottom-0 left-0 right-0 border-t border-app-border/60 bg-app-card/95 backdrop-blur-lg px-2 py-2 z-30"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.5rem)' }}
        >
          <div className="grid grid-cols-5 gap-1">
            {[
              { key: 'home', label: t.landing.mobileHome, icon: House },
              { key: 'host', label: t.landing.mobileHost, icon: UserCog },
              { key: 'judge', label: t.landing.mobileJudge, icon: Users },
              { key: 'spectator', label: t.landing.mobileSpectator, icon: Eye },
              { key: 'manual', label: t.landing.mobileManual, icon: ClipboardList }
            ].map(item => {
              const Icon = item.icon;
              const active = mobileSection === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setMobileSection(item.key)}
                  className={`rounded-lg py-2 px-1 flex flex-col items-center gap-1 transition-colors ${active ? 'bg-app-accent/12 text-app-accent' : 'text-app-muted/70'}`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-[9px] sm:text-[10px] font-bold tracking-tight leading-tight text-center">{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>

      {showWelcomeSplash && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/65 backdrop-blur-md">
          <div className="relative w-full max-w-3xl overflow-hidden rounded-[2rem] border border-app-border/80 bg-app-card/60 backdrop-blur-xl shadow-[0_40px_80px_rgba(0,0,0,0.55)]">
            <button
              type="button"
              onClick={() => setShowWelcomeSplash(false)}
              className="absolute right-4 top-4 z-20 rounded-full border border-app-border/70 bg-app-card/70 p-2 text-app-muted hover:text-app-text"
              aria-label="Close splash"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(251,191,36,0.2),transparent_45%),radial-gradient(circle_at_85%_10%,rgba(255,255,255,0.1),transparent_35%)] pointer-events-none" />
            <div className="relative z-10 grid grid-cols-1 md:grid-cols-12 min-h-[300px] md:min-h-[360px]">
              <div className="md:col-span-5 relative min-h-[170px] md:min-h-full border-b border-app-border/40 md:border-b-0 md:border-r md:border-app-border/40 bg-gradient-to-r from-app-accent/10 via-transparent to-transparent">
                <img
                  src="/angel-muse-doll.png"
                  alt="Angel Muse Doll"
                  className="md:hidden mx-auto mt-4 h-[175px] sm:h-[205px] w-auto max-w-none object-contain drop-shadow-[0_20px_30px_rgba(0,0,0,0.5)]"
                />
                <img
                  src="/angel-muse-doll.png"
                  alt="Angel Muse Doll"
                  className="hidden md:block absolute left-0 -bottom-2 -ml-6 h-[430px] w-auto max-w-none object-contain drop-shadow-[0_25px_35px_rgba(0,0,0,0.5)]"
                />
              </div>
              <div className="md:col-span-7 px-4 sm:px-6 pb-6 pt-4 md:p-10 flex flex-col justify-center">
                <p className="text-[10px] uppercase tracking-[0.28em] text-app-accent/90 font-bold mb-2">
                  {t.splash.kicker}
                </p>
                <h2 className="text-4xl sm:text-4xl md:text-6xl font-light tracking-tight text-app-text leading-none mb-4">{t.splash.title}</h2>
                <p className="text-[11px] uppercase tracking-[0.2em] text-app-muted/75 font-semibold">{t.splash.appInfoTitle}</p>
                <p className="mt-2 text-sm md:text-base text-app-muted/85 leading-relaxed max-w-xl">{t.splash.appInfoBody}</p>
                <p className="mt-4 text-xs text-app-muted/80">
                  {t.splash.createdByLabel}: <span className="text-app-text font-semibold">Angel Muse Doll</span>
                </p>
                <div className="mt-6 flex flex-col sm:flex-row flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowWelcomeSplash(false)}
                    className="scoring-btn-primary rounded-xl h-11 w-full sm:w-auto px-4 text-xs font-bold uppercase tracking-widest"
                  >
                    {t.splash.enterButton}
                  </button>
                  <Link
                    to="/manual"
                    className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-app-border/70 bg-app-card/65 h-11 px-4 text-xs font-bold uppercase tracking-widest text-app-text hover:text-app-accent no-underline"
                  >
                    <BookOpen className="w-4 h-4" />
                    {t.splash.howToButton}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <motion.footer 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="hidden md:block w-full py-10 text-center border-t border-app-border/20 z-10"
      >
        <p className="text-[10px] text-app-muted/45 font-bold uppercase tracking-[0.2em] mb-2">
          {t.landing.sessionCounterLabel}: <span className="text-app-text/70">{sessionCounter ?? t.landing.sessionCounterUnavailable}</span>
        </p>
        <p className="text-[12px] text-app-muted/40 font-medium tracking-wide">
          &copy; {new Date().getFullYear()} PAGEANTS APP &bull; {t.footerByLabel.toUpperCase()}{' '}
          <a href="https://discord.com/users/angelmuse_87856" target="_blank" rel="noopener noreferrer" className="text-app-text/60 hover:text-app-accent transition-colors underline decoration-app-border underline-offset-4 font-bold">ANGEL MUSE DOLL</a>
        </p>
      </motion.footer>
    </div>
  );
}
