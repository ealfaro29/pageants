import { useState, useEffect, useRef, Fragment } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { db } from '../../core/firebase-config.js';
import { doc, onSnapshot, setDoc, updateDoc, arrayUnion, deleteField } from 'firebase/firestore';
import { Copy, Check, Search, Plus, X, ChevronRight, Globe, MapPin, AlertTriangle, Crown, BarChart3, Sun, Moon, RotateCcw, Settings2, LogOut, ClipboardList, Trophy, Settings, UserCheck, UserX, ExternalLink, Link2, Lock } from 'lucide-react';
import {
  getCountryDisplayName,
  getDefaultPhaseName,
  getSessionTypeLabel,
  getStoredScoringLanguage,
  normalizeScoringLanguage,
  persistScoringLanguage,
  scoringCopy
} from './scoringI18n';
import PhaseReportModal from './PhaseReportModal';
import SessionSettingsModal from './SessionSettingsModal';
import {
  getScoringBodyBackground,
  getScoringThemeStyleVars,
  getStoredScoringAccent,
  getStoredScoringTheme,
  persistScoringTheme
} from './scoringTheme';
import { buildNumberedParticipant } from './participantUtils';
import { isTotalScoringMode } from './scoringMode';

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

      return {
        ...participant,
        avg,
        voteCount: values.length
      };
    })
    .sort((a, b) => b.avg - a.avg || a.name.localeCompare(b.name));
}

function normalizeJudgeIdentity(value) {
  return String(value || '').trim().toLowerCase();
}

function judgeListIncludes(list, judgeName) {
  const normalizedJudge = normalizeJudgeIdentity(judgeName);
  return Array.isArray(list) && list.some(entry => normalizeJudgeIdentity(entry) === normalizedJudge);
}

function getParticipantScoreStatsByPhases(participantId, phaseIndexes, scoreMap) {
  let total = 0;
  let votes = 0;

  phaseIndexes.forEach(phaseIdx => {
    const participantScores = scoreMap[`phase_${phaseIdx}`]?.[participantId] || {};
    const values = Object.values(participantScores).filter(value => value !== null && value !== undefined);
    total += values.reduce((sum, value) => sum + value, 0);
    votes += values.length;
  });

  return {
    total,
    votes,
    average: votes > 0 ? total / votes : 0
  };
}

export default function SessionBoard() {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prev = { htmlP: html.style.padding, bodyP: body.style.padding, bodyO: body.style.overflow, bodyBg: body.style.background };
    html.style.padding = '0';
    body.style.padding = '0';
    body.style.overflow = 'hidden';
    return () => {
      html.style.padding = prev.htmlP;
      body.style.padding = prev.bodyP;
      body.style.overflow = prev.bodyO;
      body.style.background = prev.bodyBg;
    };
  }, []);

  const { sessionId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const judgeName = searchParams.get('judge');

  const [session, setSession] = useState(null);
  const [scores, setScores] = useState({});
  const [codeCopied, setCodeCopied] = useState(false);
  const [resultsLinkCopied, setResultsLinkCopied] = useState(false);
  const [forceAttempted, setForceAttempted] = useState(false);
  const [undoAttempted, setUndoAttempted] = useState(false);
  const [scoreDrafts, setScoreDrafts] = useState({});
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [theme, setTheme] = useState(getStoredScoringTheme());
  const [accentColor] = useState(getStoredScoringAccent());
  const [activeTab, setActiveTab] = useState('scoring'); // 'scoring', 'results', 'settings'

  // Search state
  const [countries, setCountries] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [cities, setCities] = useState([]);
  const [selectedParentCountry, setSelectedParentCountry] = useState(null);
  const [phaseNameDraft, setPhaseNameDraft] = useState('');
  const [loadingCities, setLoadingCities] = useState(false);
  const searchRef = useRef(null);
  const scoreSaveTimersRef = useRef({});
  const judgeRegistrationAttemptedRef = useRef(false);
  const fallbackLanguage = getStoredScoringLanguage();
  const currentLanguage = normalizeScoringLanguage(session?.language || fallbackLanguage);
  const isTotalScoring = isTotalScoringMode(session?.scoringMode);
  const t = scoringCopy[currentLanguage];

  useEffect(() => {
    persistScoringLanguage(currentLanguage);
  }, [currentLanguage]);

  useEffect(() => {
    document.body.style.background = getScoringBodyBackground(theme);
    document.title = t.appTitle;
  }, [theme, t]);

  // Load countries
  useEffect(() => {
    fetch('https://restcountries.com/v3.1/all?fields=name,translations,cca3,flag')
      .then(r => r.json())
      .then(data => {
        setCountries(
          data.map(c => ({
            name: getCountryDisplayName(c, currentLanguage),
            apiName: c.name?.common || '',
            flag: c.flag || '',
            id: c.cca3 || Math.random().toString()
          }))
          .filter(c => c.name).sort((a, b) => a.name.localeCompare(b.name))
        );
      }).catch(() => {});
  }, [currentLanguage]);

  // Load cities for Nacional
  useEffect(() => {
    if (session?.type === 'Nacional' && selectedParentCountry) {
      setCities([]); setLoadingCities(true);
      fetch('https://countriesnow.space/api/v0.1/countries/cities', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country: selectedParentCountry.apiName || selectedParentCountry.name })
      }).then(r => r.json()).then(data => {
        if (!data.error && data.data) setCities(data.data.map(c => ({ name: c, id: c.replace(/\s+/g, '').toUpperCase(), flag: selectedParentCountry.flag })));
      }).catch(() => {}).finally(() => setLoadingCities(false));
    }
  }, [session?.type, selectedParentCountry]);

  // Filter search
  useEffect(() => {
    if (searchQuery.length > 1) {
      const pool = session?.type === 'Nacional' && selectedParentCountry ? cities : countries;
      setSearchResults(pool.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 10));
    } else setSearchResults([]);
  }, [searchQuery, countries, cities, session?.type, selectedParentCountry]);

  // Click outside
  useEffect(() => {
    const h = e => { if (searchRef.current && !searchRef.current.contains(e.target)) setSearchResults([]); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    Object.values(scoreSaveTimersRef.current).forEach(clearTimeout);
    scoreSaveTimersRef.current = {};
    setScoreDrafts({});
    setForceAttempted(false);
    setUndoAttempted(false);
  }, [sessionId, judgeName, session?.currentPhaseIndex, session?.status]);

  useEffect(() => {
    return () => {
      Object.values(scoreSaveTimersRef.current).forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    judgeRegistrationAttemptedRef.current = false;
  }, [sessionId, judgeName]);

  useEffect(() => {
    if (!session) return;
    const requestedPhaseIndex = Number.isInteger(session.currentPhaseIndex) ? session.currentPhaseIndex : 0;
    const normalizedPhases = normalizePhases(session.phases, requestedPhaseIndex, currentLanguage);
    const safePhaseIndex = Math.min(Math.max(requestedPhaseIndex, 0), normalizedPhases.length - 1);
    const currentPhaseName = normalizedPhases[safePhaseIndex]?.name || getDefaultPhaseName(safePhaseIndex, currentLanguage);
    setPhaseNameDraft(currentPhaseName);
  }, [session, currentLanguage]);

  // Session + scores listener
  useEffect(() => {
    if (!sessionId || !judgeName) { if (!judgeName) navigate('/join'); return; }
    const unsubS = onSnapshot(doc(db, "sessions", sessionId), snap => {
      if (!snap.exists()) return;

      const nextSession = snap.data();
      const isHostJudge = nextSession.host === judgeName;
      const isRemovedJudge = !isHostJudge && judgeListIncludes(nextSession.removedJudges, judgeName);
      const isApprovedJudge = judgeListIncludes(nextSession.judges, judgeName);
      const isPendingJudge = judgeListIncludes(nextSession.pendingJudges, judgeName);

      setSession(nextSession);

      if (isRemovedJudge) {
        navigate(`/join?code=${encodeURIComponent(sessionId)}&removed=1`, { replace: true });
        return;
      }

      if (!judgeRegistrationAttemptedRef.current && !isHostJudge && !isApprovedJudge && !isPendingJudge) {
        judgeRegistrationAttemptedRef.current = true;
        updateDoc(doc(db, "sessions", sessionId), { pendingJudges: arrayUnion(judgeName) }).catch(() => {
          judgeRegistrationAttemptedRef.current = false;
        });
      }
    });
    const unsubSc = onSnapshot(doc(db, "sessions", `${sessionId}_scores`), snap => {
      setScores(snap.exists() ? snap.data() : {});
    });
    return () => { unsubS(); unsubSc(); };
  }, [sessionId, judgeName, navigate]);

  // --- Actions ---
  const handleScore = async (participantId, value) => {
    if (!isJudgeApproved) return;
    if (judgeListIncludes(session?.removedJudges, judgeName) && session?.host !== judgeName) return;
    if (value === '' || value === undefined) {
      await deleteScore(participantId);
      return;
    }
    const num = parseFloat(value);
    if (isNaN(num) || num < 0 || num > 10) return;
    const phaseKey = `phase_${currentPhaseIndex}`;
    await setDoc(doc(db, "sessions", `${sessionId}_scores`), {
      [phaseKey]: { [participantId]: { [judgeName]: num } }
    }, { merge: true });
  };

  const deleteScore = async (participantId) => {
    if (!isJudgeApproved) return;
    if (judgeListIncludes(session?.removedJudges, judgeName) && session?.host !== judgeName) return;
    const phaseKey = `phase_${currentPhaseIndex}`;
    await setDoc(doc(db, "sessions", `${sessionId}_scores`), {
      [phaseKey]: { [participantId]: { [judgeName]: null } }
    }, { merge: true });
  };

  const queueScoreSave = (participantId, value) => {
    setScoreDrafts(prev => ({ ...prev, [participantId]: value }));

    if (scoreSaveTimersRef.current[participantId]) {
      clearTimeout(scoreSaveTimersRef.current[participantId]);
    }

    scoreSaveTimersRef.current[participantId] = setTimeout(() => {
      handleScore(participantId, value).catch(() => {});
      delete scoreSaveTimersRef.current[participantId];
    }, 250);
  };

  const flushScoreSave = (participantId, fallbackValue) => {
    if (scoreSaveTimersRef.current[participantId]) {
      clearTimeout(scoreSaveTimersRef.current[participantId]);
      delete scoreSaveTimersRef.current[participantId];
    }

    handleScore(participantId, scoreDrafts[participantId] ?? fallbackValue ?? '').catch(() => {});
  };

  const addParticipant = async (item) => {
    const participants = session.participants || [];
    const nextParticipant = buildNumberedParticipant(item, participants, session.type === 'Global' ? 'country' : 'city');
    await updateDoc(doc(db, "sessions", session.id), {
      participants: [...participants, nextParticipant]
    });
    setSearchQuery(''); setSearchResults([]);
  };

  const removeParticipant = async (id) => {
    await updateDoc(doc(db, "sessions", session.id), {
      participants: (session.participants || []).filter(p => p.id !== id)
    });
  };

  const updatePhaseName = async (name) => {
    const normalizedName = String(name || '').trim();
    if (!normalizedName || normalizedName === currentPhase.name) return;
    const nextPhases = [...phases];
    nextPhases[currentPhaseIndex] = { ...nextPhases[currentPhaseIndex], name: normalizedName };
    await updateDoc(doc(db, "sessions", session.id), { phases: nextPhases });
  };

  const commitPhaseName = () => {
    const normalizedName = String(phaseNameDraft || '').trim();
    if (!normalizedName) {
      setPhaseNameDraft(currentPhase.name);
      return;
    }
    updatePhaseName(normalizedName).catch(() => {
      setPhaseNameDraft(currentPhase.name);
    });
  };

  const updatePhaseCutoff = async (value) => {
    const nextPhases = [...phases];
    const num = parseInt(value);
    nextPhases[currentPhaseIndex] = { ...nextPhases[currentPhaseIndex], cutoff: isNaN(num) || num <= 0 ? null : num };
    await updateDoc(doc(db, "sessions", session.id), { phases: nextPhases });
  };

  const toggleParticipantAbsent = async (participantId) => {
    if (!isHost || currentPhaseIndex <= 0 || !participantId) return;

    const phase = phases[currentPhaseIndex] || {};
    const currentAbsentIds = Array.isArray(phase.absentParticipantIds) ? phase.absentParticipantIds : [];
    const isCurrentlyAbsent = currentAbsentIds.includes(participantId);
    const nextAbsentIds = isCurrentlyAbsent
      ? currentAbsentIds.filter(id => id !== participantId)
      : [...currentAbsentIds, participantId];

    const nextPhases = [...phases];
    nextPhases[currentPhaseIndex] = {
      ...phase,
      absentParticipantIds: nextAbsentIds.length ? nextAbsentIds : null
    };

    await updateDoc(doc(db, "sessions", session.id), { phases: nextPhases });
  };

  const renameSession = async (nextName) => {
    if (!nextName || !nextName.trim()) return;
    await updateDoc(doc(db, "sessions", session.id), {
      name: nextName.trim()
    });
  };

  const expelJudge = async (judgeToExpel) => {
    if (!judgeToExpel || judgeToExpel === session.host) return;

    const remainingJudges = (session.judges || []).filter(judge => normalizeJudgeIdentity(judge) !== normalizeJudgeIdentity(judgeToExpel));
    await updateDoc(doc(db, "sessions", session.id), {
      judges: remainingJudges,
      pendingJudges: (session.pendingJudges || []).filter(judge => normalizeJudgeIdentity(judge) !== normalizeJudgeIdentity(judgeToExpel)),
      removedJudges: arrayUnion(judgeToExpel)
    });
  };

  const approveJudge = async (judgeToApprove) => {
    if (!judgeToApprove || judgeToApprove === session.host) return;

    const normalizedTarget = normalizeJudgeIdentity(judgeToApprove);
    const existingJudges = Array.isArray(session.judges) ? session.judges : [];
    const nextJudges = judgeListIncludes(existingJudges, judgeToApprove)
      ? existingJudges
      : [...existingJudges, judgeToApprove];
    const nextPendingJudges = (session.pendingJudges || []).filter(
      judge => normalizeJudgeIdentity(judge) !== normalizedTarget
    );

    await updateDoc(doc(db, "sessions", session.id), {
      judges: nextJudges,
      pendingJudges: nextPendingJudges
    });
  };

  const rejectJudge = async (judgeToReject) => {
    if (!judgeToReject || judgeToReject === session.host) return;

    const normalizedTarget = normalizeJudgeIdentity(judgeToReject);
    const nextPendingJudges = (session.pendingJudges || []).filter(
      judge => normalizeJudgeIdentity(judge) !== normalizedTarget
    );

    await updateDoc(doc(db, "sessions", session.id), {
      pendingJudges: nextPendingJudges,
      removedJudges: arrayUnion(judgeToReject)
    });
  };

  const advancePhase = async (cutoffOverride = null) => {
    const phaseKey = `phase_${currentPhaseIndex}`;
    let phaseScores = scores[phaseKey] || {};
    const currentParticipants = getPhaseParticipants(currentPhaseIndex);
    const judges = session.judges || [];
    const effectiveCutoff = Number.isFinite(cutoffOverride) && cutoffOverride > 0
      ? cutoffOverride
      : currentPhase.cutoff;

    // Check if all judges have scored all participants
    const allComplete = currentParticipants.every(p => {
      const pScores = phaseScores[p.id] || {};
      return judges.every(j => pScores[j] !== undefined && pScores[j] !== null);
    });

    if (!allComplete && !forceAttempted) {
      setForceAttempted(true);
      return; // Show warning, next click will force
    }

    // Force: fill missing scores with 1
    if (!allComplete) {
      const updates = {};
      const nextPhaseScores = { ...phaseScores };
      currentParticipants.forEach(p => {
        nextPhaseScores[p.id] = { ...(nextPhaseScores[p.id] || {}) };
        judges.forEach(j => {
          if (!phaseScores[p.id]?.[j] && phaseScores[p.id]?.[j] !== 0) {
            updates[`${phaseKey}.${p.id}.${j}`] = 1;
            nextPhaseScores[p.id][j] = 1;
          }
        });
      });
      if (Object.keys(updates).length > 0) {
        await updateDoc(doc(db, "sessions", `${sessionId}_scores`), updates);
      }
      phaseScores = nextPhaseScores;
    }

    // Mark current phase complete, add new phase
    const nextPhases = [...phases];
    const rankedCurrentParticipants = rankParticipantsByPhaseScores(currentParticipants, phaseScores);
    const qualifiedParticipants = rankedCurrentParticipants.slice(0, effectiveCutoff || rankedCurrentParticipants.length);

    nextPhases[currentPhaseIndex] = {
      ...nextPhases[currentPhaseIndex],
      cutoff: effectiveCutoff || null,
      status: 'completed',
      participantIds: currentParticipants.map(participant => participant.id)
    };
    const newPhaseIndex = currentPhaseIndex + 1;
    nextPhases.push({
      name: getDefaultPhaseName(newPhaseIndex, currentLanguage),
      cutoff: null,
      status: 'active',
      absentParticipantIds: null,
      participantIds: qualifiedParticipants.map(participant => participant.id)
    });

    await updateDoc(doc(db, "sessions", session.id), {
      phases: nextPhases,
      currentPhaseIndex: newPhaseIndex
    });
    setForceAttempted(false);
  };

  const revealWinner = async (cutoffOverride = null) => {
    const phaseKey = `phase_${currentPhaseIndex}`;
    let phaseScores = scores[phaseKey] || {};
    const currentParticipants = getPhaseParticipants(currentPhaseIndex);
    const judges = session.judges || [];
    const effectiveCutoff = Number.isFinite(cutoffOverride) && cutoffOverride > 0
      ? cutoffOverride
      : currentPhase.cutoff;

    const allComplete = currentParticipants.every(participant => {
      const participantScores = phaseScores[participant.id] || {};
      return judges.every(judge => participantScores[judge] !== undefined && participantScores[judge] !== null);
    });

    if (!allComplete && !forceAttempted) {
      setForceAttempted(true);
      return;
    }

    if (!allComplete) {
      const updates = {};
      const nextPhaseScores = { ...phaseScores };
      currentParticipants.forEach(participant => {
        nextPhaseScores[participant.id] = { ...(nextPhaseScores[participant.id] || {}) };
        judges.forEach(judge => {
          if (!phaseScores[participant.id]?.[judge] && phaseScores[participant.id]?.[judge] !== 0) {
            updates[`${phaseKey}.${participant.id}.${judge}`] = 1;
            nextPhaseScores[participant.id][judge] = 1;
          }
        });
      });
      if (Object.keys(updates).length > 0) {
        await updateDoc(doc(db, "sessions", `${sessionId}_scores`), updates);
      }
      phaseScores = nextPhaseScores;
    }

    const rankedCurrentParticipants = rankParticipantsByPhaseScores(currentParticipants, phaseScores);
    const scoreSnapshot = { ...scores, [phaseKey]: phaseScores };
    const winnerCandidates = rankedCurrentParticipants.map(participant => {
      const cumulativeStats = getParticipantScoreStatsByPhases(
        participant.id,
        Array.from({ length: currentPhaseIndex + 1 }, (_, idx) => idx),
        scoreSnapshot
      );
      return {
        ...participant,
        cumulativeTotal: cumulativeStats.total,
        cumulativeAverage: cumulativeStats.average
      };
    });

    const winner = isTotalScoring
      ? winnerCandidates.sort((a, b) => (
        b.cumulativeTotal - a.cumulativeTotal
        || b.avg - a.avg
        || a.name.localeCompare(b.name)
      ))[0]
      : rankedCurrentParticipants[0];
    const nextPhases = [...phases];

    nextPhases[currentPhaseIndex] = {
      ...nextPhases[currentPhaseIndex],
      cutoff: effectiveCutoff || null,
      status: 'completed',
      participantIds: currentParticipants.map(participant => participant.id)
    };

    await updateDoc(doc(db, "sessions", session.id), {
      phases: nextPhases,
      status: 'completed',
      winnerId: winner?.id || null,
      winnerPhaseIndex: currentPhaseIndex,
      completedAt: Date.now()
    });
    setForceAttempted(false);
  };

  const requestCutoffBeforeAdvance = async () => {
    const existingCutoff = Number.parseInt(currentPhase.cutoff, 10);
    if (Number.isFinite(existingCutoff) && existingCutoff > 0) return existingCutoff;

    const maxAllowed = currentParticipants.length;
    if (!maxAllowed) return null;

    let suggestedValue = String(maxAllowed);
    while (true) {
      const rawValue = window.prompt(t.board.missingCutoffPrompt(maxAllowed), suggestedValue);
      if (rawValue === null) return null;

      const parsed = Number.parseInt(rawValue, 10);
      if (Number.isFinite(parsed) && parsed >= 1 && parsed <= maxAllowed) {
        await updatePhaseCutoff(String(parsed));
        return parsed;
      }

      window.alert(t.board.invalidCutoffPrompt(maxAllowed));
      suggestedValue = rawValue;
    }
  };

  const handlePhaseAction = async () => {
    setUndoAttempted(false);
    const selectedCutoff = await requestCutoffBeforeAdvance();
    if (!selectedCutoff) return;

    if (selectedCutoff === 1) {
      revealWinner(selectedCutoff).catch(() => {});
      return;
    }

    advancePhase(selectedCutoff).catch(() => {});
  };

  const copyCode = (e) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(session?.id || '');
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  const getPublicResultsUrl = () => `${window.location.origin}/session/${sessionId}/results`;

  const copyPublicResultsLink = () => {
    navigator.clipboard.writeText(getPublicResultsUrl());
    setResultsLinkCopied(true);
    setTimeout(() => setResultsLinkCopied(false), 2000);
  };

  const openPublicResults = () => {
    window.open(getPublicResultsUrl(), '_blank', 'noopener,noreferrer');
  };

  // --- Computed ---
  if (!session) return (
    <div className={`theme-scoring-${theme} min-h-screen bg-app-bg text-app-text flex items-center justify-center`} style={getScoringThemeStyleVars(accentColor)}>
      <div className="w-8 h-8 border-2 border-app-border rounded-full animate-spin" style={{ borderTopColor: 'var(--color-app-text)' }}></div>
    </div>
  );

  const isHost = session.host === judgeName;
  const isJudgeRemoved = !isHost && judgeListIncludes(session.removedJudges, judgeName);
  const allParticipants = session.participants || [];
  const judges = session.judges || [];
  const pendingJudgeRequests = session.pendingJudges || [];
  const hasPendingJudgeRequests = isHost && pendingJudgeRequests.length > 0;
  const isJudgeApproved = isHost || judgeListIncludes(judges, judgeName);
  const isJudgePendingApproval = !isHost && judgeListIncludes(pendingJudgeRequests, judgeName);
  const requestedPhaseIndex = Number.isInteger(session.currentPhaseIndex) ? session.currentPhaseIndex : 0;
  const phases = normalizePhases(session.phases, requestedPhaseIndex, currentLanguage);
  const currentPhaseIndex = Math.min(Math.max(requestedPhaseIndex, 0), phases.length - 1);
  const currentPhase = phases[currentPhaseIndex] || getDefaultPhase(currentLanguage);
  const participantMap = new Map(allParticipants.map(participant => [participant.id, participant]));
  const phaseKey = `phase_${currentPhaseIndex}`;
  const phaseScores = scores[phaseKey] || {};

  // Get participants for a given phase index
  const getPhaseParticipants = (phaseIdx, options = {}) => {
    const includeAbsent = Boolean(options.includeAbsent);
    if (phaseIdx < 0) return [];
    if (phaseIdx === 0) return allParticipants;

    const phase = phases[phaseIdx];
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
      const rankedAlternates = rankParticipantsByPhaseScores(previousParticipants, previousScores)
        .filter(participant => !baseSet.has(participant.id) && !absentIds.has(participant.id));

      const activeParticipants = [...activeBase];
      rankedAlternates.forEach(participant => {
        if (activeParticipants.length < targetCount) {
          activeParticipants.push(participant);
        }
      });

      if (!includeAbsent) {
        return activeParticipants;
      }

      const absentBaseIds = baseParticipants
        .filter(participant => absentIds.has(participant.id))
        .map(participant => participant.id);
      const absentAlternateIds = rankParticipantsByPhaseScores(previousParticipants, previousScores)
        .filter(participant => absentIds.has(participant.id) && !baseSet.has(participant.id))
        .map(participant => participant.id);
      const absentParticipants = [...absentBaseIds, ...absentAlternateIds]
        .map(participantId => participantMap.get(participantId))
        .filter(Boolean);

      return [...activeParticipants, ...absentParticipants];
    }

    const prevPhase = phases[phaseIdx - 1];
    const prevParticipants = getPhaseParticipants(phaseIdx - 1);
    if (!prevPhase || !prevPhase.cutoff) return prevParticipants;
    const prevKey = `phase_${phaseIdx - 1}`;
    const prevScores = scores[prevKey] || {};
    const ranked = rankParticipantsByPhaseScores(prevParticipants, prevScores);
    return ranked.slice(0, prevPhase.cutoff);
  };

  const currentParticipants = getPhaseParticipants(currentPhaseIndex);
  const currentPhaseParticipantsWithAbsent = getPhaseParticipants(currentPhaseIndex, { includeAbsent: true });
  const currentParticipantIds = new Set(currentParticipants.map(participant => participant.id));
  const currentAbsentParticipants = currentPhaseParticipantsWithAbsent.filter(participant => !currentParticipantIds.has(participant.id));

  const phaseHasSavedScores = (phaseIdx) => {
    const phaseScoresMap = scores[`phase_${phaseIdx}`];
    if (!phaseScoresMap || typeof phaseScoresMap !== 'object') return false;

    return Object.values(phaseScoresMap).some(participantScores => (
      participantScores
      && typeof participantScores === 'object'
      && Object.values(participantScores).some(value => value !== null && value !== undefined)
    ));
  };

  // Score + sort participants for current phase
  const scoredParticipants = currentParticipants.map(p => {
    const pScores = phaseScores[p.id] || {};
    const vals = Object.values(pScores).filter(v => v !== null && v !== undefined);
    const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    const myScore = pScores[judgeName];
    return { ...p, avg, voteCount: vals.length, myScore };
  });
  const tableParticipants = [
    ...scoredParticipants,
    ...currentAbsentParticipants.map(participant => ({
      ...participant,
      avg: 0,
      voteCount: 0,
      myScore: null,
      isAbsent: true
    }))
  ];

  // Calculate who is actually making the cut based on scores, not alphabetical order
  const rankedForCutoff = rankParticipantsByPhaseScores(currentParticipants, phaseScores);
  const cutoffLimit = currentPhase.cutoff || rankedForCutoff.length;
  const qualifiedIds = new Set(rankedForCutoff.slice(0, cutoffLimit).map(p => p.id));

  // Check completion for advance button
  const allJudgesComplete = currentParticipants.length > 0 && currentParticipants.every(p => {
    const pScores = phaseScores[p.id] || {};
    return judges.every(j => pScores[j] !== undefined && pScores[j] !== null);
  });
  const votedJudges = judges.filter(j => currentParticipants.every(p => {
    const ps = phaseScores[p.id] || {};
    return ps[j] !== undefined && ps[j] !== null;
  })).length;
  const pendingVotesCount = Math.max(judges.length - votedJudges, 0);
  const isFinalRound = currentPhase.cutoff === 1;
  const isSessionComplete = session.status === 'completed' && Boolean(session.winnerId);
  const shouldHideCutInsightsForJudge = !isHost && !isSessionComplete && currentPhase.status === 'active';
  const shouldShowCutPreview = !shouldHideCutInsightsForJudge;
  const canUndoPhase = isHost && (currentPhaseIndex > 0 || isSessionComplete);
  const currentPhaseHasSavedScores = phaseHasSavedScores(currentPhaseIndex);

  const undoPhaseAdvance = async () => {
    setForceAttempted(false);

    if (isSessionComplete) {
      const reopenedPhases = [...phases];
      reopenedPhases[currentPhaseIndex] = {
        ...reopenedPhases[currentPhaseIndex],
        status: 'active'
      };

      await updateDoc(doc(db, "sessions", session.id), {
        phases: reopenedPhases,
        currentPhaseIndex,
        status: 'active',
        winnerId: deleteField(),
        winnerPhaseIndex: deleteField(),
        completedAt: deleteField()
      });
      setUndoAttempted(false);
      return;
    }

    if (currentPhaseIndex <= 0) return;

    if (currentPhaseHasSavedScores && !undoAttempted) {
      setUndoAttempted(true);
      return;
    }

    const previousPhaseIndex = currentPhaseIndex - 1;
    const rewoundPhases = phases.slice(0, currentPhaseIndex).map((phase, index) => (
      index === previousPhaseIndex
        ? { ...phase, status: 'active' }
        : phase
    ));
    const discardedPhaseIndexes = Array.from(
      { length: phases.length - currentPhaseIndex },
      (_, offset) => currentPhaseIndex + offset
    );

    if (discardedPhaseIndexes.length > 0) {
      const scoreDeletes = discardedPhaseIndexes.reduce((acc, phaseIdx) => {
        acc[`phase_${phaseIdx}`] = deleteField();
        return acc;
      }, {});

      await setDoc(doc(db, "sessions", `${sessionId}_scores`), scoreDeletes, { merge: true });
    }

    await updateDoc(doc(db, "sessions", session.id), {
      phases: rewoundPhases,
      currentPhaseIndex: previousPhaseIndex,
      status: 'active',
      winnerId: deleteField(),
      winnerPhaseIndex: deleteField(),
      completedAt: deleteField()
    });
    setUndoAttempted(false);
  };

  // Results panel: adapt scoring metric according to session scoring mode
  const globalResults = allParticipants.map(participant => {
    let lastActivePhase = 0;
    let eliminated = false;

    for (let phaseIdx = 0; phaseIdx <= currentPhaseIndex; phaseIdx++) {
      const isInPhase = getPhaseParticipants(phaseIdx).some(currentParticipant => currentParticipant.id === participant.id);
      if (!isInPhase) {
        eliminated = true;
        break;
      }
      lastActivePhase = phaseIdx;
    }

    const aggregateStats = getParticipantScoreStatsByPhases(
      participant.id,
      Array.from({ length: currentPhaseIndex + 1 }, (_, idx) => idx),
      scores
    );
    const currentPhaseStats = getParticipantScoreStatsByPhases(participant.id, [currentPhaseIndex], scores);
    const isCurrentlyActive = !eliminated;
    const displayScore = isTotalScoring ? aggregateStats.total : currentPhaseStats.average;

    return {
      ...participant,
      lastActivePhase,
      eliminated,
      isCurrentlyActive,
      aggregateTotal: aggregateStats.total,
      aggregateVotes: aggregateStats.votes,
      aggregateAverage: aggregateStats.average,
      currentPhaseAverage: currentPhaseStats.average,
      displayScore
    };
  }).sort((a, b) => {
    if (session.winnerId === a.id && session.winnerId !== b.id) return -1;
    if (session.winnerId !== a.id && session.winnerId === b.id) return 1;
    if (a.isCurrentlyActive && !b.isCurrentlyActive) return -1;
    if (!a.isCurrentlyActive && b.isCurrentlyActive) return 1;
    return b.displayScore - a.displayScore || a.name.localeCompare(b.name);
  });
  const winner = session.winnerId ? participantMap.get(session.winnerId) : null;
  const winnerResult = session.winnerId ? globalResults.find(participant => participant.id === session.winnerId) : null;
  const winnerPhaseName = phases[session.winnerPhaseIndex]?.name || currentPhase.name;
  const winnerScoreValue = winnerResult
    ? (isTotalScoring ? winnerResult.aggregateTotal : winnerResult.currentPhaseAverage)
    : 0;

  const canAdvance = !isSessionComplete && currentParticipants.length > 0;

  if (isJudgeRemoved) {
    return (
      <div
        className={`theme-scoring-${theme} min-h-screen bg-app-bg text-app-text font-sans flex items-center justify-center p-4`}
        style={getScoringThemeStyleVars(accentColor)}
      >
        <div className="scoring-panel rounded-2xl max-w-md w-full p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 text-red-400">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold text-app-text mb-2">{t.board.removedJudgeTitle}</h1>
          <p className="text-sm text-app-muted/80 mb-6">{t.board.removedJudgeMessage}</p>
          <button
            type="button"
            onClick={() => navigate(`/join?code=${encodeURIComponent(sessionId)}`, { replace: true })}
            className="scoring-btn-primary h-12 px-5 rounded-lg text-sm font-bold uppercase tracking-widest inline-flex items-center justify-center"
          >
            {t.board.backToJoin}
          </button>
        </div>
      </div>
    );
  }

  if (!isJudgeApproved) {
    return (
      <div
        className={`theme-scoring-${theme} min-h-screen bg-app-bg text-app-text font-sans flex items-center justify-center p-4`}
        style={getScoringThemeStyleVars(accentColor)}
      >
        <div className="scoring-panel rounded-2xl max-w-md w-full p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10 text-amber-300 border border-amber-300/20">
            <UserCheck className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold text-app-text mb-2">{t.board.pendingJudgeTitle}</h1>
          <p className="text-sm text-app-muted/80 mb-2">{t.board.pendingJudgeMessage}</p>
          <p className="text-xs text-app-muted/60 mb-6">
            {isJudgePendingApproval ? t.board.pendingJudgeStatusPending : t.board.pendingJudgeStatusQueued}
          </p>
          <button
            type="button"
            onClick={() => navigate(`/join?code=${encodeURIComponent(sessionId)}`, { replace: true })}
            className="scoring-btn-secondary h-12 px-5 rounded-lg text-sm font-bold uppercase tracking-widest inline-flex items-center justify-center"
          >
            {t.board.backToJoin}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div 
      className={`theme-scoring-${theme} min-h-screen bg-app-bg text-app-text font-sans flex flex-col h-screen overflow-hidden`}
      style={getScoringThemeStyleVars(accentColor, theme)}
    >
      {/* HEADER - Global at top */}
      <header className="min-h-10 md:min-h-12 border-b border-app-border/60 bg-app-card/80 backdrop-blur-md flex items-center justify-between gap-2 md:gap-3 px-2 md:px-5 py-1 md:py-2 flex-shrink-0 z-20 flex-wrap">
        <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-wrap">
          {session.type === 'Global' ? <Globe className="w-3 md:w-4 h-3 md:h-4 text-app-muted/70 shrink-0" /> : <MapPin className="w-3 md:w-4 h-3 md:h-4 text-app-muted/70 shrink-0" />}
          <h1 className="text-sm md:text-base font-bold text-app-text tracking-tight truncate">{session.name}</h1>
          <span className="text-[10px] md:text-xs text-app-muted/50 bg-app-border/30 px-1.5 md:px-2 py-0.5 rounded border border-app-border shrink-0">{getSessionTypeLabel(session.type, currentLanguage)}</span>
          <span className="text-[10px] md:text-xs text-app-muted/50 shrink-0">{judges.length} {judges.length === 1 ? t.board.judgeSingular : t.board.judgePlural}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0 flex-wrap justify-end">
          {isHost && (
            <>
              <button onClick={openPublicResults} className="scoring-btn-icon flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium" title={t.board.openInNewTab} aria-label={t.board.openInNewTab}>
                <ExternalLink className="w-3 h-3" />
                {t.board.publicResultsLabel}
              </button>
              <button onClick={copyPublicResultsLink} className="scoring-btn-icon flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium" title={t.board.copyPublicLink} aria-label={t.board.copyPublicLink}>
                {resultsLinkCopied ? <Check className="w-3 h-3 text-green-500" /> : <Link2 className="w-3 h-3" />}
                {resultsLinkCopied ? t.board.linkCopied : t.board.copyPublicLink}
              </button>
              <button onClick={() => setIsSettingsModalOpen(true)} className="scoring-btn-icon flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium">
                <Settings2 className="w-3 h-3" />
                {t.board.settingsButton}
              </button>
              <button onClick={() => setIsReportModalOpen(true)} className="scoring-btn-icon flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium">
                <BarChart3 className="w-3 h-3" />
                {t.board.reportsButton}
              </button>
            </>
          )}
          <button onClick={copyCode} className="scoring-btn-icon flex items-center gap-1.5 px-2 py-1 rounded text-xs font-mono tracking-widest" title={t.board.copyCode}>
            {session.id}
            {codeCopied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
          </button>
          <div className="flex items-center gap-2">
            <span className="text-sm text-app-muted">{judgeName}</span>
            {isHost && <span className="scoring-badge text-[10px] px-1.5 py-0.5 rounded">{t.board.hostBadge}</span>}
            <button onClick={() => {
              const newTheme = theme === 'dark' ? 'light' : 'dark';
              setTheme(newTheme);
              persistScoringTheme(newTheme);
            }} className="scoring-btn-icon p-1.5 rounded" title={t.board.themeToggle} aria-label={t.board.themeToggle}>
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
          </div>
          <div className="h-4 w-px bg-app-border/50 mx-1" />
          <button onClick={() => { localStorage.removeItem('judgeName'); navigate('/'); }} className="scoring-btn-icon p-1.5 rounded-full text-app-danger hover:bg-app-danger/10" title={t.board.exitSession} aria-label={t.board.exitSession}>
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {hasPendingJudgeRequests && (
        <div className="px-4 pt-3">
          <div className="rounded-xl border border-amber-300/35 bg-amber-500/10 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-200">{t.board.pendingRequestsNotice(pendingJudgeRequests.length)}</p>
                <p className="text-sm text-app-text mt-1">{t.board.pendingRequestPrompt(pendingJudgeRequests[0])}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => approveJudge(pendingJudgeRequests[0]).catch(() => {})}
                  className="rounded-lg border border-emerald-300/30 bg-emerald-500/15 px-3 py-2 text-xs font-bold uppercase tracking-widest text-emerald-200 hover:bg-emerald-500/25 transition-colors"
                >
                  {t.board.approveFromNotice}
                </button>
                <button
                  type="button"
                  onClick={() => rejectJudge(pendingJudgeRequests[0]).catch(() => {})}
                  className="rounded-lg border border-red-300/30 bg-red-500/15 px-3 py-2 text-xs font-bold uppercase tracking-widest text-red-200 hover:bg-red-500/25 transition-colors"
                >
                  {t.board.rejectFromNotice}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MAIN CONTENT AREA with GAP */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 gap-4 p-4 pb-20 lg:pb-4 overflow-hidden">
        
        {/* LEFT: TABLERO DE PUNTUACIÓN (CARD) - 60% */}
        <div className={`lg:w-[60%] flex flex-col min-h-0 bg-app-card rounded-2xl shadow-xl border border-app-border overflow-hidden ${activeTab !== 'scoring' ? 'hidden lg:flex' : 'flex'} ${isSessionComplete ? 'bg-gradient-to-br from-app-card to-app-border/10' : ''}`}>
          {/* Phase header */}
          <div className="p-2 md:p-4 border-b border-app-border/50 bg-app-card/50 shrink-0">
            <div className="flex items-center gap-2 md:gap-3 flex-wrap">
              {/* Phase nav pills (completed + current) */}
              {phases.map((ph, i) => (
                <div key={i} className={`text-xs px-2.5 py-1 rounded-md font-medium ${
                  i === currentPhaseIndex ? 'scoring-badge-active' :
                  ph.status === 'completed' ? 'bg-app-border text-app-muted/70' : 'bg-app-border/30 text-app-muted/50'
                }`}>
                  {ph.name}
                  {ph.status === 'completed' && <span className="ml-1 text-app-muted/50">✓</span>}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-4 mt-3">
              {isHost ? (
                <input
                  type="text" value={phaseNameDraft}
                  onChange={e => setPhaseNameDraft(e.target.value)}
                  onBlur={commitPhaseName}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.currentTarget.blur();
                    }
                    if (e.key === 'Escape') {
                      setPhaseNameDraft(currentPhase.name);
                      e.currentTarget.blur();
                    }
                  }}
                  className="bg-transparent text-xl font-bold text-app-text focus:outline-none border-b border-transparent focus:border-app-border transition-colors flex-1 min-w-0"
                  placeholder={t.board.phaseNamePlaceholder}
                />
              ) : (
                <h2 className="text-xl font-bold text-app-text">{currentPhase.name}</h2>
              )}
              {isHost && (
                <div className="shrink-0 rounded-xl border-2 border-app-accent/35 bg-app-accent/10 px-3 py-2 shadow-[0_0_0_1px_var(--color-app-accent-muted)]">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-app-muted/90 uppercase tracking-widest font-bold">{t.board.classifyLabel}</span>
                    <span className="inline-flex h-1.5 w-1.5 rounded-full bg-app-accent" />
                  </div>
                  <input
                    type="number" min="1" max={currentParticipants.length || 99}
                    value={currentPhase.cutoff || ''}
                    onChange={e => updatePhaseCutoff(e.target.value)}
                    placeholder="—"
                    className="mt-1 bg-transparent text-xl text-app-text font-mono font-black text-center focus:outline-none w-16"
                  />
                  <p className="mt-1 text-[10px] text-app-muted/80 uppercase tracking-wider">{t.board.classifyHint}</p>
                </div>
              )}
            </div>
            {!isHost && currentPhase.cutoff && (
              <p className="text-xs text-app-muted/50 mt-1">{t.board.classifySummary(currentPhase.cutoff, currentParticipants.length)}</p>
            )}
          </div>

          {/* Search bar (host, first phase only for adding) */}
          {isHost && currentPhaseIndex === 0 && !isSessionComplete && (
            <div className="px-5 py-4 border-b border-app-border/30 bg-app-card/30 shrink-0">
              {session.type === 'Nacional' && !selectedParentCountry && (
                <div className="relative mb-2" ref={searchRef}>
                  <div className="relative">
                    <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && searchResults.length === 1) {
                          e.preventDefault();
                          setSelectedParentCountry(searchResults[0]);
                          setSearchQuery('');
                          setSearchResults([]);
                        }
                      }}
                      placeholder={t.board.addHostCountryFirst}
                      className="scoring-input w-full rounded-lg h-10 pl-10 pr-3 text-sm" />
                    <Search className="w-4 h-4 text-app-muted/70 absolute left-3 top-3" />
                  </div>
                  <AnimatePresence>
                    {searchResults.length > 0 && (
                      <motion.div 
                        initial={{ opacity: 0, y: -10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="scoring-popover absolute mt-2 left-0 right-0 rounded-xl overflow-hidden z-30 max-h-48 overflow-y-auto p-1 custom-scrollbar"
                      >
                        {searchResults.map(c => (
                          <button key={c.id} onClick={() => { setSelectedParentCountry(c); setSearchQuery(''); setSearchResults([]); }}
                            className="scoring-popover-option w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm rounded-lg group">
                            <span className="text-lg group-hover:scale-110 transition-transform">{c.flag}</span>
                            <span className="scoring-popover-secondary font-medium">{c.name}</span>
                          </button>
                        ))}
                      </motion.div>
                    )}
                    {searchQuery.trim().length > 1 && searchResults.length === 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="scoring-popover absolute mt-2 left-0 right-0 rounded-xl p-4 z-30 text-center"
                      >
                        <button
                          onClick={() => {
                            const rawName = searchQuery.trim();
                            const manualCountry = {
                              name: rawName,
                              apiName: rawName,
                              id: rawName.replace(/\s+/g, '').toUpperCase(),
                              flag: '🏳️'
                            };
                            setSelectedParentCountry(manualCountry);
                            setSearchQuery('');
                            setSearchResults([]);
                          }}
                          className="scoring-btn-primary text-xs px-4 py-2 rounded-lg font-bold uppercase tracking-widest"
                        >
                          {t.board.addManualEntry(searchQuery)}
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
              {session.type === 'Nacional' && selectedParentCountry && (
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm">{t.board.hostCountryLabel}: {selectedParentCountry.flag} {selectedParentCountry.name}</span>
                  <button onClick={() => { setSelectedParentCountry(null); setCities([]); }} className="text-xs text-app-muted/70 hover:text-app-text" title={t.board.changeHostCountry} aria-label={t.board.changeHostCountry}>✕</button>
                </div>
              )}
              {(session.type === 'Global' || (session.type === 'Nacional' && selectedParentCountry)) && (
                <div className="relative" ref={searchRef}>
                  <div className="relative">
                    <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && searchResults.length === 1) {
                          e.preventDefault();
                          addParticipant(searchResults[0]).catch(() => {});
                        }
                      }}
                      disabled={session.type === 'Nacional' && loadingCities}
                      placeholder={session.type === 'Global' ? t.board.addCountryPlaceholder : loadingCities ? t.board.loadingCities : t.board.addCityPlaceholder}
                      className="scoring-input w-full rounded-lg h-10 pl-10 pr-3 text-sm disabled:opacity-40" />
                    <Search className="w-4 h-4 text-app-muted/70 absolute left-3 top-3" />
                  </div>
                  <AnimatePresence>
                    {searchResults.length > 0 && (
                      <motion.div 
                        initial={{ opacity: 0, y: -10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="scoring-popover absolute mt-2 left-0 right-0 rounded-xl overflow-hidden z-30 max-h-48 overflow-y-auto p-1 custom-scrollbar"
                      >
                        {searchResults.map(c => (
                          <button key={c.id} onClick={() => addParticipant(c)}
                            className="scoring-popover-option w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm rounded-lg group">
                            {c.flag && <span className="text-lg group-hover:scale-110 transition-transform">{c.flag}</span>}
                            <span className="scoring-popover-secondary font-medium">{c.name}</span>
                            <Plus className="scoring-popover-icon w-4 h-4 text-app-muted/70 ml-auto transition-colors" />
                          </button>
                        ))}
                      </motion.div>
                    )}
                    {session.type === 'Global' && searchQuery.trim().length > 1 && searchResults.length === 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="scoring-popover absolute mt-2 left-0 right-0 rounded-xl p-4 z-30 text-center"
                      >
                        <button
                          onClick={() => addParticipant({ name: searchQuery.trim(), id: searchQuery.trim().replace(/\s+/g, '').toUpperCase(), flag: '🏳️' })}
                          className="scoring-btn-primary text-xs px-4 py-2 rounded-lg font-bold uppercase tracking-widest"
                        >
                          {t.board.addManualEntry(searchQuery)}
                        </button>
                      </motion.div>
                    )}
                    {session.type === 'Nacional' && searchQuery.length > 1 && searchResults.length === 0 && cities.length > 0 && !loadingCities && (
                      <motion.div 
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="scoring-popover absolute mt-2 left-0 right-0 rounded-xl p-4 z-30 text-center"
                      >
                        <button onClick={() => addParticipant({ name: searchQuery.trim(), id: searchQuery.trim().replace(/\s+/g, '').toUpperCase(), flag: selectedParentCountry.flag })}
                          className="scoring-btn-primary text-xs px-4 py-2 rounded-lg font-bold uppercase tracking-widest">
                          {t.board.addManualEntry(searchQuery)}
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          )}

          {isSessionComplete ? (
            <div className="flex-1 overflow-auto p-4 md:p-6">
              <div className="scoring-winner-stage relative flex min-h-full items-center justify-center overflow-hidden rounded-[2rem] border border-amber-300/20 p-8 text-center">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.08),transparent_18%),radial-gradient(circle_at_80%_15%,rgba(251,191,36,0.18),transparent_20%),radial-gradient(circle_at_50%_85%,rgba(255,255,255,0.05),transparent_20%)] opacity-80" />
                <div className="relative z-10 flex max-w-xl flex-col items-center">
                  <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-amber-200/20 bg-amber-300/10 text-amber-200 shadow-[0_0_30px_rgba(251,191,36,0.2)]">
                    <Crown className="h-10 w-10" />
                  </div>
                  <p className="text-xs uppercase tracking-[0.45em] text-amber-200/70">{t.board.winnerTitle}</p>
                  <h2 className="mt-3 text-4xl font-black tracking-tight text-app-text md:text-5xl">{winner?.flag} {winner?.name || t.board.winnerPending}</h2>
                  <p className="mt-3 text-base text-app-muted">{t.board.winnerSubtitle}</p>
                  {winnerResult && (
                    <div className="mt-8 grid w-full max-w-sm grid-cols-2 gap-3">
                      <div className="rounded-2xl border border-app-border bg-app-card/70 px-5 py-4">
                        <p className="text-xs uppercase tracking-[0.3em] text-app-muted/70">{isTotalScoring ? (t.board.winnerScoreTotal || t.board.winnerScore) : (t.board.winnerScorePhase || t.board.winnerScore)}</p>
                        <p className="mt-2 text-3xl font-mono text-app-text">{winnerScoreValue.toFixed(2)}</p>
                      </div>
                      <div className="rounded-2xl border border-app-border bg-app-card/70 px-5 py-4">
                        <p className="text-xs uppercase tracking-[0.3em] text-app-muted/70">{t.board.winnerPhaseLabel}</p>
                        <p className="mt-2 text-base text-app-text">{winnerPhaseName}</p>
                      </div>
                    </div>
                  )}
                  {isHost && canUndoPhase && (
                    <button
                      type="button"
                      onClick={() => undoPhaseAdvance().catch(() => {})}
                      className="scoring-btn-secondary mt-8 inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold uppercase tracking-widest"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      {t.board.reopenFinal}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Scoring table */}
              <div className="flex-1 overflow-auto">
                {tableParticipants.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-app-muted/50 gap-2 p-4">
                    <Search className="w-10 h-10 opacity-20" />
                    <p className="text-sm text-center">{currentPhaseIndex === 0 ? t.board.useSearchToAdd : t.board.noParticipantsPhase}</p>
                  </div>
                ) : (
                  <table className="w-full text-sm md:text-base">
                    <thead className="bg-app-border/30 sticky top-0 border-b border-app-border text-[10px] md:text-xs tracking-wider text-app-muted/70 uppercase">
                      <tr>
                        <th className="font-normal py-2 md:py-3 pl-2 md:pl-3 pr-1 w-5 md:w-6 text-center">#</th>
                        <th className="font-normal py-2 md:py-3 px-2 text-left">{t.board.contestantHeader}</th>
                         <th className="font-normal py-2 md:py-3 px-2 text-center w-36 md:w-52 bg-app-border/40 border-x border-app-border/50">{t.board.yourScoreHeader}</th>
                        {isHost && <th className="font-normal py-2 md:py-3 pr-2 md:pr-3 w-20 md:w-28"></th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-app-border/50">
                      {tableParticipants.map((p, idx) => {
                        const isAbsent = Boolean(p.isAbsent);
                        const hasScore = p.myScore !== undefined && p.myScore !== null;
                        const isQualified = shouldShowCutPreview ? qualifiedIds.has(p.id) : true;
                        const sliderValue = scoreDrafts[p.id] ?? (hasScore ? String(p.myScore) : '0');
                        const displayScore = Number.parseFloat(sliderValue);
                        const showScoreValue = Number.isFinite(displayScore);

                        return (
                          <tr key={p.id} className={`transition-all duration-300 ${shouldShowCutPreview && !isQualified ? 'opacity-40 grayscale-[50%]' : 'hover:bg-app-border/30'}`} style={shouldShowCutPreview && !isQualified ? { backgroundColor: 'var(--color-app-danger-soft)' } : undefined}>
                            <td className="py-2 md:py-4 pl-2 md:pl-4 pr-1 md:pr-2 text-center">
                              <span className={`text-[10px] md:text-xs font-mono font-bold ${idx === 0 ? 'text-app-accent' : isQualified ? 'text-app-text' : 'text-app-muted/50'}`}>{idx + 1}</span>
                            </td>
                            <td className="py-1.5 md:py-3 px-2">
                              <div className="flex items-center gap-1.5 md:gap-2">
                                <span className="text-lg md:text-xl">{p.flag}</span>
                                <span className={`text-xs md:text-sm font-medium truncate ${isQualified ? 'text-app-text' : 'text-app-muted/70'}`}>{p.name}</span>
                              </div>
                            </td>
                            <td className="py-1.5 md:py-3 px-1.5 md:px-3 bg-app-border/10 border-x border-app-border/20 text-center">
                              {isAbsent ? (
                                <span className="inline-flex items-center rounded-full border border-amber-300/30 bg-amber-500/10 px-2.5 py-1 text-[10px] md:text-xs font-bold uppercase tracking-widest text-amber-300">
                                  {t.board.absentBadge}
                                </span>
                              ) : (
                                <div className="flex items-center gap-2 md:gap-3">
                                  <input
                                    type="range"
                                    min="0"
                                    max="10"
                                    step="0.01"
                                    value={sliderValue}
                                    onChange={e => queueScoreSave(p.id, e.target.value)}
                                    onMouseUp={e => flushScoreSave(p.id, e.currentTarget.value)}
                                    onTouchEnd={e => flushScoreSave(p.id, e.currentTarget.value)}
                                    onBlur={e => flushScoreSave(p.id, e.target.value)}
                                    className="h-2.5 flex-1 cursor-pointer appearance-none rounded-full bg-app-border accent-app-accent"
                                    aria-label={`${t.board.yourScoreHeader}: ${p.name}`}
                                  />
                                  <input
                                    type="number"
                                    min="0"
                                    max="10"
                                    step="0.01"
                                    value={sliderValue}
                                    onChange={e => queueScoreSave(p.id, e.target.value)}
                                    onBlur={e => {
                                      const val = parseFloat(e.target.value);
                                      if (!isNaN(val)) {
                                        const clamped = Math.min(Math.max(val, 0), 10).toFixed(2);
                                        queueScoreSave(p.id, clamped);
                                        flushScoreSave(p.id, clamped);
                                      } else {
                                        flushScoreSave(p.id, e.target.value);
                                      }
                                    }}
                                    className="w-12 h-7 md:w-16 md:h-9 bg-app-card border border-app-border rounded-lg text-center font-mono text-xs md:text-sm focus:outline-none focus:border-app-accent transition-colors"
                                    placeholder="0.00"
                                  />
                                </div>
                              )}
                            </td>
                            {isHost && (
                              <td className="py-1.5 md:py-3 pr-2 md:pr-3 text-center">
                                {currentPhaseIndex === 0 ? (
                                  <button onClick={() => removeParticipant(p.id)} className="text-app-muted/30 transition-colors p-1 hover:opacity-80" style={{ color: 'var(--color-app-danger)' }} title={t.board.removeParticipant} aria-label={`${t.board.removeParticipant}: ${p.name}`}>
                                    <X className="w-3.5 h-3.5 md:w-4 md:h-4" />
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => toggleParticipantAbsent(p.id)}
                                    className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] md:text-xs font-bold uppercase tracking-widest transition-colors ${
                                      isAbsent
                                        ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                                        : 'border-amber-300/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
                                    }`}
                                    title={isAbsent ? t.board.markPresent : t.board.markAbsent}
                                    aria-label={`${isAbsent ? t.board.markPresent : t.board.markAbsent}: ${p.name}`}
                                  >
                                    {isAbsent ? <UserCheck className="w-3 h-3" /> : <UserX className="w-3 h-3" />}
                                    {isAbsent ? t.board.markPresent : t.board.markAbsent}
                                  </button>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Advance button (host only) */}
              {isHost && (currentParticipants.length > 0 || currentPhaseIndex > 0) && (
                <div className="p-2 md:p-4 border-t border-app-border bg-app-card shrink-0">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="text-xs text-app-muted/70 space-y-1">
                      <span style={votedJudges === judges.length ? { color: 'var(--color-app-success)' } : undefined}>{t.board.judgesCompleted(votedJudges, judges.length)}</span>
                      {!isSessionComplete && currentPhaseIndex > 0 && undoAttempted && currentPhaseHasSavedScores && (
                        <p style={{ color: 'var(--color-app-danger)' }}>{t.board.undoPhaseWarning}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 flex-wrap justify-end">
                      {canUndoPhase && !isSessionComplete && (
                        <button
                          type="button"
                          onClick={() => undoPhaseAdvance().catch(() => {})}
                          className={`flex items-center gap-2 px-6 py-5 rounded-lg text-sm font-bold uppercase tracking-widest transition-all ${
                            undoAttempted && currentPhaseHasSavedScores
                              ? 'scoring-btn-danger animate-pulse'
                              : 'scoring-btn-secondary'
                          }`}
                        >
                          <RotateCcw className="w-4 h-4" />
                          {undoAttempted && currentPhaseHasSavedScores ? t.board.confirmUndoPhase : t.board.undoPhase}
                        </button>
                      )}
                      {canAdvance && (
                        <button
                          onClick={handlePhaseAction}
                          className={`flex items-center gap-2 px-6 py-5 rounded-lg text-sm font-bold uppercase tracking-widest transition-all ${
                            forceAttempted
                              ? 'scoring-btn-danger animate-pulse'
                              : allJudgesComplete
                                ? 'scoring-btn-primary'
                                : 'scoring-btn-secondary'
                          }`}
                        >
                          {forceAttempted ? (
                            <><AlertTriangle className="w-4 h-4" /> {isFinalRound ? t.board.forceViewWinner(pendingVotesCount) : t.board.forceAdvance(pendingVotesCount)}</>
                          ) : (
                            <><ChevronRight className="w-4 h-4" /> {isFinalRound ? t.board.viewWinner : t.board.advancePhase}</>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* RIGHT PANEL: RESULTADOS GLOBALES (CARD) - 40% */}
        <div className={`${activeTab !== 'results' ? 'hidden lg:flex' : 'flex'} lg:w-[40%] flex flex-col overflow-hidden shrink-0 bg-app-card rounded-2xl shadow-xl border border-app-border`}>
          <div className="px-6 py-5 border-b border-app-border/50 bg-app-card shrink-0">
            <h3 className="text-xs font-bold tracking-widest text-app-muted/70 uppercase">{isTotalScoring ? (t.board.resultsPanelTitleTotal || t.board.globalResults) : (t.board.resultsPanelTitlePhase || t.board.globalResults)}</h3>
            <p className="text-[10px] text-app-muted/30 mt-1">{t.board.phasesCompleted(allParticipants.length, phases.filter(p => p.status === 'completed').length)}</p>
            <p className="text-[10px] text-app-muted/50 mt-1">
              {t.board.scoringModeLabel}: {isTotalScoring ? t.board.scoringModeTotal : t.board.scoringModePhase}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="p-3">
              {shouldHideCutInsightsForJudge && (
                <div className="rounded-xl border border-app-border/70 bg-app-card/40 px-4 py-8 text-center">
                  <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-app-border/60 bg-app-border/20 text-app-muted">
                    <Lock className="w-5 h-5" />
                  </div>
                  <p className="text-sm font-semibold text-app-text">{t.board.publicResultsPending}</p>
                  <p className="text-xs text-app-muted/80 mt-2">{t.board.publicJudgesScoring}</p>
                </div>
              )}
              {!shouldHideCutInsightsForJudge && globalResults.length === 0 && (
                <p className="text-sm text-app-muted/50 text-center py-10">{t.board.noGlobalParticipants}</p>
              )}
              {!shouldHideCutInsightsForJudge && globalResults.map((p, idx) => {
                const eliminated = p.eliminated;
                const isWinner = session.winnerId === p.id;
                return (
                  <div key={p.id} className={`flex items-center gap-3 px-3 py-4 mb-2 rounded-xl transition-colors ${
                    isWinner ? 'border border-amber-300/20 bg-amber-300/5' : eliminated ? 'opacity-30' : 'hover:bg-app-border/30'
                  }`}>
                    <div className={`w-6 text-center font-mono text-xs font-bold ${eliminated ? 'text-app-muted/30' : isWinner || idx === 0 ? 'text-app-text' : 'text-app-muted/70'}`}>{idx + 1}</div>
                    <span className={`text-xl ${eliminated ? 'grayscale' : ''}`}>{p.flag}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm truncate ${eliminated ? 'text-app-muted/50 line-through' : isWinner || idx === 0 ? 'text-app-text font-medium' : 'text-app-muted'}`}>{p.name}</p>
                      {isWinner && (
                        <p className="text-[10px] text-amber-200/70 uppercase tracking-tighter">{t.board.winnerTitle}</p>
                      )}
                      {eliminated && (
                        <p className="text-[10px] text-red-400/50">{t.board.eliminatedIn(phases[p.lastActivePhase]?.name || getDefaultPhaseName(p.lastActivePhase, currentLanguage))}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-widest text-app-muted/50 mb-0.5">
                        {isTotalScoring ? (t.board.resultsPanelMetricTotal || t.board.total) : (t.board.resultsPanelMetricPhase || t.board.average)}
                      </p>
                      <p className={`text-sm font-mono font-bold ${eliminated ? 'text-app-muted/30' : 'text-app-text'}`}>{p.displayScore.toFixed(2)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        {/* MOBILE SETTINGS TAB */}
        <div className={`${activeTab !== 'settings' ? 'hidden' : 'flex lg:hidden'} flex-1 flex flex-col overflow-hidden bg-app-card rounded-2xl shadow-xl border border-app-border`}>
          <div className="px-6 py-5 border-b border-app-border/50 bg-app-card shrink-0">
            <h3 className="text-xs font-bold tracking-widest text-app-muted/70 uppercase">{t.board.settingsButton} & {t.board.infoTitle || 'Info'}</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-8 text-center pb-24">
            <div className="space-y-2">
              <p className="text-xs text-app-muted uppercase tracking-widest">{t.board.judgeSingular}</p>
              <p className="text-2xl font-black text-app-text">{judgeName}</p>
              {isHost && <span className="scoring-badge text-[10px] px-2 py-1 rounded inline-block mt-2">{t.board.hostBadge}</span>}
            </div>

            <div className="space-y-4 pt-4 border-t border-app-border/50">
              <div>
                <p className="text-[10px] text-app-muted uppercase tracking-widest mb-1">{t.board.sessionCode || 'Código de Sesión'}</p>
                <div className="flex items-center justify-center gap-2">
                  <code className="text-xl font-mono text-app-accent font-bold tracking-widest">{session.id}</code>
                  <button onClick={copyCode} className="p-2 text-app-muted/50 transition-colors hover:text-app-text">
                    {codeCopied ? <Check className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5" />}
                  </button>
                </div>
              </div>
              {isHost && (
                <div className="flex items-center justify-center gap-2">
                  <button onClick={copyPublicResultsLink} className="scoring-btn-icon flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold">
                    {resultsLinkCopied ? <Check className="w-4 h-4 text-green-500" /> : <Link2 className="w-4 h-4" />}
                    {resultsLinkCopied ? t.board.linkCopied : t.board.copyPublicLink}
                  </button>
                  <button onClick={openPublicResults} className="scoring-btn-icon flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold">
                    <ExternalLink className="w-4 h-4" />
                    {t.board.openInNewTab}
                  </button>
                </div>
              )}
            </div>

            <div className="pt-6 space-y-3">
              <button 
                onClick={() => {
                  const newTheme = theme === 'dark' ? 'light' : 'dark';
                  setTheme(newTheme);
                  persistScoringTheme(newTheme);
                }}
                className="w-full flex items-center justify-center gap-3 py-4 rounded-xl border border-app-border bg-app-border/10 text-sm font-bold uppercase tracking-widest"
              >
                {theme === 'dark' ? <><Sun className="w-4 h-4" /> {t.board.themeToggle} (Light)</> : <><Moon className="w-4 h-4" /> {t.board.themeToggle} (Dark)</>}
              </button>
              
              {isHost && (
                <button onClick={() => setIsSettingsModalOpen(true)} className="w-full flex items-center justify-center gap-3 py-4 rounded-xl border border-app-border bg-app-border/10 text-sm font-bold uppercase tracking-widest">
                  <Settings2 className="w-4 h-4" />
                  {t.board.settingsButton}
                </button>
              )}

              <button 
                onClick={() => { localStorage.removeItem('judgeName'); navigate('/'); }}
                className="w-full flex items-center justify-center gap-3 py-4 rounded-xl border border-app-danger/20 bg-app-danger/5 text-app-danger text-sm font-bold uppercase tracking-widest"
              >
                <LogOut className="w-4 h-4" />
                {t.board.exitSession}
              </button>
            </div>
            
            <div className="pt-8">
              <p className="text-[10px] text-app-muted/30">Pageants App v1.0.0</p>
            </div>
          </div>
        </div>
      </div>

      {/* MOBILE BOTTOM NAVIGATION */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-app-card/95 backdrop-blur-lg border-t border-app-border flex items-center justify-around py-1.5 md:py-3 px-2 z-[60] shadow-[0_-10px_20px_rgba(0,0,0,0.1)]">
        <button 
          onClick={() => setActiveTab('scoring')} 
          className={`flex flex-col items-center gap-1 min-w-[70px] transition-colors ${activeTab === 'scoring' ? 'text-app-accent' : 'text-app-muted/60'}`}
        >
          <div className={`p-1.5 rounded-lg transition-colors ${activeTab === 'scoring' ? 'bg-app-accent/10' : ''}`}>
            <ClipboardList className="w-6 h-6" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-tighter">{t.board.scoringTitle || 'Votar'}</span>
        </button>
        
        <button 
          onClick={() => setActiveTab('results')} 
          className={`flex flex-col items-center gap-1 min-w-[70px] transition-colors ${activeTab === 'results' ? 'text-app-accent' : 'text-app-muted/60'}`}
        >
          <div className={`p-1.5 rounded-lg transition-colors ${activeTab === 'results' ? 'bg-app-accent/10' : ''}`}>
            <Trophy className="w-6 h-6" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-tighter">{t.board.resultsTitle || 'Resultados'}</span>
        </button>

        <button 
          onClick={() => setActiveTab('settings')} 
          className={`flex flex-col items-center gap-1 min-w-[70px] transition-colors ${activeTab === 'settings' ? 'text-app-accent' : 'text-app-muted/60'}`}
        >
          <div className={`p-1.5 rounded-lg transition-colors ${activeTab === 'settings' ? 'bg-app-accent/10' : ''}`}>
            <Settings className="w-6 h-6" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-tighter">{t.board.moreTitle || 'Más'}</span>
        </button>
      </div>

      {/* MODALS */}
      <PhaseReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        session={session}
        scores={scores}
        phases={phases}
        currentPhaseIndex={currentPhaseIndex}
        getPhaseParticipants={getPhaseParticipants}
        rankParticipantsByPhaseScores={rankParticipantsByPhaseScores}
        language={currentLanguage}
        globalResults={globalResults}
        winner={winner}
        winnerResult={winnerResult}
        winnerPhaseName={winnerPhaseName}
      />
      <SessionSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        session={session}
        language={currentLanguage}
        onRenameSession={renameSession}
        onExpelJudge={expelJudge}
        onApproveJudge={approveJudge}
        onRejectJudge={rejectJudge}
      />
    </div>
  );
}
