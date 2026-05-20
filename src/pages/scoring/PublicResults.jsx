import { Fragment, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { Copy, Check, Crown, Trophy, ClipboardList, ExternalLink } from 'lucide-react';
import { db } from '../../core/firebase-config.js';
import {
  getDefaultPhaseName,
  getSessionTypeLabel,
  getStoredScoringLanguage,
  normalizeScoringLanguage,
  scoringCopy
} from './scoringI18n';
import {
  getScoringBodyBackground,
  getScoringThemeStyleVars,
  getStoredScoringAccent,
  getStoredScoringTheme
} from './scoringTheme';

const OVERALL_RESULTS_VIEW = -2;
const WINNER_VIEW = -1;

function getDefaultPhase(language) {
  return { name: getDefaultPhaseName(0, language), cutoff: null, participantIds: null, absentParticipantIds: null, status: 'active' };
}

function normalizePhase(phase, index, currentPhaseIndex, language) {
  const cutoff = Number.parseInt(phase?.cutoff, 10);
  const participantIds = Array.isArray(phase?.participantIds)
    ? phase.participantIds.filter(id => typeof id === 'string' && id.trim())
    : null;
  const absentParticipantIds = Array.isArray(phase?.absentParticipantIds)
    ? phase.absentParticipantIds.filter(id => typeof id === 'string' && id.trim())
    : null;

  return {
    name: typeof phase?.name === 'string' && phase.name.trim() ? phase.name.trim() : getDefaultPhaseName(index, language),
    cutoff: Number.isFinite(cutoff) && cutoff > 0 ? cutoff : null,
    participantIds: participantIds?.length ? participantIds : null,
    absentParticipantIds: absentParticipantIds?.length ? absentParticipantIds : null,
    status:
      phase?.status === 'completed' || phase?.status === 'active'
        ? phase.status
        : index === currentPhaseIndex
          ? 'active'
          : 'completed'
  };
}

function getPhaseOrder(key, phase, fallbackIndex) {
  if (typeof phase?.index === 'number') return phase.index;
  const match = String(key).match(/\d+/);
  return match ? Number.parseInt(match[0], 10) : fallbackIndex;
}

function normalizePhases(rawPhases, currentPhaseIndex = 0, language = 'es') {
  if (Array.isArray(rawPhases) && rawPhases.length > 0) {
    return rawPhases.map((phase, index) => normalizePhase(phase, index, currentPhaseIndex, language));
  }

  if (rawPhases && typeof rawPhases === 'object') {
    if ('name' in rawPhases || 'cutoff' in rawPhases || 'status' in rawPhases) {
      return [normalizePhase(rawPhases, 0, currentPhaseIndex, language)];
    }

    const normalized = Object.entries(rawPhases)
      .filter(([, phase]) => phase && typeof phase === 'object')
      .sort((a, b) => getPhaseOrder(a[0], a[1], 0) - getPhaseOrder(b[0], b[1], 0))
      .map(([, phase], index) => normalizePhase(phase, index, currentPhaseIndex, language));

    if (normalized.length > 0) return normalized;
  }

  return [getDefaultPhase(language)];
}

function rankParticipantsByPhaseScores(participants, phaseScores) {
  return participants
    .map(participant => {
      const participantScores = phaseScores[participant.id] || {};
      const values = Object.values(participantScores).filter(value => value !== null && value !== undefined);
      const avg = values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
      return { ...participant, avg, voteCount: values.length };
    })
    .sort((a, b) => b.avg - a.avg || a.name.localeCompare(b.name));
}

export default function PublicResults() {
  const { sessionId } = useParams();
  const [session, setSession] = useState(null);
  const [scores, setScores] = useState({});
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [theme] = useState(getStoredScoringTheme());
  const [accentColor] = useState(getStoredScoringAccent());
  const fallbackLanguage = getStoredScoringLanguage();
  const currentLanguage = normalizeScoringLanguage(session?.language || fallbackLanguage);
  const t = scoringCopy[currentLanguage] || scoringCopy.es;
  const [selectedView, setSelectedView] = useState(OVERALL_RESULTS_VIEW);

  useEffect(() => {
    document.body.style.background = getScoringBodyBackground(theme);
  }, [theme]);

  useEffect(() => {
    if (!sessionId) return;
    const unsubSession = onSnapshot(doc(db, 'sessions', sessionId), snapshot => {
      setSession(snapshot.exists() ? snapshot.data() : null);
      setLoading(false);
    });
    const unsubScores = onSnapshot(doc(db, 'sessions', `${sessionId}_scores`), snapshot => {
      setScores(snapshot.exists() ? snapshot.data() : {});
    });
    return () => {
      unsubSession();
      unsubScores();
    };
  }, [sessionId]);

  const {
    phases,
    currentPhaseIndex,
    currentPhase,
    winner,
    winnerPhaseName,
    visiblePhases,
    overallResults,
    selectedPhase,
    selectedPhaseParticipants,
    selectedPhaseScores,
    rankedParticipants,
    judges,
    qualifiedIds
  } = useMemo(() => {
    if (!session) {
      return {
        phases: [],
        currentPhaseIndex: 0,
        currentPhase: null,
        winner: null,
        winnerPhaseName: '',
        visiblePhases: [],
        overallResults: [],
        selectedPhase: null,
        selectedPhaseParticipants: [],
        selectedPhaseScores: {},
        rankedParticipants: [],
        judges: [],
        qualifiedIds: new Set()
      };
    }

    const allParticipants = session.participants || [];
    const judgesList = session.judges || [];
    const requestedPhaseIndex = Number.isInteger(session.currentPhaseIndex) ? session.currentPhaseIndex : 0;
    const normalizedPhases = normalizePhases(session.phases, requestedPhaseIndex, currentLanguage);
    const safePhaseIndex = Math.min(Math.max(requestedPhaseIndex, 0), normalizedPhases.length - 1);
    const activePhase = normalizedPhases[safePhaseIndex] || getDefaultPhase(currentLanguage);
    const participantMap = new Map(allParticipants.map(participant => [participant.id, participant]));

    const getPhaseParticipants = (phaseIdx) => {
      if (phaseIdx < 0) return [];
      if (phaseIdx === 0) return allParticipants;

      const phase = normalizedPhases[phaseIdx];
      const absentIds = new Set(Array.isArray(phase?.absentParticipantIds) ? phase.absentParticipantIds : []);
      const baseParticipants = phase?.participantIds?.length
        ? phase.participantIds.map(participantId => participantMap.get(participantId)).filter(Boolean)
        : null;

      if (baseParticipants) {
        const targetCount = baseParticipants.length;
        const baseSet = new Set(baseParticipants.map(participant => participant.id));
        const activeBase = baseParticipants.filter(participant => !absentIds.has(participant.id));
        const previousParticipants = getPhaseParticipants(phaseIdx - 1);
        const previousScores = scores[`phase_${phaseIdx - 1}`] || {};
        const alternates = rankParticipantsByPhaseScores(previousParticipants, previousScores)
          .filter(participant => !baseSet.has(participant.id) && !absentIds.has(participant.id));

        const activeParticipants = [...activeBase];
        alternates.forEach(participant => {
          if (activeParticipants.length < targetCount) {
            activeParticipants.push(participant);
          }
        });

        return activeParticipants;
      }

      const prevPhase = normalizedPhases[phaseIdx - 1];
      const prevParticipants = getPhaseParticipants(phaseIdx - 1);
      if (!prevPhase || !prevPhase.cutoff) return prevParticipants;
      const prevScores = scores[`phase_${phaseIdx - 1}`] || {};
      return rankParticipantsByPhaseScores(prevParticipants, prevScores).slice(0, prevPhase.cutoff);
    };

    const visible = normalizedPhases.slice(0, safePhaseIndex + 1);
    const overall = allParticipants
      .map(participant => {
        const phaseBreakdown = visible.map((phase, idx) => {
          const phaseParticipants = getPhaseParticipants(idx);
          const isInPhase = phaseParticipants.some(currentParticipant => currentParticipant.id === participant.id);
          if (!isInPhase) {
            return { total: null, voteCount: 0, participated: false };
          }

          const participantScores = scores[`phase_${idx}`]?.[participant.id] || {};
          const values = Object.values(participantScores).filter(value => value !== null && value !== undefined);
          const total = values.reduce((sum, value) => sum + value, 0);
          return { total, voteCount: values.length, participated: true };
        });

        const overallTotal = phaseBreakdown.reduce((sum, phaseResult) => sum + (phaseResult.total || 0), 0);
        const overallVotes = phaseBreakdown.reduce((sum, phaseResult) => sum + phaseResult.voteCount, 0);

        return {
          ...participant,
          phaseBreakdown,
          overallTotal,
          overallVotes,
          overallAverage: overallVotes > 0 ? overallTotal / overallVotes : 0
        };
      })
      .sort((a, b) => b.overallTotal - a.overallTotal || b.overallAverage - a.overallAverage || a.name.localeCompare(b.name));

    const effectiveSelectedView = typeof selectedView === 'number' && selectedView >= 0 ? selectedView : safePhaseIndex;
    const phase = normalizedPhases[effectiveSelectedView] || null;
    const participants = phase ? getPhaseParticipants(effectiveSelectedView) : [];
    const phaseScores = phase ? (scores[`phase_${effectiveSelectedView}`] || {}) : {};
    const ranked = rankParticipantsByPhaseScores(participants, phaseScores);
    const cutoffLimit = phase?.cutoff || ranked.length;
    const qualified = new Set(ranked.slice(0, cutoffLimit).map(participant => participant.id));
    const sessionWinner = session.winnerId ? participantMap.get(session.winnerId) : null;

    return {
      phases: normalizedPhases,
      currentPhaseIndex: safePhaseIndex,
      currentPhase: activePhase,
      winner: sessionWinner,
      winnerPhaseName: normalizedPhases[session.winnerPhaseIndex]?.name || activePhase.name,
      visiblePhases: visible,
      overallResults: overall,
      selectedPhase: phase,
      selectedPhaseParticipants: participants,
      selectedPhaseScores: phaseScores,
      rankedParticipants: ranked,
      judges: judgesList,
      qualifiedIds: qualified
    };
  }, [session, scores, currentLanguage, selectedView]);

  useEffect(() => {
    if (!session) return;
    if (session.status === 'completed' && winner) {
      setSelectedView(WINNER_VIEW);
      return;
    }
    setSelectedView(OVERALL_RESULTS_VIEW);
  }, [session, winner]);

  const publicUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/session/${sessionId}/results`
    : `/session/${sessionId}/results`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_) {
      setCopied(false);
    }
  };

  if (loading) {
    return (
      <div className={`theme-scoring-${theme} min-h-screen bg-app-bg text-app-text flex items-center justify-center`} style={getScoringThemeStyleVars(accentColor)}>
        <div className="w-8 h-8 border-2 border-app-border rounded-full animate-spin" style={{ borderTopColor: 'var(--color-app-text)' }} />
      </div>
    );
  }

  if (!session) {
    return (
      <div className={`theme-scoring-${theme} min-h-screen bg-app-bg text-app-text flex items-center justify-center p-6`} style={getScoringThemeStyleVars(accentColor)}>
        <div className="scoring-panel rounded-2xl p-8 text-center max-w-lg">
          <h1 className="text-2xl font-bold mb-2">{t.join.sessionMissing}</h1>
        </div>
      </div>
    );
  }

  const isWinnerView = selectedView === WINNER_VIEW;
  const isOverallView = selectedView === OVERALL_RESULTS_VIEW;
  const winnerOverallResult = winner ? overallResults.find(participant => participant.id === winner.id) : null;

  return (
    <div
      className={`theme-scoring-${theme} min-h-screen bg-app-bg text-app-text font-sans`}
      style={getScoringThemeStyleVars(accentColor, theme)}
    >
      <div className="max-w-7xl mx-auto p-4 md:p-8">
        <header className="scoring-panel rounded-2xl p-4 md:p-6 mb-4 md:mb-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-xs uppercase tracking-widest text-app-muted/70">{t.board.publicResultsLabel || 'Resultados públicos'}</p>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight">{session.name}</h1>
              <p className="text-xs text-app-muted/70 mt-1">{getSessionTypeLabel(session.type, currentLanguage)}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={copyLink} className="scoring-btn-icon flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold">
                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                {copied ? (t.board.linkCopied || 'Copiado') : (t.board.copyPublicLink || 'Copiar link')}
              </button>
              <a href={publicUrl} target="_blank" rel="noreferrer" className="scoring-btn-icon flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold no-underline">
                <ExternalLink className="w-4 h-4" />
                {t.board.openInNewTab || 'Abrir'}
              </a>
            </div>
          </div>
        </header>

        {session.status !== 'completed' && (
          <div className="scoring-panel rounded-2xl p-4 md:p-6 mb-4 md:mb-6">
            <p className="text-sm text-app-muted">{t.board.publicResultsPending || 'Los resultados finales todavía no han sido publicados por el host.'}</p>
          </div>
        )}

        <section className="scoring-panel rounded-2xl overflow-hidden">
          <div className="flex overflow-x-auto border-b border-app-border bg-app-card px-4 py-3 scrollbar-none">
            {visiblePhases.map((phase, idx) => (
              <button
                key={`${phase.name}-${idx}`}
                onClick={() => setSelectedView(idx)}
                className={`px-3 py-2 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors mr-2 ${
                  selectedView === idx ? 'scoring-badge-active' : 'text-app-muted/70 hover:text-app-text hover:bg-app-border/30'
                }`}
              >
                <ClipboardList className="w-3.5 h-3.5 inline mr-1" />
                {phase.name}
              </button>
            ))}
            <button
              onClick={() => setSelectedView(OVERALL_RESULTS_VIEW)}
              className={`px-3 py-2 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors mr-2 ${
                isOverallView ? 'scoring-badge-active' : 'text-app-muted/70 hover:text-app-text hover:bg-app-border/30'
              }`}
            >
              <Trophy className="w-3.5 h-3.5 inline mr-1" />
              {t.board.overallResultsTab}
            </button>
            {session.status === 'completed' && winner && (
              <button
                onClick={() => setSelectedView(WINNER_VIEW)}
                className={`px-3 py-2 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors ${
                  isWinnerView ? 'border border-amber-400/30 bg-amber-400/10 text-amber-500' : 'text-amber-600/80 hover:text-amber-600 hover:bg-amber-400/10'
                }`}
              >
                <Crown className="w-3.5 h-3.5 inline mr-1" />
                {t.board.officialWinnerTab}
              </button>
            )}
          </div>

          <div className="p-4 md:p-6">
            {isWinnerView ? (
              <div className="scoring-winner-stage relative flex min-h-[360px] items-center justify-center overflow-hidden rounded-2xl border border-amber-300/20 p-8 text-center">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.08),transparent_18%),radial-gradient(circle_at_80%_15%,rgba(251,191,36,0.18),transparent_20%),radial-gradient(circle_at_50%_85%,rgba(255,255,255,0.05),transparent_20%)] opacity-80" />
                <div className="relative z-10 flex max-w-xl flex-col items-center">
                  <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-amber-200/20 bg-amber-300/10 text-amber-200 shadow-[0_0_30px_rgba(251,191,36,0.2)]">
                    <Crown className="h-10 w-10" />
                  </div>
                  <p className="text-xs uppercase tracking-[0.45em] text-amber-200/70">{t.board.winnerTitle}</p>
                  <h2 className="mt-3 text-4xl font-black tracking-tight text-app-text md:text-5xl">{winner?.flag} {winner?.name || t.board.winnerPending}</h2>
                  {winnerOverallResult && (
                    <div className="mt-8 grid w-full max-w-sm grid-cols-2 gap-3">
                      <div className="rounded-2xl border border-app-border bg-app-card/70 px-5 py-4">
                        <p className="text-xs uppercase tracking-[0.3em] text-app-muted/70">{t.board.winnerScore}</p>
                        <p className="mt-2 text-3xl font-mono text-app-text">{winnerOverallResult.overallAverage.toFixed(2)}</p>
                      </div>
                      <div className="rounded-2xl border border-app-border bg-app-card/70 px-5 py-4">
                        <p className="text-xs uppercase tracking-[0.3em] text-app-muted/70">{t.board.winnerPhaseLabel}</p>
                        <p className="mt-2 text-base text-app-text">{winnerPhaseName}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : isOverallView ? (
              <div className="overflow-x-auto rounded-xl border border-app-border/80">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-app-border/30 border-b border-app-border text-xs uppercase tracking-widest text-app-muted/70">
                      <th className="px-4 py-3 text-center w-10 font-semibold">#</th>
                      <th className="px-4 py-3 font-semibold">{t.board.contestant}</th>
                      {visiblePhases.map((phase, idx) => (
                        <th key={`${phase.name}-${idx}`} className="px-4 py-3 text-center font-semibold whitespace-nowrap">{phase.name}</th>
                      ))}
                      <th className="px-4 py-3 text-center font-bold text-app-text bg-app-border/30">{t.board.overallTotal}</th>
                      <th className="px-4 py-3 text-center font-bold text-app-text bg-app-border/50">{t.board.overallAverage}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-app-border/70">
                    {overallResults.map((participant, idx) => {
                      const isWinnerRow = winner?.id === participant.id;
                      return (
                        <tr key={participant.id} className={isWinnerRow ? 'bg-amber-400/5' : 'bg-app-card hover:bg-app-border/20'}>
                          <td className="px-4 py-3 text-center text-sm font-medium text-app-muted/70">{idx + 1}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <span className="text-xl">{participant.flag}</span>
                              <span className={`text-sm font-semibold ${isWinnerRow ? 'text-app-accent' : 'text-app-text'}`}>{participant.name}</span>
                            </div>
                          </td>
                          {participant.phaseBreakdown.map((phaseResult, index) => (
                            <td key={`${participant.id}-${index}`} className="px-4 py-3 text-center text-sm font-mono text-app-muted">
                              {phaseResult.participated ? phaseResult.total.toFixed(2) : '—'}
                            </td>
                          ))}
                          <td className={`px-4 py-3 text-center text-sm font-mono font-bold bg-app-border/10 ${isWinnerRow ? 'text-app-accent' : 'text-app-text'}`}>
                            {participant.overallTotal.toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-center text-sm font-mono font-semibold text-app-text bg-app-border/30">
                            {participant.overallAverage.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-app-border/80">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-app-border/30 border-b border-app-border text-xs uppercase tracking-widest text-app-muted/70">
                      <th className="px-4 py-3 text-center w-10 font-semibold">#</th>
                      <th className="px-4 py-3 font-semibold">{t.board.contestant}</th>
                      {judges.map(judge => (
                        <th key={judge} className="px-4 py-3 text-center font-semibold whitespace-nowrap">{judge}</th>
                      ))}
                      <th className="px-4 py-3 text-center font-bold text-app-text bg-app-border/30">{t.board.total}</th>
                      <th className="px-4 py-3 text-center font-bold text-app-text bg-app-border/50">{t.board.average}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-app-border/70">
                    {rankedParticipants.map((participant, idx) => {
                      const participantScores = selectedPhaseScores[participant.id] || {};
                      const values = judges.map(judge => participantScores[judge]).filter(value => value !== null && value !== undefined);
                      const total = values.reduce((sum, value) => sum + value, 0);
                      const average = values.length > 0 ? total / values.length : 0;
                      const isQualified = qualifiedIds.has(participant.id);
                      const showCutoffLine = selectedPhase?.cutoff && idx === selectedPhase.cutoff;

                      return (
                        <Fragment key={participant.id}>
                          {showCutoffLine && (
                            <tr className="bg-red-500/10 border-y border-red-500/30">
                              <td colSpan={judges.length + 4} className="py-2 px-4 text-[9px] font-bold text-red-100 uppercase tracking-[0.2em] text-center">
                                {t.board.cutoffLine}
                              </td>
                            </tr>
                          )}
                          <tr className={isQualified ? 'bg-app-card hover:bg-app-border/20' : 'opacity-40 grayscale-[50%]'} style={!isQualified ? { backgroundColor: 'var(--color-app-danger-soft)' } : undefined}>
                            <td className="px-4 py-3 text-center text-sm font-medium text-app-muted/70">{idx + 1}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <span className="text-xl">{participant.flag}</span>
                                <span className={`text-sm font-semibold ${isQualified ? 'text-app-text' : 'text-app-muted'}`}>{participant.name}</span>
                              </div>
                            </td>
                            {judges.map(judge => (
                              <td key={`${participant.id}-${judge}`} className="px-4 py-3 text-center text-sm font-mono text-app-muted">
                                {participantScores[judge] !== undefined && participantScores[judge] !== null ? participantScores[judge].toFixed(2) : '-'}
                              </td>
                            ))}
                            <td className="px-4 py-3 text-center text-sm font-mono font-semibold text-app-text bg-app-border/10">{total.toFixed(2)}</td>
                            <td className={`px-4 py-3 text-center text-sm font-mono font-bold bg-app-border/30 ${isQualified ? 'text-app-text' : 'text-app-muted'}`}>
                              {average.toFixed(2)}
                            </td>
                          </tr>
                        </Fragment>
                      );
                    })}
                    {selectedPhaseParticipants.length === 0 && (
                      <tr>
                        <td colSpan={judges.length + 4} className="px-4 py-10 text-center text-app-muted/70 text-sm">
                          {t.board.noParticipantsInPhase}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
