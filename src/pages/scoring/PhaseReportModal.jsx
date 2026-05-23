import { useEffect, useState, useRef, Fragment } from 'react';
import { X, Download, ImageIcon } from 'lucide-react';
import { toPng } from 'html-to-image';
import { scoringCopy } from './scoringI18n';
import { getScoringThemeStyleVars, getStoredScoringAccent } from './scoringTheme';
import { isTotalScoringMode } from './scoringMode';

function getVotingJudges(sessionData) {
  const includeHostVote = sessionData?.hostCanVote !== false;
  const hostName = String(sessionData?.host || '').trim().toLowerCase();
  const judges = Array.isArray(sessionData?.judges) ? sessionData.judges : [];
  if (includeHostVote) return judges;
  return judges.filter(judge => String(judge || '').trim().toLowerCase() !== hostName);
}

function isPhaseResultPublished(phase) {
  return Boolean(phase?.resultsPublished) || phase?.status === 'completed';
}

export default function PhaseReportModal({
  isOpen,
  onClose,
  session,
  scores,
  phases,
  currentPhaseIndex,
  getPhaseParticipants,
  rankParticipantsByPhaseScores,
  language,
  globalResults,
  winner
}) {
  const [selectedPhaseIdx, setSelectedPhaseIdx] = useState(currentPhaseIndex);
  const [isExporting, setIsExporting] = useState(false);
  const [accentColor] = useState(getStoredScoringAccent());
  const reportRef = useRef(null);
  const t = scoringCopy[language] || scoringCopy['es'];
  const isTotalScoring = isTotalScoringMode(session?.scoringMode);
  const OVERALL_RESULTS_VIEW = -2;
  const WINNER_VIEW = -1;

  useEffect(() => {
    if (!isOpen) return;

    const publishedIndexes = phases
      .map((phase, index) => (isPhaseResultPublished(phase) ? index : null))
      .filter(index => index !== null);
    if (isPhaseResultPublished(phases[currentPhaseIndex])) {
      setSelectedPhaseIdx(currentPhaseIndex);
      return;
    }

    if (isTotalScoring && publishedIndexes.length > 0) {
      setSelectedPhaseIdx(OVERALL_RESULTS_VIEW);
      return;
    }

    setSelectedPhaseIdx(publishedIndexes[publishedIndexes.length - 1] ?? currentPhaseIndex);
  }, [currentPhaseIndex, isOpen, isTotalScoring, phases]);

  if (!isOpen) return null;

  const judges = getVotingJudges(session);
  const allParticipants = session?.participants || [];
  const visiblePhaseEntries = phases
    .map((phase, index) => ({ phase, index }))
    .filter(({ phase }) => isPhaseResultPublished(phase));
  const visiblePhases = visiblePhaseEntries.map(({ phase }) => phase);
  const isOverallView = isTotalScoring && selectedPhaseIdx === OVERALL_RESULTS_VIEW;
  const isWinnerView = selectedPhaseIdx === WINNER_VIEW;
  const selectedPhase = selectedPhaseIdx >= 0 ? phases[selectedPhaseIdx] : null;
  const participants = selectedPhaseIdx >= 0 ? getPhaseParticipants(selectedPhaseIdx) : [];
  const phaseKey = selectedPhaseIdx >= 0 ? `phase_${selectedPhaseIdx}` : null;
  const phaseScores = phaseKey ? (scores[phaseKey] || {}) : {};
  const rankedParticipants = rankParticipantsByPhaseScores(participants, phaseScores);
  const totalPossibleVotes = visiblePhaseEntries.length * judges.length;
  const overallResults = allParticipants
    .map(participant => {
      const phaseBreakdown = visiblePhaseEntries.map(({ phase, index }) => {
        const phaseParticipants = getPhaseParticipants(index);
        const isInPhase = phaseParticipants.some(currentParticipant => currentParticipant.id === participant.id);
        if (!isInPhase) {
          return {
            phaseName: phase.name,
            total: null,
            avg: null,
            voteCount: 0,
            participated: false
          };
        }

        const participantScores = scores[`phase_${index}`]?.[participant.id] || {};
        const values = Object.values(participantScores).filter(value => value !== null && value !== undefined);
        const total = values.reduce((sum, value) => sum + value, 0);

        return {
          phaseName: phase.name,
          total,
          avg: values.length > 0 ? total / values.length : 0,
          voteCount: values.length,
          participated: true
        };
      });

      const overallTotal = phaseBreakdown.reduce((sum, phaseResult) => sum + (phaseResult.total || 0), 0);
      const overallVotes = phaseBreakdown.reduce((sum, phaseResult) => sum + phaseResult.voteCount, 0);

      return {
        ...participant,
        phaseBreakdown,
        overallTotal,
        overallVotes,
        overallAverage: totalPossibleVotes > 0 ? overallTotal / totalPossibleVotes : 0
      };
    })
    .sort((a, b) => (
      b.overallTotal - a.overallTotal
      || b.overallAverage - a.overallAverage
      || a.name.localeCompare(b.name)
    ));
  const winnerPhaseIndex = Number.isInteger(session?.winnerPhaseIndex) ? session.winnerPhaseIndex : currentPhaseIndex;
  const winnerPhaseParticipants = getPhaseParticipants(winnerPhaseIndex);
  const winnerPhaseScores = scores[`phase_${winnerPhaseIndex}`] || {};
  const winnerPhaseRankedParticipants = rankParticipantsByPhaseScores(winnerPhaseParticipants, winnerPhaseScores);
  const runnerUps = (isTotalScoring ? overallResults : winnerPhaseRankedParticipants)
    .filter(participant => participant.id !== winner?.id)
    .slice(0, 2);
  
  // Calculate elimination line for the table
  const cutoffLimit = selectedPhase?.cutoff || rankedParticipants.length;
  const qualifiedIds = new Set(rankedParticipants.slice(0, cutoffLimit).map(p => p.id));

  const exportReport = async () => {
    if (!reportRef.current) return;
    try {
      setIsExporting(true);
      const phaseLabel = isWinnerView
        ? t.board.winnerTitle
        : isOverallView
          ? t.board.overallResultsTitle
          : (selectedPhase?.name || t.board.phaseResults('', selectedPhaseIdx));
      const exportNode = reportRef.current;
      const backgroundColor = window.getComputedStyle(exportNode).backgroundColor || '#0a0a0a';
      const expandableContainers = Array.from(exportNode.querySelectorAll('[data-export-scroll]'));
      const originalRootStyle = {
        width: exportNode.style.width,
        maxWidth: exportNode.style.maxWidth,
        overflow: exportNode.style.overflow
      };
      const originalContainerStyles = expandableContainers.map(container => ({
        container,
        overflowX: container.style.overflowX,
        overflowY: container.style.overflowY,
        width: container.style.width,
        maxWidth: container.style.maxWidth
      }));

      if (document.fonts?.ready) {
        await document.fonts.ready;
      }

      exportNode.style.maxWidth = 'none';
      exportNode.style.overflow = 'visible';
      expandableContainers.forEach(container => {
        container.style.overflowX = 'visible';
        container.style.overflowY = 'visible';
        container.style.width = 'max-content';
        container.style.maxWidth = 'none';
      });

      await new Promise(resolve => requestAnimationFrame(() => resolve()));
      await new Promise(resolve => requestAnimationFrame(() => resolve()));

      const exportWidth = Math.ceil(Math.max(
        exportNode.scrollWidth,
        exportNode.getBoundingClientRect().width,
        ...expandableContainers.map(container => container.scrollWidth)
      ));
      exportNode.style.width = `${exportWidth}px`;

      await new Promise(resolve => requestAnimationFrame(() => resolve()));

      const exportHeight = Math.ceil(Math.max(
        exportNode.scrollHeight,
        exportNode.getBoundingClientRect().height
      ));
      const dataUrl = await toPng(reportRef.current, {
        cacheBust: true,
        backgroundColor,
        pixelRatio: 2,
        skipFonts: true,
        width: exportWidth,
        height: exportHeight,
        style: {
          transform: 'scale(1)',
          margin: '0',
          width: `${exportWidth}px`,
          maxWidth: 'none',
          overflow: 'visible'
        }
      });

      exportNode.style.width = originalRootStyle.width;
      exportNode.style.maxWidth = originalRootStyle.maxWidth;
      exportNode.style.overflow = originalRootStyle.overflow;
      originalContainerStyles.forEach(({ container, overflowX, overflowY, width, maxWidth }) => {
        container.style.overflowX = overflowX;
        container.style.overflowY = overflowY;
        container.style.width = width;
        container.style.maxWidth = maxWidth;
      });

      const link = document.createElement('a');
      const filename = `${session.name.replace(/\s+/g, '_')}_${phaseLabel.replace(/\s+/g, '_')}.png`;
      link.download = filename;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Failed to export image', err);
    } finally {
      if (reportRef.current) {
        reportRef.current.style.width = '';
        reportRef.current.style.maxWidth = '';
        reportRef.current.style.overflow = '';
        Array.from(reportRef.current.querySelectorAll('[data-export-scroll]')).forEach(container => {
          container.style.overflowX = '';
          container.style.overflowY = '';
          container.style.width = '';
          container.style.maxWidth = '';
        });
      }
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" style={getScoringThemeStyleVars(accentColor, session?.theme)}>
      <div className="scoring-panel rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-app-border/80 bg-app-border/30">
          <h2 className="text-lg font-bold text-app-text flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-app-muted" />
            {t.board.reportsTitle}
          </h2>
          <div className="flex items-center gap-3">
            <button
              onClick={exportReport}
              disabled={isExporting}
              className="scoring-btn-primary flex items-center gap-2 px-5 py-4 text-sm font-semibold rounded-lg disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              {isExporting ? t.board.generating : t.board.downloadImage}
            </button>
            <button
              onClick={onClose}
              className="scoring-btn-icon p-2 rounded-lg"
              title={t.board.closeReports}
              aria-label={t.board.closeReports}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex overflow-x-auto border-b border-app-border bg-app-card px-5 py-4 scrollbar-none">
          {visiblePhaseEntries.map(({ phase: ph, index }) => (
            <button
              key={index}
              onClick={() => setSelectedPhaseIdx(index)}
              className={`px-5 py-4 text-sm font-medium rounded-lg whitespace-nowrap transition-colors mr-2 ${
                selectedPhaseIdx === index
                  ? 'scoring-badge-active'
                  : 'text-app-muted/70 hover:text-app-text hover:bg-app-border/30'
              }`}
            >
              {ph.name}
            </button>
          ))}
          {isTotalScoring && (
            <button
              onClick={() => setSelectedPhaseIdx(OVERALL_RESULTS_VIEW)}
              className={`px-5 py-4 text-sm font-medium rounded-lg whitespace-nowrap transition-colors mr-2 ${
                isOverallView
                  ? 'scoring-badge-active'
                  : 'text-app-muted/70 hover:text-app-text hover:bg-app-border/30'
              }`}
            >
              {t.board.overallResultsTab}
            </button>
          )}
          {session.status === 'completed' && winner && (
            <button
              onClick={() => setSelectedPhaseIdx(WINNER_VIEW)}
              className={`px-5 py-4 text-sm font-medium rounded-lg whitespace-nowrap transition-colors flex items-center gap-2 ${
                isWinnerView
                  ? 'border border-amber-400/30 bg-amber-400/10 text-amber-500'
                  : 'text-amber-600/80 hover:text-amber-600 hover:bg-amber-400/10'
              }`}
            >
              <span aria-hidden="true">👑</span> {t.board.officialWinnerTab}
            </button>
          )}
        </div>

        {/* Content to Export */}
        <div className="flex-1 overflow-y-auto bg-app-card p-6 scrollbar-thin scrollbar-thumb-zinc-800">
          <div ref={reportRef} className="bg-app-card p-6 rounded-xl border border-app-border/50 max-w-4xl mx-auto">
            
            {/* Report Title */}
            <div className="text-center mb-8">
              <h1 className="text-2xl font-black text-app-text tracking-tight uppercase mb-1">
                {session.name}
              </h1>
              <h3 className="text-lg text-app-muted font-medium tracking-wide">
                {isWinnerView
                  ? t.board.winnerTitle 
                  : isOverallView
                    ? `${t.board.officialResults} — ${t.board.overallResultsTitle}`
                    : `${t.board.officialResults} — ${t.board.phaseResults(selectedPhase?.name, selectedPhaseIdx)}`
                }
              </h3>
            </div>
            {!isWinnerView && (
              <div className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-lg border border-app-border/70 bg-app-card/40 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-widest text-app-muted/70 mb-1">{t.board.publicHostLabel || 'Host'}</p>
                  <p className="text-sm font-semibold text-app-text">{session?.host || '-'}</p>
                </div>
                <div className="rounded-lg border border-app-border/70 bg-app-card/40 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-widest text-app-muted/70 mb-1">
                    {(t.board.publicJudgesLabel || 'Judges')} ({judges.length})
                  </p>
                  {judges.length > 0 ? (
                    <p className="text-sm text-app-text break-words">{judges.join(' · ')}</p>
                  ) : (
                    <p className="text-sm text-app-muted/60">-</p>
                  )}
                </div>
              </div>
            )}
            {!isWinnerView && (
              <p className="mb-6 text-[11px] text-app-muted/70 text-center">
                {t.board.scoringModeLabel}: {isTotalScoring ? t.board.scoringModeTotal : t.board.scoringModePhase}
              </p>
            )}

            {/* Table or Winner Card */}
            {isWinnerView ? (
              <div className="scoring-winner-stage relative flex min-h-[620px] items-center justify-center overflow-hidden rounded-[2rem] border border-[#D4AF37]/45 bg-gradient-to-br from-[#2d2106]/20 via-app-card/70 to-[#0b0b0f]/15 p-10 text-center shadow-[0_32px_95px_rgba(212,175,55,0.18)]">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_18%,rgba(255,244,176,0.28),transparent_24%),radial-gradient(circle_at_78%_18%,rgba(212,175,55,0.22),transparent_30%),radial-gradient(circle_at_50%_90%,rgba(184,134,11,0.18),transparent_26%)] opacity-95" />
                <div className="relative z-10 flex min-h-[540px] w-full max-w-3xl flex-col items-center">
                  <div className="flex flex-1 flex-col items-center justify-center">
                    <div className="mb-7 flex h-28 w-28 items-center justify-center rounded-full border border-[#F6D365]/60 bg-gradient-to-br from-[#FFF2B8]/95 via-[#D4AF37]/75 to-[#8A5A13]/80 text-6xl shadow-[0_0_70px_rgba(212,175,55,0.42)]">
                      <span aria-hidden="true">👑</span>
                    </div>
                    <p className="text-xs font-black uppercase tracking-[0.45em] text-[#D4AF37]">{t.board.winnerTitle}</p>
                    <div className="mt-5 flex flex-col items-center gap-3">
                      <span className="text-5xl leading-none md:text-6xl">{winner?.flag || '👑'}</span>
                      <h2 className="bg-gradient-to-r from-[#FFF4B0] via-[#D4AF37] to-[#B8860B] bg-clip-text text-5xl font-black tracking-tight text-transparent md:text-7xl drop-shadow-[0_0_18px_rgba(212,175,55,0.24)]">
                        {winner?.name || t.board.winnerPending}
                      </h2>
                    </div>
                    <p className="mt-5 text-lg font-semibold tracking-wide text-app-muted">{t.board.winnerSubtitle}</p>
                  </div>
                  {runnerUps.length > 0 && (
                    <div className="mt-10 w-full max-w-3xl border-t border-app-accent/20 pt-6">
                      <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.32em] text-app-muted/60">{t.board.runnerUpsTitle}</p>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        {runnerUps.map((participant, idx) => (
                          <div
                            key={`winner-runner-up-${participant.id}`}
                            className={
                              idx === 0
                                ? 'rounded-2xl border border-[#C0C0C0]/70 bg-gradient-to-br from-[#F8FAFC]/70 via-app-card/55 to-[#94A3B8]/25 px-4 py-3 text-left shadow-[0_16px_42px_rgba(148,163,184,0.18)]'
                                : 'rounded-2xl border border-[#CD7F32]/70 bg-gradient-to-br from-[#FFE0B5]/55 via-app-card/55 to-[#8A4B1F]/25 px-4 py-3 text-left shadow-[0_16px_42px_rgba(205,127,50,0.16)]'
                            }
                          >
                            <p className={idx === 0 ? 'text-[10px] font-black uppercase tracking-[0.26em] text-[#DCE3EC] drop-shadow' : 'text-[10px] font-black uppercase tracking-[0.26em] text-[#D58A50] drop-shadow'}>
                              <span aria-hidden="true" className="mr-1 text-sm align-middle">{idx === 0 ? '🥈' : '🥉'}</span>
                              {idx === 0 ? t.board.firstRunnerUpLabel : t.board.secondRunnerUpLabel}
                            </p>
                            <div className="mt-2 flex items-center gap-3">
                              <span className="text-2xl leading-none">{participant.flag}</span>
                              <p className="min-w-0 flex-1 truncate text-sm font-bold uppercase tracking-wide text-app-text">
                                {participant.name}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : isOverallView ? (
              <div data-export-scroll className="overflow-x-auto rounded-lg border border-app-border/80">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-app-border/30 border-b border-app-border text-xs uppercase tracking-widest text-app-muted/70">
                      <th className="px-5 py-4 text-center w-12 font-semibold">#</th>
                      <th className="px-5 py-4 font-semibold">{t.board.contestant}</th>
                      {visiblePhaseEntries.map(({ phase, index }) => (
                        <th key={`${phase.name}-${index}`} className="px-5 py-4 text-center font-semibold whitespace-nowrap">
                          {phase.name}
                        </th>
                      ))}
                      <th className="px-5 py-4 text-center font-bold text-app-text bg-app-border/30 whitespace-nowrap">{t.board.overallTotal}</th>
                      <th className="px-5 py-4 text-center font-bold text-app-text bg-app-border/50 whitespace-nowrap">{t.board.overallAverage}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-app-border/70">
                    {overallResults.map((participant, idx) => {
                      const isWinnerRow = winner?.id === participant.id;

                      return (
                        <tr
                          key={participant.id}
                          className={`transition-colors ${isWinnerRow ? 'bg-amber-400/5' : 'bg-app-card hover:bg-app-border/30'}`}
                        >
                          <td className="px-4 py-4 text-center text-sm font-medium text-app-muted/70">
                            {idx + 1}
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-3">
                              <span className="text-xl">{participant.flag}</span>
                              <div className="min-w-0">
                                <p className={`text-sm font-semibold truncate ${isWinnerRow ? 'text-app-accent' : 'text-app-text'}`}>
                                  {participant.name}
                                </p>
                                {isWinnerRow && (
                                  <p className="text-[10px] uppercase tracking-[0.2em] text-app-accent/80">{t.board.winnerTitle}</p>
                                )}
                              </div>
                            </div>
                          </td>
                          {participant.phaseBreakdown.map((phaseResult, idx) => (
                            <td key={`${participant.id}-${idx}`} className="px-4 py-4 text-center text-sm font-mono text-app-muted">
                              {phaseResult.participated ? phaseResult.total.toFixed(2) : '—'}
                            </td>
                          ))}
                          <td className={`px-4 py-4 text-center text-sm font-mono font-bold bg-app-border/10 ${isWinnerRow ? 'text-app-accent' : 'text-app-text'}`}>
                            {participant.overallTotal.toFixed(2)}
                          </td>
                          <td className="px-4 py-4 text-center text-sm font-mono font-semibold text-app-text bg-app-border/30">
                            {participant.overallAverage.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                    {overallResults.length === 0 && (
                      <tr>
                        <td colSpan={visiblePhases.length + 4} className="px-4 py-12 text-center text-app-muted/70 text-sm">
                          {t.board.noParticipantsInPhase}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div data-export-scroll className="overflow-x-auto rounded-lg border border-app-border/80">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-app-border/30 border-b border-app-border text-xs uppercase tracking-widest text-app-muted/70">
                      <th className="px-5 py-4 text-center w-12 font-semibold">#</th>
                      <th className="px-5 py-4 font-semibold">{t.board.contestant}</th>
                      {judges.map(judge => (
                        <th key={judge} className="px-5 py-4 text-center font-semibold whitespace-nowrap">
                          {judge}
                        </th>
                      ))}
                      <th className="px-5 py-4 text-center font-bold text-app-text bg-app-border/30">{t.board.total}</th>
                      <th className="px-5 py-4 text-center font-bold text-app-text bg-app-border/50">{t.board.average}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-app-border/70">
                    {rankedParticipants.map((p, idx) => {
                      const pScores = phaseScores[p.id] || {};
                      const vals = judges.map(j => pScores[j]).filter(v => v !== null && v !== undefined);
                      const total = vals.reduce((sum, v) => sum + v, 0);
                      const avg = vals.length > 0 ? total / vals.length : 0;
                      const isQualified = qualifiedIds.has(p.id);
                      const showElimLine = selectedPhase?.cutoff && idx === selectedPhase.cutoff;

                      return (
                        <Fragment key={p.id}>
                          {showElimLine && (
                            <tr className="bg-red-500/10 border-y border-red-500/30">
                              <td colSpan={judges.length + 4} className="py-2 px-4 text-[9px] font-bold text-red-100 uppercase tracking-[0.2em] text-center">
                                {t.board.cutoffLine}
                              </td>
                            </tr>
                          )}
                          <tr className={`transition-colors ${isQualified ? 'bg-app-card hover:bg-app-border/30' : 'opacity-40 grayscale-[50%]'}`} style={!isQualified ? { backgroundColor: 'var(--color-app-danger-soft)' } : undefined}>
                            <td className="px-4 py-4 text-center text-sm font-medium text-app-muted/70">
                              {idx + 1}
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-3">
                                <span className="text-xl">{p.flag}</span>
                                <span className={`text-sm font-semibold ${isQualified ? 'text-app-text' : 'text-app-muted'}`}>
                                  {p.name}
                                </span>
                              </div>
                            </td>
                            {judges.map(judge => {
                              const val = pScores[judge];
                              return (
                                <td key={judge} className="px-4 py-4 text-center text-sm font-mono text-app-muted">
                                  {val !== undefined && val !== null ? val.toFixed(2) : '-'}
                                </td>
                              );
                            })}
                            <td className="px-4 py-4 text-center text-sm font-mono font-semibold text-app-text bg-app-border/10">
                              {total.toFixed(2)}
                            </td>
                            <td className={`px-4 py-4 text-center text-sm font-mono font-bold bg-app-border/30 ${isQualified ? 'text-app-text' : 'text-app-muted'}`}>
                              {avg.toFixed(2)}
                            </td>
                          </tr>
                        </Fragment>
                      );
                    })}
                    {rankedParticipants.length === 0 && (
                      <tr>
                        <td colSpan={judges.length + 4} className="px-4 py-12 text-center text-app-muted/70 text-sm">
                          {t.board.noParticipantsInPhase}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
            
            
            <div className="mt-6 text-center">
              <p className="text-[10px] text-app-muted/50 uppercase tracking-widest font-mono">
                © {new Date().getFullYear()} Pageants
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
