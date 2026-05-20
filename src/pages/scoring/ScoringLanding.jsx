import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Crown, Sun, Moon, ShieldCheck, Users, Eye, BookOpen, UserCog } from 'lucide-react';
import { motion } from 'framer-motion';
import ScoringLanguageToggle from './ScoringLanguageToggle';
import { getStoredScoringLanguage, persistScoringLanguage, scoringCopy } from './scoringI18n';
import {
  getScoringThemeStyleVars,
  getStoredScoringAccent,
  getStoredScoringTheme,
  persistScoringAccent,
  persistScoringTheme
} from './scoringTheme';

export default function ScoringLanding() {
  const [theme, setTheme] = useState(getStoredScoringTheme());
  const [accentColor, setAccentColor] = useState(getStoredScoringAccent());
  const [language, setLanguage] = useState(getStoredScoringLanguage());
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
              <Link
                to="/create"
                className="no-underline rounded-2xl border border-app-border/70 bg-app-card/45 px-4 py-5 hover:border-app-accent/45 transition-colors"
              >
                <span className="inline-flex w-10 h-10 items-center justify-center rounded-xl bg-app-accent/12 text-app-accent">
                  <UserCog className="w-5 h-5" />
                </span>
                <p className="mt-4 text-base font-bold text-app-text">{t.landing.roleHost}</p>
                <p className="text-xs text-app-muted/80 mt-1">{t.landing.createDescription}</p>
              </Link>

              <Link
                to="/join"
                className="no-underline rounded-2xl border border-app-border/70 bg-app-card/45 px-4 py-5 hover:border-app-accent/45 transition-colors"
              >
                <span className="inline-flex w-10 h-10 items-center justify-center rounded-xl bg-app-accent/12 text-app-accent">
                  <Users className="w-5 h-5" />
                </span>
                <p className="mt-4 text-base font-bold text-app-text">{t.landing.roleJudge}</p>
                <p className="text-xs text-app-muted/80 mt-1">{t.landing.joinDescription}</p>
              </Link>

              <Link
                to="/results"
                className="no-underline rounded-2xl border border-app-border/70 bg-app-card/45 px-4 py-5 hover:border-app-accent/45 transition-colors"
              >
                <span className="inline-flex w-10 h-10 items-center justify-center rounded-xl bg-app-accent/12 text-app-accent">
                  <Eye className="w-5 h-5" />
                </span>
                <p className="mt-4 text-base font-bold text-app-text">{t.landing.roleSpectator}</p>
                <p className="text-xs text-app-muted/80 mt-1">{t.landing.liveResultsDescription}</p>
              </Link>
            </div>
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
