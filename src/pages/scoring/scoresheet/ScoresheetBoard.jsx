import { Link, useParams } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { arrayRemove, arrayUnion, deleteField, onSnapshot, updateDoc } from 'firebase/firestore';
import { toPng } from 'html-to-image';
import {
  AlertTriangle, ArrowDownWideNarrow, Award, Camera, Check, Crown, Download, Link2, Loader2, Moon, Plus, Send, Sun, Trash2, UserPlus, X
} from 'lucide-react';
import ScoringLanguageToggle from '../ScoringLanguageToggle';
import { getStoredScoringLanguage, normalizeScoringLanguage, persistScoringLanguage } from '../scoringI18n';
import {
  getScoringBodyBackground,
  getScoringThemeStyleVars,
  getStoredScoringAccent,
  getStoredScoringTheme,
  persistScoringAccent,
  persistScoringTheme,
  SCORING_ACCENTS
} from '../scoringTheme';
import { scoresheetCopy } from './scoresheetI18n';
import {
  buildAdvancedPhase,
  computePhaseStats,
  formatScore,
  formatTotal,
  hasDelegate,
  makeEmptyRow,
  makeId,
  makePhase,
  MAX_JUDGES,
  parseScoreInput,
  phaseHasData,
  phaseToCsv,
  scoresheetRef,
  sortedRowOrder
} from './scoresheetModel';

// Spreadsheet-style cell: keeps a local draft while focused so live updates from
// other editors never overwrite what this person is typing, and commits on blur.
function GridCell({ value, kind = 'text', row, col, placeholder, align = 'left', invalidLabel, onCommit, onNavigate, onPasteGrid }) {
  const [draft, setDraft] = useState(null);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    if (!invalid) return undefined;
    const timer = setTimeout(() => setInvalid(false), 1600);
    return () => clearTimeout(timer);
  }, [invalid]);

  const commit = () => {
    if (draft === null) return;
    const next = draft;
    setDraft(null);
    if (next === value) return;
    if (kind === 'score' && Number.isNaN(parseScoreInput(next))) {
      setInvalid(true);
      return;
    }
    onCommit(next);
  };

  const handleKeyDown = event => {
    if (event.key === 'Enter' || event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      commit();
      const step = event.key === 'ArrowUp' || (event.key === 'Enter' && event.shiftKey) ? -1 : 1;
      onNavigate(row + step, col);
    } else if (event.key === 'Escape') {
      setDraft(null);
      event.currentTarget.blur();
    }
  };

  const handlePaste = event => {
    const text = event.clipboardData.getData('text/plain');
    if (!/[\t\n]/.test(text.replace(/\r?\n$/, ''))) return;
    event.preventDefault();
    const matrix = text.replace(/\r/g, '').replace(/\n$/, '').split('\n').map(line => line.split('\t'));
    setDraft(null);
    onPasteGrid(row, col, matrix);
  };

  return (
    <input
      type="text"
      inputMode={kind === 'score' ? 'decimal' : 'text'}
      data-row={row}
      data-col={col}
      value={draft ?? value}
      placeholder={placeholder}
      title={invalid ? invalidLabel : undefined}
      onFocus={event => event.target.select()}
      onChange={event => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      className={`w-full h-9 bg-transparent px-2 text-sm text-app-text outline-none placeholder:text-app-muted/40 focus:bg-app-accent/10 focus:ring-2 focus:ring-inset focus:ring-app-accent/60 ${
        align === 'right' ? 'text-right tabular-nums' : ''
      } ${invalid ? 'ring-2 ring-inset ring-red-500/70 bg-red-500/10' : ''}`}
    />
  );
}

// Plain input that commits on blur / Enter (titles, headers, award fields).
function InlineInput({ value, onCommit, className, placeholder, ariaLabel }) {
  const [draft, setDraft] = useState(null);
  const commit = () => {
    if (draft === null) return;
    const next = draft.trim();
    setDraft(null);
    if (next !== value) onCommit(next);
  };
  return (
    <input
      type="text"
      value={draft ?? value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={event => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={event => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') { setDraft(null); event.currentTarget.blur(); }
      }}
      className={className}
    />
  );
}

function Dialog({ title, children, onCancel, onConfirm, confirmLabel, cancelLabel, danger = false }) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onCancel}>
      <div className="scoring-panel w-full max-w-md rounded-2xl p-5" onClick={event => event.stopPropagation()}>
        <h3 className="text-base font-bold text-app-text">{title}</h3>
        <div className="mt-3 text-sm text-app-muted">{children}</div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="scoring-btn-secondary rounded-lg h-10 px-4 text-xs font-bold uppercase tracking-widest">
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`${danger ? 'scoring-btn-danger' : 'scoring-btn-primary'} rounded-lg h-10 px-4 text-xs font-bold uppercase tracking-widest`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// Static, input-free rendering of one tab used for PNG export. It sits inside the
// themed root, so it picks up the viewer's light/dark theme and accent colour.
function ExportCard({ exportRef, sheet, phase, judgeOrder, stats, t, hideJudgeNames }) {
  const rows = [
    ...stats.rankedOrder,
    ...stats.rowOrder.filter(rowId => !stats.rankedOrder.includes(rowId) && hasDelegate(phase.rows[rowId]))
  ];
  const awards = (phase.awards || []).filter(award => award.label || award.value);
  return (
    <div
      ref={exportRef}
      className="fixed top-0 left-[-100000px] w-max min-w-[720px] bg-app-bg text-app-text font-sans p-8"
      aria-hidden="true"
    >
      <div className="flex items-end justify-between gap-8 border-b-2 border-app-accent pb-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-app-accent">{sheet.title}</p>
          <h1 className="mt-1 text-4xl font-black uppercase tracking-tight">{phase.name}</h1>
        </div>
        <Crown className="w-8 h-8 text-app-accent" />
      </div>

      <table className="mt-5 w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr className="text-[10px] font-bold uppercase tracking-[0.14em] text-app-muted">
            <th className="px-3 py-2 text-center border-b border-app-border">{t.colRank}</th>
            <th className="px-3 py-2 text-left border-b border-app-border">{t.colDelegates}</th>
            {judgeOrder.map((judgeId, judgeIndex) => (
              <th key={judgeId} className="px-3 py-2 text-right border-b border-app-border">{hideJudgeNames ? t.anonymousJudge(judgeIndex + 1) : sheet.judges[judgeId]}</th>
            ))}
            <th className="px-3 py-2 text-right border-b border-app-border">{t.colTotal}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(rowId => {
            const row = phase.rows[rowId];
            const rank = stats.ranks[rowId];
            const isQualified = stats.qualified.has(rowId);
            return (
              <tr key={rowId} className={isQualified ? 'bg-app-accent/10' : ''}>
                <td className={`px-3 py-2 text-center font-black tabular-nums border-b border-app-border/60 ${isQualified ? 'text-app-accent' : 'text-app-muted'}`}>
                  {rank ?? '—'}
                </td>
                <td className="px-3 py-2 font-semibold border-b border-app-border/60">
                  <span className="inline-flex items-center gap-2">
                    {isQualified && <span className="w-1.5 h-4 rounded-full bg-app-accent" />}
                    {row.delegate}
                  </span>
                </td>
                {judgeOrder.map(judgeId => (
                  <td key={judgeId} className="px-3 py-2 text-right tabular-nums text-app-muted border-b border-app-border/60">
                    {formatScore(row.scores?.[judgeId])}
                  </td>
                ))}
                <td className={`px-3 py-2 text-right font-bold tabular-nums border-b border-app-border/60 ${isQualified ? 'text-app-accent' : ''}`}>
                  {rank !== undefined ? formatTotal(stats.totals[rowId]) : ''}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {awards.length > 0 && (
        <div className="mt-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-app-muted">{t.awardsTitle}</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {awards.map(award => (
              <div key={award.id} className="rounded-lg border border-app-border px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-app-accent">{award.label}</p>
                <p className="text-sm font-semibold">{award.value || '—'}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ScoresheetBoard() {
  const { sheetId } = useParams();
  const sheetDoc = useMemo(() => scoresheetRef(sheetId), [sheetId]);
  const [sheet, setSheet] = useState(null);
  const [loadState, setLoadState] = useState('loading');
  const [hasPendingWrites, setHasPendingWrites] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [writeError, setWriteError] = useState('');
  const [activePhaseId, setActivePhaseId] = useState(null);
  const [theme, setTheme] = useState(getStoredScoringTheme());
  const [accentColor, setAccentColor] = useState(getStoredScoringAccent());
  const [isExporting, setIsExporting] = useState(false);
  const [hideJudgeNames, setHideJudgeNames] = useState(() => {
    try { return localStorage.getItem('pageants-scoresheet-hide-judges') !== '0'; } catch { return true; }
  });
  const exportRef = useRef(null);
  const [language, setLanguage] = useState(getStoredScoringLanguage());
  const [linkCopied, setLinkCopied] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [qualifyDraft, setQualifyDraft] = useState(null);
  const gridRef = useRef(null);
  const pendingFocusRef = useRef(null);
  const t = scoresheetCopy[normalizeScoringLanguage(language)];

  useEffect(() => {
    document.body.style.background = getScoringBodyBackground(theme);
  }, [theme]);

  useEffect(() => {
    persistScoringLanguage(language);
  }, [language]);

  useEffect(() => {
    document.title = sheet?.title ? `${sheet.title} · ${t.pageTitle}` : t.pageTitle;
  }, [sheet?.title, t]);

  useEffect(() => {
    setLoadState('loading');
    const unsubscribe = onSnapshot(
      sheetDoc,
      { includeMetadataChanges: true },
      snapshot => {
        setHasPendingWrites(snapshot.metadata.hasPendingWrites);
        setFromCache(snapshot.metadata.fromCache);
        if (!snapshot.exists()) {
          if (!snapshot.metadata.fromCache) setLoadState('missing');
          return;
        }
        setSheet(snapshot.data());
        setLoadState('ready');
      },
      error => {
        console.error(error);
        setLoadState('error');
      }
    );
    return unsubscribe;
  }, [sheetDoc]);

  const phaseOrder = useMemo(
    () => (sheet?.phaseOrder || []).filter(phaseId => sheet?.phases?.[phaseId]),
    [sheet]
  );
  const judgeOrder = useMemo(
    () => (sheet?.judgeOrder || []).filter(judgeId => sheet?.judges?.[judgeId] !== undefined),
    [sheet]
  );
  const phaseId = activePhaseId && phaseOrder.includes(activePhaseId) ? activePhaseId : phaseOrder[0];
  const phase = phaseId ? sheet?.phases?.[phaseId] : null;
  const stats = useMemo(() => (phase ? computePhaseStats(phase, judgeOrder) : null), [phase, judgeOrder]);
  const nextPhaseId = phaseOrder[phaseOrder.indexOf(phaseId) + 1] || null;
  const nextPhase = nextPhaseId ? sheet.phases[nextPhaseId] : null;
  const colKeys = useMemo(() => ['delegate', ...judgeOrder, 'comment'], [judgeOrder]);

  useEffect(() => {
    setQualifyDraft(null);
  }, [phaseId]);

  const lastLocalEditRef = useRef(0);

  const write = useCallback(updates => {
    setWriteError('');
    lastLocalEditRef.current = Date.now();
    return updateDoc(sheetDoc, { ...updates, updatedAt: Date.now() }).catch(error => {
      console.error(error);
      setWriteError(String(error?.code || error?.message || 'write-failed'));
    });
  }, [sheetDoc]);

  const focusCell = useCallback((row, col) => {
    const target = gridRef.current?.querySelector(`input[data-row="${row}"][data-col="${col}"]`);
    if (target) target.focus();
  }, []);

  // Once every delegate has a score from every judge, sort the tab by rank. Only the
  // client that just edited writes the new order, so editors don't all race to sort.
  useEffect(() => {
    if (!phase || !stats || !judgeOrder.length) return undefined;
    const named = stats.rowOrder.filter(rowId => hasDelegate(phase.rows[rowId]));
    if (!named.length) return undefined;
    const complete = named.every(rowId => judgeOrder.every(judgeId => Number.isFinite(phase.rows[rowId].scores?.[judgeId])));
    if (!complete || Date.now() - lastLocalEditRef.current > 4000) return undefined;
    const target = sortedRowOrder(phase, judgeOrder);
    if (target.join() === stats.rowOrder.join()) return undefined;
    const timer = setTimeout(() => write({ [`phases.${phaseId}.rowOrder`]: target }), 700);
    return () => clearTimeout(timer);
  }, [phase, stats, judgeOrder, phaseId, write]);

  // Focus the delegate cell of a row this person just added, once it arrives.
  useEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending || !stats) return;
    const index = stats.rowOrder.indexOf(pending.rowId);
    if (index === -1) return;
    pendingFocusRef.current = null;
    requestAnimationFrame(() => focusCell(index, pending.col));
  }, [stats, focusCell]);

  const rowPath = rowId => `phases.${phaseId}.rows.${rowId}`;

  const cellValue = (row, key) => {
    if (key === 'delegate') return row.delegate || '';
    if (key === 'comment') return row.comment || '';
    return formatScore(row.scores?.[key]);
  };

  const commitCell = (rowId, key, raw) => {
    if (key === 'delegate' || key === 'comment') {
      write({ [`${rowPath(rowId)}.${key}`]: raw.trim() });
      return;
    }
    const score = parseScoreInput(raw);
    write({ [`${rowPath(rowId)}.scores.${key}`]: score === null ? deleteField() : score });
  };

  const handlePasteGrid = (startRow, startCol, matrix) => {
    const updates = {};
    const newRowIds = [];
    matrix.forEach((line, lineIndex) => {
      const rowIndex = startRow + lineIndex;
      let rowId = stats.rowOrder[rowIndex];
      const isNew = !rowId;
      const newRow = makeEmptyRow();
      if (isNew) {
        rowId = makeId('r');
        newRowIds.push(rowId);
      }
      line.forEach((raw, cellIndex) => {
        const key = colKeys[startCol + cellIndex];
        if (!key) return;
        if (key === 'delegate' || key === 'comment') {
          if (isNew) newRow[key] = raw.trim();
          else updates[`${rowPath(rowId)}.${key}`] = raw.trim();
          return;
        }
        const score = parseScoreInput(raw);
        if (Number.isNaN(score)) return;
        if (isNew) {
          if (score !== null) newRow.scores[key] = score;
        } else {
          updates[`${rowPath(rowId)}.scores.${key}`] = score === null ? deleteField() : score;
        }
      });
      if (isNew) updates[rowPath(rowId)] = newRow;
    });
    if (newRowIds.length) updates[`phases.${phaseId}.rowOrder`] = arrayUnion(...newRowIds);
    write(updates);
  };

  const addRow = () => {
    const rowId = makeId('r');
    pendingFocusRef.current = { rowId, col: 0 };
    write({
      [rowPath(rowId)]: makeEmptyRow(),
      [`phases.${phaseId}.rowOrder`]: arrayUnion(rowId)
    });
  };

  const removeRow = rowId => {
    const name = phase.rows[rowId]?.delegate || '';
    setDialog({
      title: t.removeRow,
      body: t.removeRowConfirm(name),
      danger: true,
      confirmLabel: t.confirm,
      onConfirm: () => write({
        [rowPath(rowId)]: deleteField(),
        [`phases.${phaseId}.rowOrder`]: arrayRemove(rowId)
      })
    });
  };

  const addJudge = () => {
    if (judgeOrder.length >= MAX_JUDGES) return;
    const judgeId = makeId('j');
    write({
      [`judges.${judgeId}`]: `JUDGE ${judgeOrder.length + 1}`,
      judgeOrder: arrayUnion(judgeId)
    });
  };

  const removeJudge = judgeId => {
    setDialog({
      title: sheet.judges[judgeId],
      body: t.removeJudgeConfirm(sheet.judges[judgeId]),
      danger: true,
      confirmLabel: t.confirm,
      onConfirm: () => write({
        [`judges.${judgeId}`]: deleteField(),
        judgeOrder: arrayRemove(judgeId)
      })
    });
  };

  const addPhase = () => {
    const newPhaseId = makeId('p');
    write({
      [`phases.${newPhaseId}`]: makePhase(t.newPhaseName(phaseOrder.length + 1)),
      phaseOrder: arrayUnion(newPhaseId)
    });
    setActivePhaseId(newPhaseId);
  };

  const removePhase = () => {
    if (phaseOrder.length <= 1) {
      setWriteError(t.lastPhaseError);
      return;
    }
    const removedId = phaseId;
    setDialog({
      title: t.deletePhase,
      body: t.deletePhaseConfirm(phase.name),
      danger: true,
      confirmLabel: t.confirm,
      onConfirm: () => {
        setActivePhaseId(phaseOrder.find(id => id !== removedId));
        write({ [`phases.${removedId}`]: deleteField(), phaseOrder: arrayRemove(removedId) });
      }
    });
  };

  const sortByRank = () => {
    write({ [`phases.${phaseId}.rowOrder`]: sortedRowOrder(phase, judgeOrder) });
  };

  const commitQualifyCount = () => {
    if (qualifyDraft === null) return;
    const count = Math.max(0, Math.floor(Number(qualifyDraft) || 0));
    setQualifyDraft(null);
    if (count !== stats.qualifyCount) write({ [`phases.${phaseId}.qualifyCount`]: count });
  };

  const tieNames = stats?.cutoffTie?.map(rowId => phase.rows[rowId].delegate).join(', ');
  const qualifierNames = stats ? stats.rankedOrder.filter(rowId => stats.qualified.has(rowId)).map(rowId => phase.rows[rowId].delegate.trim()) : [];

  const openAdvanceDialog = () => {
    if (!nextPhase || !qualifierNames.length) return;
    const targetId = nextPhaseId;
    const names = qualifierNames;
    setDialog({
      title: t.advanceTitle(nextPhase.name),
      body: (
        <>
          <p>{t.advanceBody(names.length, nextPhase.name)}</p>
          <ol className="mt-3 max-h-56 overflow-auto rounded-lg border border-app-border/70 divide-y divide-app-border/50">
            {names.map((name, index) => (
              <li key={`${name}-${index}`} className="flex items-center gap-3 px-3 py-1.5 text-app-text">
                <span className="w-6 text-right text-xs tabular-nums text-app-muted">{index + 1}</span>
                <span className="truncate">{name}</span>
              </li>
            ))}
          </ol>
          {tieNames && (
            <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {t.cutoffTie(tieNames)}
            </p>
          )}
          {phaseHasData(nextPhase) && (
            <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {t.advanceOverwrite(nextPhase.name)}
            </p>
          )}
        </>
      ),
      confirmLabel: t.advanceConfirm,
      onConfirm: () => {
        write({ [`phases.${targetId}`]: buildAdvancedPhase(sheet.phases[targetId], names) });
        setActivePhaseId(targetId);
      }
    });
  };

  const updateAwards = nextAwards => write({ [`phases.${phaseId}.awards`]: nextAwards });

  const copyLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt(t.copyLink, url);
    }
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 1800);
  };

  const downloadCsv = () => {
    const blob = new Blob([`﻿${phaseToCsv(sheet, phaseId)}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${sheet.title || sheetId} - ${phase.name}.csv`.replace(/[\\/:*?"<>|]/g, '');
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportImage = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      // Let the export card render before capturing it.
      await new Promise(resolve => setTimeout(resolve, 60));
      const node = exportRef.current;
      if (!node) return;
      const dataUrl = await toPng(node, {
        cacheBust: true,
        pixelRatio: 2,
        skipFonts: true,
        backgroundColor: getScoringBodyBackground(theme),
        style: { position: 'static', left: 'auto', top: 'auto' }
      });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${sheet.title || sheetId} - ${phase.name}.png`.replace(/[\\/:*?"<>|]/g, '');
      link.click();
    } catch (error) {
      console.error('Failed to export image', error);
      setWriteError(t.exportError);
    } finally {
      setIsExporting(false);
    }
  };

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    persistScoringTheme(nextTheme);
  };

  const rootClass = `theme-scoring-${theme} min-h-screen bg-app-bg text-app-text font-sans`;
  const rootStyle = getScoringThemeStyleVars(accentColor, theme);

  if (loadState !== 'ready' || !sheet || !phase) {
    const message = loadState === 'missing' ? t.notFound : loadState === 'error' ? t.connectionError : t.loading;
    return (
      <div className={`${rootClass} flex flex-col items-center justify-center gap-4 p-6`} style={rootStyle}>
        {loadState === 'loading' ? <Loader2 className="w-6 h-6 animate-spin text-app-muted" /> : <AlertTriangle className="w-6 h-6 text-app-muted" />}
        <p className="text-sm text-app-muted">{message}</p>
        {loadState !== 'loading' && (
          <Link to="/" className="scoring-btn-secondary rounded-lg h-10 px-4 inline-flex items-center text-xs font-bold uppercase tracking-widest no-underline">
            {t.backHome}
          </Link>
        )}
      </div>
    );
  }

  const syncLabel = hasPendingWrites ? (fromCache ? t.offline : t.saving) : t.saved;
  const qualifyValue = qualifyDraft ?? String(stats.qualifyCount);
  // Draw the cutoff line only when the rows are actually in rank order.
  const sortedPrefix = stats.rowOrder.slice(0, stats.qualified.size).every(rowId => stats.qualified.has(rowId));
  const cutoffRowId = stats.qualified.size > 0 && sortedPrefix ? stats.rowOrder[stats.qualified.size - 1] : null;
  const delegateCount = stats.rowOrder.filter(rowId => hasDelegate(phase.rows[rowId])).length;
  const awards = phase.awards || [];

  return (
    <div className={`${rootClass} flex flex-col`} style={rootStyle}>
      <header className="sticky top-0 z-40 border-b border-app-border/70 bg-app-card/90 backdrop-blur-md">
        <div className="flex items-center gap-3 px-4 py-2.5">
          <Link to="/" className="shrink-0 inline-flex items-center gap-2 text-app-muted hover:text-app-text no-underline" title={t.backHome}>
            <Crown className="w-5 h-5 text-app-accent" />
          </Link>
          <InlineInput
            value={sheet.title || ''}
            placeholder={t.titlePlaceholder}
            ariaLabel={t.titlePlaceholder}
            onCommit={title => write({ title })}
            className="min-w-0 flex-1 bg-transparent text-base md:text-lg font-bold tracking-tight text-app-text outline-none rounded-md px-2 py-1 hover:bg-app-text/5 focus:bg-app-text/5"
          />
          <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] text-app-muted" title={writeError || syncLabel}>
            {writeError ? (
              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
            ) : hasPendingWrites ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5 text-emerald-500" />
            )}
            {writeError ? '!' : syncLabel}
          </span>
          <span className="hidden md:inline-flex rounded-full border border-app-border/70 px-2.5 py-1 font-mono text-[11px] tracking-widest text-app-muted">
            {sheetId}
          </span>
          <button
            type="button"
            onClick={copyLink}
            title={t.shareHint}
            className="scoring-btn-primary shrink-0 inline-flex items-center gap-1.5 rounded-lg h-9 px-3 text-[11px] font-bold uppercase tracking-widest"
          >
            {linkCopied ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{linkCopied ? t.linkCopied : t.copyLink}</span>
          </button>
          <div className="shrink-0 flex items-center gap-1.5 rounded-full border border-app-border/60 bg-app-card/60 px-2.5 h-9">
            {SCORING_ACCENTS.map(accent => {
              const displayColor = theme === 'light' && accent.key === 'white' ? '#0f172a' : accent.color;
              const selected = accentColor === accent.color;
              return (
                <button
                  key={accent.key}
                  type="button"
                  onClick={() => { setAccentColor(accent.color); persistScoringAccent(accent.color); }}
                  aria-label={accent.key}
                  aria-pressed={selected}
                  className={`w-3.5 h-3.5 rounded-full border transition-all ${selected ? 'scale-125 border-app-text' : 'border-transparent opacity-50 hover:opacity-100'}`}
                  style={{ backgroundColor: displayColor }}
                />
              );
            })}
          </div>
          <div className="hidden xl:block">
            <ScoringLanguageToggle language={language} label="" onChange={setLanguage} />
          </div>
          <button type="button" onClick={toggleTheme} className="scoring-btn-icon shrink-0 w-9 h-9 rounded-full inline-flex items-center justify-center">
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
        {writeError && (
          <div className="border-t border-red-500/30 bg-red-500/10 px-4 py-1.5 text-xs text-red-400">{writeError}</div>
        )}
      </header>

      <main className="flex-1 px-3 md:px-5 pt-4 pb-24">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="flex items-center gap-1 mr-auto min-w-0">
            <InlineInput
              value={phase.name}
              ariaLabel={t.renamePhase}
              onCommit={name => name && write({ [`phases.${phaseId}.name`]: name })}
              className="min-w-0 w-48 md:w-64 bg-transparent text-xl md:text-2xl font-black tracking-tight uppercase text-app-text outline-none rounded-md px-2 py-0.5 hover:bg-app-text/5 focus:bg-app-text/5"
            />
            <span className="text-xs text-app-muted whitespace-nowrap">{t.rowsCount(delegateCount)}</span>
            <button type="button" onClick={removePhase} title={t.deletePhase} className="ml-1 p-1.5 rounded-md text-app-muted/60 hover:text-red-400 hover:bg-red-500/10">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          <button type="button" onClick={sortByRank} className="scoring-btn-secondary inline-flex items-center gap-1.5 rounded-lg h-9 px-3 text-[11px] font-bold uppercase tracking-widest">
            <ArrowDownWideNarrow className="w-4 h-4" />
            {t.sortByRank}
          </button>

          <div className="inline-flex items-stretch rounded-lg border border-app-border overflow-hidden h-9">
            <label className="flex items-center gap-2 pl-3 pr-1 text-[11px] font-bold uppercase tracking-widest text-app-muted bg-app-card/60">
              {t.qualifiedLabel}
              <input
                type="number"
                min="0"
                inputMode="numeric"
                value={qualifyValue}
                onChange={event => setQualifyDraft(event.target.value)}
                onBlur={commitQualifyCount}
                onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                className="w-12 h-7 rounded-md bg-app-text/5 text-center text-sm font-bold text-app-text outline-none focus:ring-2 focus:ring-app-accent/50 tabular-nums"
              />
            </label>
            <button
              type="button"
              onClick={openAdvanceDialog}
              disabled={!nextPhase || !qualifierNames.length}
              title={nextPhase ? undefined : t.noNextPhase}
              className="scoring-btn-primary !rounded-none inline-flex items-center gap-1.5 px-3 text-[11px] font-bold uppercase tracking-widest disabled:opacity-40 disabled:pointer-events-none"
            >
              <Send className="w-3.5 h-3.5" />
              {nextPhase ? t.sendTo(qualifierNames.length || stats.qualifyCount, nextPhase.name) : t.noNextPhase}
            </button>
          </div>

          <button type="button" onClick={addRow} className="scoring-btn-secondary inline-flex items-center gap-1.5 rounded-lg h-9 px-3 text-[11px] font-bold uppercase tracking-widest">
            <Plus className="w-4 h-4" />
            {t.addRow}
          </button>
          <button
            type="button"
            onClick={addJudge}
            disabled={judgeOrder.length >= MAX_JUDGES}
            className="scoring-btn-secondary inline-flex items-center gap-1.5 rounded-lg h-9 px-3 text-[11px] font-bold uppercase tracking-widest disabled:opacity-40"
          >
            <UserPlus className="w-4 h-4" />
            {t.addJudge}
          </button>
          <button type="button" onClick={downloadCsv} className="scoring-btn-secondary inline-flex items-center gap-1.5 rounded-lg h-9 px-3 text-[11px] font-bold uppercase tracking-widest">
            <Download className="w-4 h-4" />
            {t.downloadCsv}
          </button>
          <button
            type="button"
            onClick={exportImage}
            disabled={isExporting}
            className="scoring-btn-secondary inline-flex items-center gap-1.5 rounded-lg h-9 px-3 text-[11px] font-bold uppercase tracking-widest disabled:opacity-50"
          >
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
            {t.downloadImage}
          </button>
          <label className="inline-flex items-center gap-1.5 h-9 px-1 text-[11px] font-bold uppercase tracking-widest text-app-muted cursor-pointer" title={t.hideJudgesHint}>
            <input
              type="checkbox"
              checked={hideJudgeNames}
              onChange={event => {
                setHideJudgeNames(event.target.checked);
                try { localStorage.setItem('pageants-scoresheet-hide-judges', event.target.checked ? '1' : '0'); } catch { /* per-device preference only */ }
              }}
            />
            {t.hideJudges}
          </label>
        </div>

        {tieNames && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {t.cutoffTie(tieNames)}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_280px] gap-4 items-start">
          <div ref={gridRef} className="scoring-panel rounded-xl overflow-auto max-h-[calc(100vh-190px)]">
            <table className="border-separate border-spacing-0 text-sm min-w-full">
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-[0.14em] text-app-muted">
                  <th className="sticky top-0 left-0 z-30 w-14 min-w-14 bg-app-card border-b border-r border-app-border px-2 h-10 text-center">{t.colRank}</th>
                  <th className="sticky top-0 left-14 z-30 min-w-48 w-56 bg-app-card border-b border-r border-app-border px-2 text-left">{t.colDelegates}</th>
                  {judgeOrder.map((judgeId, index) => (
                    <th key={judgeId} className="group sticky top-0 z-20 min-w-24 w-24 bg-app-card border-b border-r border-app-border p-0">
                      <div className="flex items-center">
                        <InlineInput
                          value={sheet.judges[judgeId]}
                          ariaLabel={`Judge ${index + 1}`}
                          onCommit={name => write({ [`judges.${judgeId}`]: name || `JUDGE ${index + 1}` })}
                          className="w-full min-w-0 h-10 bg-transparent px-2 text-center text-[10px] font-bold uppercase tracking-[0.12em] text-app-muted outline-none focus:text-app-text focus:bg-app-accent/10"
                        />
                        <button
                          type="button"
                          onClick={() => removeJudge(judgeId)}
                          className="shrink-0 mr-1 p-0.5 rounded text-app-muted/0 group-hover:text-app-muted/70 hover:!text-red-400"
                          aria-label={`Remove ${sheet.judges[judgeId]}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </th>
                  ))}
                  <th className="sticky top-0 z-20 min-w-24 bg-app-card border-b border-r border-app-border px-2 text-right">{t.colTotal}</th>
                  <th className="sticky top-0 z-20 min-w-56 bg-app-card border-b border-r border-app-border px-2 text-left">{t.colComments}</th>
                  <th className="sticky top-0 z-20 w-9 bg-app-card border-b border-app-border" />
                </tr>
              </thead>
              <tbody>
                {stats.rowOrder.map((rowId, rowIndex) => {
                  const row = phase.rows[rowId];
                  const rank = stats.ranks[rowId];
                  const isQualified = stats.qualified.has(rowId);
                  const isCutoff = rowId === cutoffRowId;
                  const cellBorder = isCutoff ? 'border-b-2 border-b-app-accent' : 'border-b border-app-border/60';
                  return (
                    <tr key={rowId} className={`group ${isQualified ? 'bg-app-accent/[0.06]' : ''} hover:bg-app-text/[0.03]`}>
                      <td className={`sticky left-0 z-10 bg-app-card ${cellBorder} border-r border-r-app-border/60 p-0 text-center`}>
                        <div className={`relative h-9 flex items-center justify-center text-sm font-bold tabular-nums ${isQualified ? 'text-app-accent' : 'text-app-muted'}`}>
                          {isQualified && <span className="absolute left-0 top-1 bottom-1 w-1 rounded-r bg-app-accent" title={t.qualifiedBadge} />}
                          {rank ?? ''}
                        </div>
                      </td>
                      <td className={`sticky left-14 z-10 bg-app-card ${cellBorder} border-r border-r-app-border/60 p-0 font-semibold`}>
                        <GridCell
                          value={cellValue(row, 'delegate')}
                          row={rowIndex}
                          col={0}
                          placeholder={t.delegatePlaceholder}
                          onCommit={raw => commitCell(rowId, 'delegate', raw)}
                          onNavigate={focusCell}
                          onPasteGrid={handlePasteGrid}
                        />
                      </td>
                      {judgeOrder.map((judgeId, judgeIndex) => (
                        <td key={judgeId} className={`${cellBorder} border-r border-r-app-border/60 p-0`}>
                          <GridCell
                            kind="score"
                            align="right"
                            value={cellValue(row, judgeId)}
                            row={rowIndex}
                            col={judgeIndex + 1}
                            invalidLabel={t.invalidScore}
                            onCommit={raw => commitCell(rowId, judgeId, raw)}
                            onNavigate={focusCell}
                            onPasteGrid={handlePasteGrid}
                          />
                        </td>
                      ))}
                      <td className={`${cellBorder} border-r border-r-app-border/60 px-2 text-right font-bold tabular-nums ${rank !== undefined ? 'text-app-text' : 'text-app-muted/40'}`}>
                        {rank !== undefined ? formatTotal(stats.totals[rowId]) : hasDelegate(row) ? '—' : ''}
                      </td>
                      <td className={`${cellBorder} border-r border-r-app-border/60 p-0`}>
                        <GridCell
                          value={cellValue(row, 'comment')}
                          row={rowIndex}
                          col={judgeOrder.length + 1}
                          onCommit={raw => commitCell(rowId, 'comment', raw)}
                          onNavigate={focusCell}
                          onPasteGrid={handlePasteGrid}
                        />
                      </td>
                      <td className={`${cellBorder} p-0 text-center`}>
                        <button
                          type="button"
                          onClick={() => removeRow(rowId)}
                          aria-label={t.removeRow}
                          className="p-1 rounded text-app-muted/0 group-hover:text-app-muted/60 hover:!text-red-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {stats.rowOrder.length === 0 && (
              <div className="px-6 py-12 text-center">
                <p className="text-sm font-semibold text-app-text">{t.emptyPhase}</p>
                <p className="mt-1 text-xs text-app-muted">{t.emptyPhaseHint}</p>
                <button type="button" onClick={addRow} className="mt-4 scoring-btn-secondary inline-flex items-center gap-1.5 rounded-lg h-9 px-3 text-[11px] font-bold uppercase tracking-widest">
                  <Plus className="w-4 h-4" />
                  {t.addRow}
                </button>
              </div>
            )}
          </div>

          <aside className="scoring-panel rounded-xl p-3">
            <div className="flex items-center gap-2 px-1 pb-2">
              <Award className="w-4 h-4 text-app-accent" />
              <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-app-muted">{t.awardsTitle}</h2>
            </div>
            <div className="space-y-2">
              {awards.map(award => (
                <div key={award.id} className="group rounded-lg border border-app-border/60 bg-app-card/40">
                  <div className="flex items-center">
                    <InlineInput
                      value={award.label}
                      placeholder={t.awardLabelPlaceholder}
                      ariaLabel={t.awardLabelPlaceholder}
                      onCommit={label => updateAwards(awards.map(item => item.id === award.id ? { ...item, label } : item))}
                      className="flex-1 min-w-0 bg-transparent px-2.5 pt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-app-muted outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => updateAwards(awards.filter(item => item.id !== award.id))}
                      className="mr-1.5 mt-1 p-0.5 rounded text-app-muted/0 group-hover:text-app-muted/60 hover:!text-red-400"
                      aria-label="Remove award"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <InlineInput
                    value={award.value}
                    placeholder={t.awardValuePlaceholder}
                    ariaLabel={award.label}
                    onCommit={value => updateAwards(awards.map(item => item.id === award.id ? { ...item, value } : item))}
                    className="w-full bg-transparent px-2.5 pb-2 pt-0.5 text-sm font-semibold text-app-text outline-none placeholder:text-app-muted/40"
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() => updateAwards([...awards, { id: makeId('a'), label: '', value: '' }])}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-app-border h-9 text-[11px] font-bold uppercase tracking-widest text-app-muted hover:text-app-text hover:border-app-accent/40"
              >
                <Plus className="w-3.5 h-3.5" />
                {t.addAward}
              </button>
            </div>
            <p className="mt-4 px-1 text-[11px] leading-relaxed text-app-muted/70">{t.pasteHint}</p>
            <p className="mt-2 px-1 text-[11px] leading-relaxed text-app-muted/70">{t.autoSortHint}</p>
          </aside>
        </div>
      </main>

      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-app-border/70 bg-app-card/95 backdrop-blur-md"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex items-stretch gap-1 overflow-x-auto px-2 py-1.5">
          {phaseOrder.map(id => {
            const tab = sheet.phases[id];
            const active = id === phaseId;
            const count = Object.values(tab.rows || {}).filter(hasDelegate).length;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActivePhaseId(id)}
                className={`shrink-0 inline-flex items-center gap-2 rounded-lg px-4 h-10 text-xs font-bold uppercase tracking-widest transition-colors ${
                  active ? 'bg-app-accent/15 text-app-accent ring-1 ring-inset ring-app-accent/40' : 'text-app-muted hover:text-app-text hover:bg-app-text/5'
                }`}
              >
                {tab.name}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${active ? 'bg-app-accent/20' : 'bg-app-text/10'}`}>{count}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={addPhase}
            title={t.addPhase}
            className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-lg text-app-muted hover:text-app-text hover:bg-app-text/5"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </nav>

      {isExporting && (
        <ExportCard exportRef={exportRef} sheet={sheet} phase={phase} judgeOrder={judgeOrder} stats={stats} t={t} hideJudgeNames={hideJudgeNames} />
      )}

      {dialog && (
        <Dialog
          title={dialog.title}
          danger={dialog.danger}
          confirmLabel={dialog.confirmLabel}
          cancelLabel={t.cancel}
          onCancel={() => setDialog(null)}
          onConfirm={() => { dialog.onConfirm(); setDialog(null); }}
        >
          {dialog.body}
        </Dialog>
      )}
    </div>
  );
}
