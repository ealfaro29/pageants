import { useEffect, useState, useRef, Fragment } from 'react';
import { X, Download, ImageIcon, Crown } from 'lucide-react';
import { toPng } from 'html-to-image';
import { scoringCopy } from './scoringI18n';
import { getScoringThemeStyleVars, getStoredScoringAccent } from './scoringTheme';

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
  winner,
  winnerResult,
  winnerPhaseName
}) {
  const [selectedPhaseIdx, setSelectedPhaseIdx] = useState(currentPhaseIndex);
  const [isExporting, setIsExporting] = useState(false);
  const [accentColor] = useState(getStoredScoringAccent());
  const reportRef = useRef(null);
  const t = scoringCopy[language] || scoringCopy['es'];
  const OVERALL_RESULTS_VIEW = -2;
  const WINNER_VIEW = -1;

  useEffect(() => {
    if (isOpen) {
      setSelectedPhaseIdx(currentPhaseIndex);
    }
  }, [currentPhaseIndex, isOpen]);

  if (!isOpen) return null;

  const judges = session?.judges || [];
  const allParticipants = session?.participants || [];
  const visiblePhases = phases.slice(0, currentPhaseIndex + 1);
  const isOverallView = selectedPhaseIdx === OVERALL_RESULTS_VIEW;
  const isWinnerView = selectedPhaseIdx === WINNER_VIEW;
  const selectedPhase = selectedPhaseIdx >= 0 ? phases[selectedPhaseIdx] : null;
  const participants = selectedPhaseIdx >= 0 ? getPhaseParticipants(selectedPhaseIdx) : [];
  const phaseKey = selectedPhaseIdx >= 0 ? `phase_${selectedPhaseIdx}` : null;
  const phaseScores = phaseKey ? (scores[phaseKey] || {}) : {};
  const rankedParticipants = rankParticipantsByPhaseScores(participants, phaseScores);
  const totalPossibleVotes = visiblePhases.length * judges.length;
  const overallResults = allParticipants
    .map(participant => {
      const phaseBreakdown = visiblePhases.map((phase, idx) => {
        const phaseParticipants = getPhaseParticipants(idx);
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

        const participantScores = scores[`phase_${idx}`]?.[participant.id] || {};
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
  const showTrackTotalAndAverage = judges.length > 1;
  const winnerOverallResult = winner ? overallResults.find(participant => participant.id === winner.id) : null;
  
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
          {phases.slice(0, currentPhaseIndex + 1).map((ph, idx) => (
            <button
              key={idx}
              onClick={() => setSelectedPhaseIdx(idx)}
              className={`px-5 py-4 text-sm font-medium rounded-lg whitespace-nowrap transition-colors mr-2 ${
                selectedPhaseIdx === idx
                  ? 'scoring-badge-active'
                  : 'text-app-muted/70 hover:text-app-text hover:bg-app-border/30'
              }`}
            >
              {ph.name}
            </button>
          ))}
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
          {session.status === 'completed' && winner && (
            <button
              onClick={() => setSelectedPhaseIdx(WINNER_VIEW)}
              className={`px-5 py-4 text-sm font-medium rounded-lg whitespace-nowrap transition-colors flex items-center gap-2 ${
                isWinnerView
                  ? 'border border-amber-400/30 bg-amber-400/10 text-amber-500'
                  : 'text-amber-600/80 hover:text-amber-600 hover:bg-amber-400/10'
              }`}
            >
              <Crown className="w-4 h-4" /> {t.board.officialWinnerTab}
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

            {/* Table or Winner Card */}
            {isWinnerView ? (
              <div className="scoring-winner-stage relative flex min-h-[620px] items-center justify-center overflow-hidden rounded-[2rem] border border-app-accent/25 p-10 text-center">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_15%,rgba(255,255,255,0.08),transparent_22%),radial-gradient(circle_at_80%_18%,var(--color-app-accent-muted),transparent_28%),radial-gradient(circle_at_50%_88%,rgba(255,255,255,0.06),transparent_22%)] opacity-95" />
                <div className="relative z-10 flex w-full max-w-3xl flex-col items-center">
                  <div className="mb-7 flex h-28 w-28 items-center justify-center rounded-full border border-app-accent/25 bg-app-accent/15 text-app-accent shadow-[0_0_55px_var(--color-app-accent-muted)]">
                    <Crown className="h-14 w-14" />
                  </div>
                  <p className="text-xs uppercase tracking-[0.45em] text-app-accent opacity-80">{t.board.winnerTitle}</p>
                  <h2 className="mt-4 text-5xl font-black tracking-tight text-app-text md:text-7xl drop-shadow-[0_0_18px_var(--color-app-accent-muted)]">{winner?.flag} {winner?.name || t.board.winnerPending}</h2>
                  <p className="mt-4 text-lg text-app-muted font-semibold tracking-wide">{t.board.winnerSubtitle}</p>
                  {winnerOverallResult?.phaseBreakdown?.length > 0 && (
                    <div className="mt-8 w-full max-w-3xl rounded-2xl border border-app-accent/20 bg-app-card/55 px-5 py-5 text-left">
                      <p className="text-[10px] uppercase tracking-[0.3em] text-app-muted/70 font-bold mb-3 text-center">{t.board.fullRatingsLabel || 'Full ratings'}</p>
                      <div className="overflow-hidden rounded-xl border border-app-border/60">
                        <div className={`grid ${showTrackTotalAndAverage ? 'grid-cols-[1fr_auto_auto]' : 'grid-cols-[1fr_auto]'} bg-app-border/30 text-[10px] uppercase tracking-[0.2em] text-app-muted/70 font-bold`}>
                          <div className="px-3 py-2 text-left">{t.board.phaseNamePlaceholder}</div>
                          {showTrackTotalAndAverage && <div className="px-3 py-2 text-right">{t.board.total}</div>}
                          <div className="px-3 py-2 text-right">{t.board.average}</div>
                        </div>
                        {winnerOverallResult.phaseBreakdown.map((phaseResult, idx) => (
                          <div key={`${phaseResult.phaseName}-${idx}`} className={`grid ${showTrackTotalAndAverage ? 'grid-cols-[1fr_auto_auto]' : 'grid-cols-[1fr_auto]'} border-t border-app-border/50 bg-app-card/35`}>
                            <div className="px-3 py-2.5 text-xs text-app-muted/90 uppercase tracking-wider">{phaseResult.phaseName}</div>
                            {showTrackTotalAndAverage && <div className="px-3 py-2.5 text-sm text-right font-mono font-semibold text-app-text">{phaseResult.participated ? phaseResult.total.toFixed(2) : '0.00'}</div>}
                            <div className="px-3 py-2.5 text-sm text-right font-mono font-bold text-app-text">{phaseResult.participated ? phaseResult.avg.toFixed(2) : '0.00'}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {winnerOverallResult && (
                    <div className="mt-8 grid w-full max-w-3xl grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="glass-panel px-6 py-6 rounded-2xl border-app-accent/25">
                        <p className="text-[10px] uppercase tracking-[0.3em] text-app-muted/70 font-bold mb-3">{t.board.overallAverage}</p>
                        <p className="text-5xl font-mono text-app-accent font-black tracking-tighter">{winnerOverallResult.overallAverage.toFixed(2)}</p>
                      </div>
                      <div className="glass-panel px-6 py-6 rounded-2xl border-app-accent/25">
                        <p className="text-[10px] uppercase tracking-[0.3em] text-app-muted/70 font-bold mb-3">{t.board.overallTotal}</p>
                        <p className="text-5xl font-mono text-app-accent font-black tracking-tighter">{winnerOverallResult.overallTotal.toFixed(2)}</p>
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
                      {visiblePhases.map((phase, idx) => (
                        <th key={`${phase.name}-${idx}`} className="px-5 py-4 text-center font-semibold whitespace-nowrap">
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
