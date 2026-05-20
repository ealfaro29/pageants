import { Link } from 'react-router-dom';
import { ArrowLeft, BookOpen, ExternalLink } from 'lucide-react';
import { getScoringThemeStyleVars, getStoredScoringAccent, getStoredScoringTheme } from './scoringTheme';

const manualSteps = [
  {
    title: '1) Open the Scoring Home',
    text: 'Start at the scoring landing. You have three entry points: Create Session (host), Join as Judge (judges), and View Live Results (audience).',
    image: '/manual/01-landing.png'
  },
  {
    title: '2) Create a Session as Host',
    text: 'Go to Create Session, enter your host name and pageant name, then click Create Session.',
    image: '/manual/02-create-session.png'
  },
  {
    title: '3) Host Dashboard Opens',
    text: 'After creation, the host lands on the live board with a session code in the top bar. Share that code with judges.',
    image: '/manual/03-host-board.png'
  },
  {
    title: '4) Add Contestants and Set Cutoff',
    text: 'Add contestants from search (or manually if needed) and define how many advance in the current phase.',
    image: '/manual/04-participants-and-cutoff.png'
  },
  {
    title: '5) Judge Requests Access',
    text: 'A judge joins using name + session code. They are placed in waiting mode until the host approves.',
    image: '/manual/05-judge-awaiting-approval.png'
  },
  {
    title: '6) Host Approves Pending Judge',
    text: 'Open Settings, review pending requests, and approve or reject each judge.',
    image: '/manual/06-host-approves-judge.png'
  },
  {
    title: '7) Judge Starts Scoring',
    text: 'Once approved, the judge enters the live board and can score every contestant in the active phase.',
    image: '/manual/07-judge-board.png'
  },
  {
    title: '8) Complete Scoring',
    text: 'When all judges finish scoring, the host can advance the phase or reveal winner (if cutoff = 1).',
    image: '/manual/08-scoring-complete.png'
  },
  {
    title: '9) Winner Screen',
    text: 'After final reveal, the board shows the winner summary and ranking panel.',
    image: '/manual/09-winner-view.png'
  },
  {
    title: '10) Public Results View',
    text: 'Audience opens public results using the session code. Only closed phases are visible publicly while scoring is in progress.',
    image: '/manual/10-public-results.png'
  }
];

export default function UserManual() {
  const theme = getStoredScoringTheme();
  const accentColor = getStoredScoringAccent();

  return (
    <div
      className={`theme-scoring-${theme} min-h-screen bg-app-bg text-app-text font-sans`}
      style={getScoringThemeStyleVars(accentColor, theme)}
    >
      <div className="max-w-6xl mx-auto p-4 md:p-8">
        <header className="scoring-panel rounded-2xl p-5 md:p-7 mb-5 md:mb-7">
          <Link to="/" className="inline-flex items-center gap-2 text-xs text-app-muted/80 hover:text-app-text transition-colors mb-5 no-underline uppercase tracking-widest">
            <ArrowLeft className="w-4 h-4" />
            Back to scoring home
          </Link>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.26em] font-bold text-app-accent/90 mb-2">
                <BookOpen className="w-3.5 h-3.5" />
                Full User Manual
              </p>
              <h1 className="text-3xl md:text-4xl font-black tracking-tight">Scoring App - Complete Usage Guide</h1>
              <p className="text-sm md:text-base text-app-muted/80 mt-3 max-w-3xl">
                This guide is documented from a real demo session and is designed so any user can operate the full scoring workflow without additional help.
              </p>
            </div>
            <a
              href="/results"
              className="scoring-btn-secondary rounded-lg h-10 px-4 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest no-underline"
            >
              Open Live Results Access
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </header>

        <section className="space-y-4 md:space-y-5">
          {manualSteps.map(step => (
            <article key={step.title} className="scoring-panel rounded-2xl overflow-hidden border border-app-border/70">
              <div className="p-4 md:p-6 border-b border-app-border/60">
                <h2 className="text-xl md:text-2xl font-bold tracking-tight">{step.title}</h2>
                <p className="text-sm md:text-base text-app-muted/80 mt-2 leading-relaxed">{step.text}</p>
              </div>
              <div className="bg-black/30">
                <img src={step.image} alt={step.title} className="w-full h-auto block" />
              </div>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}
