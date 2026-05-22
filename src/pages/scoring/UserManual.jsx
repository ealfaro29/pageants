import { Link } from 'react-router-dom';
import { ArrowLeft, BookOpen, ExternalLink } from 'lucide-react';
import { getScoringThemeStyleVars, getStoredScoringAccent, getStoredScoringTheme } from './scoringTheme';

const manualSteps = [
  {
    title: '1) Welcome Splash Screen',
    text: 'When the app opens, a welcome splash appears over the landing. Use Enter System to continue, or open How to Use directly from the splash.',
    image: '/manual/01-welcome-splash.png'
  },
  {
    title: '2) Choose Your Role on Landing',
    text: 'On the landing, choose one path: Host (create and control session), Judge (request access to score), or Audience (view public results).',
    image: '/manual/02-landing-roles.png'
  },
  {
    title: '3) Create Session with Scoring Mode',
    text: 'As host, set your name, pageant name, type, scoring mode (Total Aggregate or Per Phase), and whether the host also votes or only administers.',
    image: '/manual/03-create-session.png'
  },
  {
    title: '4) Share Session Code (MU- + 6 Characters)',
    text: 'The host board shows the session code. Judges and audience enter only the 6-character suffix because MU- is fixed in the input.',
    image: '/manual/04-host-session-code.png'
  },
  {
    title: '5) Judge Requests Access',
    text: 'A judge enters name + 6-character code suffix and joins. Their access stays pending until the host approves.',
    image: '/manual/05-judge-awaiting-approval.png'
  },
  {
    title: '6) Host Approval Notification',
    text: 'Hosts receive a pending-judge notification with direct Approve/Reject actions. If the original host becomes inactive, controls transfer automatically to the first approved judge; when the host returns, they can reclaim controls from a notification.',
    image: '/manual/06-host-pending-notification.png'
  },
  {
    title: '7) Score the Active Phase',
    text: 'Approved judges can score the active phase. During live scoring, judges do not see live cut/elimination decisions from the current phase.',
    image: '/manual/07-judge-scoring.png'
  },
  {
    title: '8) Native Cutoff Confirmation',
    text: 'If the host tries to advance without cutoff, the app opens an in-app modal to define how many contestants advance before continuing.',
    image: '/manual/08-cutoff-modal.png'
  },
  {
    title: '9) Winner Screen',
    text: 'When final cutoff is 1 and host reveals the winner, the board shows the winner summary and official final metrics.',
    image: '/manual/09-winner-view.png'
  },
  {
    title: '10) Public Results View',
    text: 'Audience enters only the 6-character code suffix to open results. Public view shows closed phases and final winner when published.',
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
                Updated workflow guide with splash entry, scoring modes, host approval alerts, native cutoff modal, and latest public-results behavior.
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
