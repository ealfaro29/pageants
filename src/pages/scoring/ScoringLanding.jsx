import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Plus, LogIn, Crown, Sun, Moon, ArrowRight, ShieldCheck, Users, Eye, BookOpen } from 'lucide-react';
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full">
          <motion.div variants={itemVariants}>
            <Link
              to="/create"
              className="group relative flex flex-col h-full bg-app-card/40 backdrop-blur-xl border border-app-border/50 rounded-[2rem] p-10 transition-all no-underline hover:border-app-accent/40 hover:bg-app-card/60 overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity">
                <Plus className="w-40 h-40 text-app-text" />
              </div>
              
              <div className="w-14 h-14 rounded-2xl bg-app-accent/10 border border-app-accent/20 flex items-center justify-center mb-8 group-hover:scale-110 transition-transform">
                <Plus className="w-7 h-7 text-app-accent" />
              </div>
              
              <div className="mt-auto space-y-3">
                <h2 className="text-3xl font-bold text-app-text flex items-center gap-3">
                  {t.landing.createTitle}
                  <ArrowRight className="w-6 h-6 opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                </h2>
                <p className="text-sm text-app-muted leading-relaxed max-w-sm">
                  {t.landing.createDescription}
                </p>
              </div>
            </Link>
          </motion.div>

          <motion.div variants={itemVariants}>
            <Link
              to="/join"
              className="group relative flex flex-col h-full bg-app-card/40 backdrop-blur-xl border border-app-border/50 rounded-[2rem] p-10 transition-all no-underline hover:border-app-accent/40 hover:bg-app-card/60 overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity">
                <Users className="w-40 h-40 text-app-text" />
              </div>

              <div className="w-14 h-14 rounded-2xl bg-app-accent/10 border border-app-accent/20 flex items-center justify-center mb-8 group-hover:scale-110 transition-transform">
                <LogIn className="w-7 h-7 text-app-accent" />
              </div>
              
              <div className="mt-auto space-y-3">
                <h2 className="text-3xl font-bold text-app-text flex items-center gap-3">
                  {t.landing.joinTitle}
                  <ArrowRight className="w-6 h-6 opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                </h2>
                <p className="text-sm text-app-muted leading-relaxed max-w-sm">
                  {t.landing.joinDescription}
                </p>
              </div>
            </Link>
          </motion.div>

          <motion.div variants={itemVariants}>
            <Link
              to="/results"
              className="group relative flex flex-col h-full bg-app-card/40 backdrop-blur-xl border border-app-border/50 rounded-[2rem] p-10 transition-all no-underline hover:border-app-accent/40 hover:bg-app-card/60 overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity">
                <Eye className="w-40 h-40 text-app-text" />
              </div>

              <div className="w-14 h-14 rounded-2xl bg-app-accent/10 border border-app-accent/20 flex items-center justify-center mb-8 group-hover:scale-110 transition-transform">
                <Eye className="w-7 h-7 text-app-accent" />
              </div>

              <div className="mt-auto space-y-3">
                <h2 className="text-3xl font-bold text-app-text flex items-center gap-3">
                  {t.landing.liveResultsTitle}
                  <ArrowRight className="w-6 h-6 opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                </h2>
                <p className="text-sm text-app-muted leading-relaxed max-w-sm">
                  {t.landing.liveResultsDescription}
                </p>
              </div>
            </Link>
          </motion.div>
        </div>
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
