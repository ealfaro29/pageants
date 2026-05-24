import { useState, useEffect, useRef, Fragment } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { db } from '../../core/firebase-config.js';
import { deleteDoc, doc, getDoc, onSnapshot, setDoc, updateDoc, arrayUnion, deleteField } from 'firebase/firestore';
import { Copy, Check, Search, Plus, X, ChevronRight, Globe, MapPin, AlertTriangle, Crown, BarChart3, Sun, Moon, RotateCcw, Settings2, LogOut, ClipboardList, Trophy, Settings, UserCheck, UserX, ExternalLink, Link2 } from 'lucide-react';
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
import { parseParticipantsFromBulkList } from './bulkParticipantParser';

function normalizeUpperLabel(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleUpperCase();
}

function getDefaultPhase(language) {
  return { name: normalizeUpperLabel(getDefaultPhaseName(0, language)), cutoff: null, participantIds: null, absentParticipantIds: null, status: 'active' };
}

function normalizePhase(phase, index, currentPhaseIndex, language) {
  const cutoff = Number.parseInt(phase?.cutoff, 10);
  const normalizedStatus = ['completed', 'active', 'pending'].includes(phase?.status)
    ? phase.status
    : index === currentPhaseIndex
      ? 'active'
      : 'completed';
  const participantIds = Array.isArray(phase?.participantIds)
    ? phase.participantIds.filter(id => typeof id === 'string' && id.trim())
    : null;
  const absentParticipantIds = Array.isArray(phase?.absentParticipantIds)
    ? phase.absentParticipantIds.filter(id => typeof id === 'string' && id.trim())
    : null;

  return {
    ...(phase && typeof phase === 'object' ? phase : {}),
    name: normalizeUpperLabel(typeof phase?.name === 'string' && phase.name.trim() ? phase.name : getDefaultPhaseName(index, language)),
    cutoff: Number.isFinite(cutoff) && cutoff > 0 ? cutoff : null,
    participantIds: participantIds?.length ? participantIds : null,
    absentParticipantIds: absentParticipantIds?.length ? absentParticipantIds : null,
    status: normalizedStatus,
    resultsPublished: Boolean(phase?.resultsPublished) || normalizedStatus === 'completed'
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

function isSameJudge(left, right) {
  return normalizeJudgeIdentity(left) === normalizeJudgeIdentity(right);
}

function getJudgeSubmissionKey(judgeName) {
  return normalizeJudgeIdentity(judgeName).replace(/[^a-z0-9_-]/g, '_');
}

function getVotingJudges(sessionData) {
  const includeHostVote = sessionData?.hostCanVote !== false;
  const hostName = sessionData?.host;
  const judges = Array.isArray(sessionData?.judges) ? sessionData.judges : [];
  if (includeHostVote) return judges;
  return judges.filter(judge => normalizeJudgeIdentity(judge) !== normalizeJudgeIdentity(hostName));
}

function getFirstBackupJudge(sessionData) {
  const hostName = sessionData?.host;
  const judges = getVotingJudges(sessionData);
  return judges.find(judge => !isSameJudge(judge, hostName)) || null;
}

function getValidTimestamp(value) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
}

function getHostPresenceFallback(sessionData) {
  return getValidTimestamp(sessionData?.hostLastSeenAt)
    || getValidTimestamp(sessionData?.createdAt)
    || Date.now();
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

function isPhaseResultPublished(phase) {
  return Boolean(phase?.resultsPublished) || phase?.status === 'completed';
}

function normalizeParticipantName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

const FLAG_REGEX = /[\u{1F1E6}-\u{1F1FF}]{2}/gu;
const HOST_PRESENCE_INTERVAL_MS = 3 * 60 * 1000;
const HOST_INACTIVE_THRESHOLD_MS = 6 * 60 * 1000;
const HOST_PRESENCE_CHECK_MS = 30 * 1000;

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
  const [submitReminderAttempted, setSubmitReminderAttempted] = useState(false);
  const [scoreDrafts, setScoreDrafts] = useState({});
  const [ownSubmittedScoreSheet, setOwnSubmittedScoreSheet] = useState({});
  const [isSubmittingScores, setIsSubmittingScores] = useState(false);
  const [submitScoreError, setSubmitScoreError] = useState('');
  const [submissionOverrides, setSubmissionOverrides] = useState({});
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [theme, setTheme] = useState(getStoredScoringTheme());
  const [accentColor] = useState(getStoredScoringAccent());
  const [activeTab, setActiveTab] = useState('scoring'); // 'scoring', 'results', 'settings'
  const [isCutoffModalOpen, setIsCutoffModalOpen] = useState(false);
  const [cutoffModalValue, setCutoffModalValue] = useState('');
  const [cutoffModalMax, setCutoffModalMax] = useState(0);
  const [cutoffModalError, setCutoffModalError] = useState('');
  const [isAdvancingPhase, setIsAdvancingPhase] = useState(false);

  // Search state
  const [countries, setCountries] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [cities, setCities] = useState([]);
  const [selectedParentCountry, setSelectedParentCountry] = useState(null);
  const [phaseNameDraft, setPhaseNameDraft] = useState('');
  const [loadingCities, setLoadingCities] = useState(false);
  const [isBulkListOpen, setIsBulkListOpen] = useState(false);
  const [bulkListRawText, setBulkListRawText] = useState('');
  const [bulkListPreview, setBulkListPreview] = useState([]);
  const [bulkListSkipped, setBulkListSkipped] = useState([]);
  const [bulkListTotalLines, setBulkListTotalLines] = useState(0);
  const [bulkListParseAttempted, setBulkListParseAttempted] = useState(false);
  const [isBulkApplying, setIsBulkApplying] = useState(false);
  const [isSkippedReviewOpen, setIsSkippedReviewOpen] = useState(false);
  const [bulkSkippedDrafts, setBulkSkippedDrafts] = useState([]);
  const searchRef = useRef(null);
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

  useEffect(() => {
    setBulkListPreview([]);
    setBulkListSkipped([]);
    setBulkSkippedDrafts([]);
    setIsSkippedReviewOpen(false);
    setBulkListTotalLines(0);
    setBulkListParseAttempted(false);
  }, [session?.type, selectedParentCountry?.id]);

  // Click outside
  useEffect(() => {
    const h = e => { if (searchRef.current && !searchRef.current.contains(e.target)) setSearchResults([]); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    setScoreDrafts({});
    setOwnSubmittedScoreSheet({});
    setSubmissionOverrides({});
    setIsSubmittingScores(false);
    setSubmitScoreError('');
    setForceAttempted(false);
    setUndoAttempted(false);
    setSubmitReminderAttempted(false);
  }, [sessionId, judgeName, session?.currentPhaseIndex, session?.status]);

  useEffect(() => {
    setOwnSubmittedScoreSheet({});
    if (!sessionId || !judgeName || !session) return;

    let active = true;
    const requestedPhaseIndex = Number.isInteger(session.currentPhaseIndex) ? session.currentPhaseIndex : 0;
    const normalizedPhases = normalizePhases(session.phases, requestedPhaseIndex, currentLanguage);
    const safePhaseIndex = Math.min(Math.max(requestedPhaseIndex, 0), normalizedPhases.length - 1);
    const submissionKey = getJudgeSubmissionKey(judgeName);
    const legacySheet = normalizedPhases[safePhaseIndex]?.submittedScoreSheets?.[submissionKey] || {};

    getDoc(doc(db, "sessions", sessionId, "submissions", `${safePhaseIndex}_${submissionKey}`))
      .then(snapshot => {
        if (!active) return;
        const nextSheet = snapshot.exists() ? (snapshot.data()?.scores || {}) : legacySheet;
        setOwnSubmittedScoreSheet(nextSheet && typeof nextSheet === 'object' ? nextSheet : {});
      })
      .catch(() => {
        if (active) setOwnSubmittedScoreSheet(legacySheet && typeof legacySheet === 'object' ? legacySheet : {});
      });

    return () => { active = false; };
  }, [sessionId, judgeName, session?.currentPhaseIndex, currentLanguage]);

  useEffect(() => {
    judgeRegistrationAttemptedRef.current = false;
  }, [sessionId, judgeName]);

  useEffect(() => {
    if (!session) return;
    const requestedPhaseIndex = Number.isInteger(session.currentPhaseIndex) ? session.currentPhaseIndex : 0;
    const normalizedPhases = normalizePhases(session.phases, requestedPhaseIndex, currentLanguage);
    const safePhaseIndex = Math.min(Math.max(requestedPhaseIndex, 0), normalizedPhases.length - 1);
    const currentPhaseName = normalizedPhases[safePhaseIndex]?.name || getDefaultPhaseName(safePhaseIndex, currentLanguage);
    setPhaseNameDraft(normalizeUpperLabel(currentPhaseName));
  }, [session, currentLanguage]);

  // Session + scores listener
  useEffect(() => {
    if (!sessionId || !judgeName) { if (!judgeName) navigate('/join'); return; }
    const unsubS = onSnapshot(doc(db, "sessions", sessionId), snap => {
      if (!snap.exists()) return;

      const nextSession = snap.data();
      const isHostJudge = isSameJudge(nextSession.host, judgeName);
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

  useEffect(() => {
    if (!sessionId || !session?.host || !isSameJudge(session.host, judgeName)) return;
    const pingHostPresence = () => {
      if (document.visibilityState === 'hidden') return;
      setDoc(doc(db, "sessions", sessionId, "presence", "host"), {
        host: session.host,
        lastSeenAt: Date.now()
      }, { merge: true }).catch(() => {});
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        pingHostPresence();
      }
    };

    pingHostPresence();
    const timer = setInterval(pingHostPresence, HOST_PRESENCE_INTERVAL_MS);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [sessionId, session?.host, judgeName]);

  useEffect(() => {
    if (!sessionId || !session) return;
    if (isSameJudge(judgeName, session.host)) return;
    if (!judgeListIncludes(getVotingJudges(session), judgeName)) return;

    const currentControlHost = session.controlHost || session.host;
    const hostIsCurrentController = isSameJudge(currentControlHost, session.host);
    if (!hostIsCurrentController) return;

    const firstBackupJudge = getFirstBackupJudge(session);
    if (!firstBackupJudge) return;
    if (!isSameJudge(firstBackupJudge, judgeName)) return;

    let latestHostSeenAt = getHostPresenceFallback(session);
    let hasPresenceSnapshot = false;
    let transferAttempted = false;

    const tryTransferHostControls = () => {
      if (!hasPresenceSnapshot) return;
      if (transferAttempted) return;
      if (Date.now() - latestHostSeenAt < HOST_INACTIVE_THRESHOLD_MS) return;

      transferAttempted = true;
      updateDoc(doc(db, "sessions", sessionId), {
        controlHost: firstBackupJudge,
        controlHostAssignedAt: Date.now()
      }).catch(() => {
        transferAttempted = false;
      });
    };

    const unsubscribePresence = onSnapshot(doc(db, "sessions", sessionId, "presence", "host"), snapshot => {
      hasPresenceSnapshot = true;
      if (snapshot.exists()) {
        const lastSeenAt = getValidTimestamp(snapshot.data()?.lastSeenAt);
        if (lastSeenAt) {
          latestHostSeenAt = lastSeenAt;
        }
      } else {
        latestHostSeenAt = getHostPresenceFallback(session);
      }
      tryTransferHostControls();
    }, () => {});

    const timer = setInterval(tryTransferHostControls, HOST_PRESENCE_CHECK_MS);
    tryTransferHostControls();

    return () => {
      unsubscribePresence();
      clearInterval(timer);
    };
  }, [sessionId, session, judgeName]);

  // --- Actions ---
  const canCurrentJudgeVote = () => {
    if (!isJudgeApproved) return false;
    if (judgeListIncludes(session?.removedJudges, judgeName) && session?.host !== judgeName) return false;
    if (session?.hostCanVote === false && judgeName === session?.host) return false;
    return true;
  };

  const getSubmissionDocRef = (phaseIndex, targetJudgeName = judgeName) => (
    doc(db, "sessions", sessionId, "submissions", `${phaseIndex}_${getJudgeSubmissionKey(targetJudgeName)}`)
  );

  const loadSubmittedScoreSheets = async (phaseIndex, submittedJudges) => {
    const phase = phases[phaseIndex] || {};
    const legacySheets = phase.submittedScoreSheets && typeof phase.submittedScoreSheets === 'object'
      ? { ...phase.submittedScoreSheets }
      : {};

    const nextSheets = { ...legacySheets };
    await Promise.all((submittedJudges || []).map(async judge => {
      const submissionKey = getJudgeSubmissionKey(judge);
      if (nextSheets[submissionKey]) return;

      try {
        const snapshot = await getDoc(getSubmissionDocRef(phaseIndex, judge));
        const scores = snapshot.exists() ? snapshot.data()?.scores : null;
        if (scores && typeof scores === 'object') {
          nextSheets[submissionKey] = scores;
        }
      } catch {
        // Missing submission docs should not block host fallback/force behavior.
      }
    }));

    return nextSheets;
  };

  const markCurrentPhaseSubmissionDirty = () => {
    if (!canCurrentJudgeVote() || isSessionComplete) return;
    const currentPhaseKey = `phase_${currentPhaseIndex}`;
    const phaseSubmittedJudges = Array.isArray(currentPhase?.submittedJudges) ? currentPhase.submittedJudges : [];
    const currentlySubmitted = submissionOverrides[currentPhaseKey] ?? judgeListIncludes(phaseSubmittedJudges, judgeName);
    if (!currentlySubmitted) return;

    setSubmissionOverrides(prev => ({ ...prev, [currentPhaseKey]: false }));
    setOwnSubmittedScoreSheet({});
    deleteDoc(getSubmissionDocRef(currentPhaseIndex)).catch(() => {});
    const submissionKey = getJudgeSubmissionKey(judgeName);
    const nextPhases = getNextPhasesWithUpdate(currentPhaseIndex, phase => {
      const nextSubmittedJudges = (phase.submittedJudges || []).filter(
        judge => normalizeJudgeIdentity(judge) !== normalizeJudgeIdentity(judgeName)
      );
      const nextScoreSheets = { ...(phase.submittedScoreSheets || {}) };
      delete nextScoreSheets[submissionKey];

      return {
        ...phase,
        submittedJudges: nextSubmittedJudges,
        submittedScoreSheets: Object.keys(nextScoreSheets).length ? nextScoreSheets : {}
      };
    });

    updateDoc(doc(db, "sessions", session.id), { phases: nextPhases }).catch(() => {});
  };

  const queueScoreSave = (participantId, value) => {
    setScoreDrafts(prev => ({ ...prev, [participantId]: value }));
    setSubmitScoreError('');
    markCurrentPhaseSubmissionDirty();
  };

  const flushScoreSave = (participantId, fallbackValue) => {
    const nextValue = scoreDrafts[participantId] ?? fallbackValue ?? '';
    setScoreDrafts(prev => ({ ...prev, [participantId]: nextValue }));
    setSubmitScoreError('');
    markCurrentPhaseSubmissionDirty();
  };

  const mergeCurrentJudgeDraftScores = (phaseScores, phaseParticipants, votingJudges) => {
    if (!judgeListIncludes(votingJudges, judgeName)) return phaseScores;

    let changed = false;
    const nextPhaseScores = { ...phaseScores };
    phaseParticipants.forEach(participant => {
      if (!(participant.id in scoreDrafts)) return;

      const parsed = Number.parseFloat(scoreDrafts[participant.id]);
      if (!Number.isFinite(parsed)) return;

      nextPhaseScores[participant.id] = { ...(nextPhaseScores[participant.id] || {}) };
      nextPhaseScores[participant.id][judgeName] = Math.min(Math.max(parsed, 0), 10);
      changed = true;
    });

    return changed ? nextPhaseScores : phaseScores;
  };

  const submitCurrentJudgeScores = async () => {
    if (!canCurrentJudgeVote() || isSessionComplete || currentParticipants.length === 0) return;

    const missingScores = currentParticipants.reduce((count, participant) => {
      const raw = scoreDrafts[participant.id] ?? phaseScores[participant.id]?.[judgeName] ?? ownSubmittedScoreSheet[participant.id];
      const parsed = Number.parseFloat(raw);
      const valid = Number.isFinite(parsed) && parsed >= 0 && parsed <= 10;
      return valid ? count : count + 1;
    }, 0);

    if (missingScores > 0) {
      setSubmitScoreError(t.board.submitScoresIncomplete(missingScores));
      return;
    }

    setSubmitScoreError('');
    setIsSubmittingScores(true);
    const currentPhaseKey = `phase_${currentPhaseIndex}`;

    try {
      const judgeSubmissionPayload = {};
      currentParticipants.forEach(participant => {
        const raw = scoreDrafts[participant.id] ?? phaseScores[participant.id]?.[judgeName] ?? ownSubmittedScoreSheet[participant.id];
        const parsed = Number.parseFloat(raw);
        const clamped = Math.min(Math.max(parsed, 0), 10);
        judgeSubmissionPayload[participant.id] = clamped;
      });

      const nextPhases = getNextPhasesWithUpdate(currentPhaseIndex, phase => {
        const submittedJudges = Array.isArray(phase.submittedJudges) ? phase.submittedJudges : [];
        const nextSubmittedJudges = judgeListIncludes(submittedJudges, judgeName)
          ? submittedJudges
          : [...submittedJudges, judgeName];

        return {
          ...phase,
          submittedJudges: nextSubmittedJudges
        };
      });

      await setDoc(getSubmissionDocRef(currentPhaseIndex), {
        phaseIndex: currentPhaseIndex,
        judgeName,
        scores: judgeSubmissionPayload,
        submittedAt: Date.now()
      }, { merge: true });
      await updateDoc(doc(db, "sessions", session.id), { phases: nextPhases });

      setOwnSubmittedScoreSheet(judgeSubmissionPayload);
      setSubmissionOverrides(prev => ({ ...prev, [currentPhaseKey]: true }));
    } catch {
      setSubmitScoreError(t.board.submitScoresError);
    } finally {
      setIsSubmittingScores(false);
    }
  };

  const addParticipant = async (item) => {
    const participants = session.participants || [];
    const nextParticipant = buildNumberedParticipant(item, participants, session.type === 'Global' ? 'country' : 'city');
    await updateDoc(doc(db, "sessions", session.id), {
      participants: [...participants, nextParticipant]
    });
    setSearchQuery(''); setSearchResults([]);
  };

  const parseBulkList = () => {
    const { parsed, skipped, totalLines } = parseParticipantsFromBulkList({
      rawText: bulkListRawText,
      sessionType: session?.type || 'Global',
      countries,
      selectedParentCountry
    });

    setBulkListPreview(parsed);
    setBulkListSkipped(skipped);
    setBulkSkippedDrafts(skipped.map((item, index) => ({
      id: `skipped-${Date.now()}-${index}`,
      line: item.line,
      value: item.value
    })));
    setIsSkippedReviewOpen(false);
    setBulkListTotalLines(totalLines);
    setBulkListParseAttempted(true);
  };

  const updateSkippedDraftLine = (id, value) => {
    setBulkSkippedDrafts(prev => prev.map(item => item.id === id ? { ...item, value } : item));
  };

  const removeSkippedDraftLine = (id) => {
    setBulkSkippedDrafts(prev => prev.filter(item => item.id !== id));
  };

  const cleanManualSkippedLine = (rawLine) => {
    const normalized = normalizeUpperLabel(
      String(rawLine || '')
        .replace(/^\s*\d+\s*[.)-]?\s*/, '')
        .replace(/CE\s*#?\s*\d+/gi, '')
        .trim()
    );
    if (!normalized) return null;

    const foundFlags = String(rawLine || '').match(FLAG_REGEX) || [];
    const fallbackFlag = session?.type === 'Global' ? (foundFlags[0] || '🏳️') : (selectedParentCountry?.flag || '');
    return {
      name: normalized,
      id: `manual-${normalized.replace(/\s+/g, '').toUpperCase()}-${Math.random().toString(36).slice(2, 8)}`,
      flag: fallbackFlag
    };
  };

  const submitSkippedLinesAsIs = () => {
    const manualItems = bulkSkippedDrafts
      .map(item => cleanManualSkippedLine(item.value))
      .filter(Boolean);

    if (!manualItems.length) return;

    setBulkListPreview(prev => [...prev, ...manualItems]);
    setBulkListSkipped([]);
    setBulkSkippedDrafts([]);
    setIsSkippedReviewOpen(false);
  };

  const addParticipantsFromBulkList = async () => {
    if (!bulkListPreview.length || !session?.id) return;

    const participants = session.participants || [];
    const candidates = bulkListPreview.filter(item => normalizeParticipantName(item?.name));
    if (!candidates.length) return;

    setIsBulkApplying(true);
    try {
      let nextParticipants = [...participants];
      candidates.forEach(item => {
        nextParticipants.push(buildNumberedParticipant(item, nextParticipants, session.type === 'Global' ? 'country' : 'city'));
      });

      await updateDoc(doc(db, "sessions", session.id), { participants: nextParticipants });
      setBulkListRawText('');
      setBulkListPreview([]);
      setBulkListSkipped([]);
      setBulkSkippedDrafts([]);
      setIsSkippedReviewOpen(false);
      setBulkListTotalLines(0);
      setBulkListParseAttempted(false);
      setIsBulkListOpen(false);
    } finally {
      setIsBulkApplying(false);
    }
  };

  const buildManualSearchCandidate = (rawName) => {
    const name = normalizeUpperLabel(rawName);
    if (!name) return null;

    return {
      name,
      id: name.replace(/\s+/g, '').toUpperCase(),
      flag: session?.type === 'Global' ? '🏳️' : (selectedParentCountry?.flag || '')
    };
  };

  const addParticipantFromSearch = async (item, restoreValue = '') => {
    if (!item) return;
    setSearchQuery('');
    setSearchResults([]);

    try {
      await addParticipant(item);
    } catch {
      setSearchQuery(restoreValue || item.name || '');
    }
  };

  const removeParticipant = async (id) => {
    await updateDoc(doc(db, "sessions", session.id), {
      participants: (session.participants || []).filter(p => p.id !== id)
    });
  };

  const updatePhaseName = async (name) => {
    const normalizedName = normalizeUpperLabel(name);
    if (!normalizedName || normalizedName === currentPhase.name) return;

    const nextPhases = getNextPhasesWithUpdate(currentPhaseIndex, phase => ({
      ...phase,
      name: normalizedName
    }));
    await updateDoc(doc(db, "sessions", session.id), { phases: nextPhases });
  };

  const commitPhaseName = () => {
    const normalizedName = normalizeUpperLabel(phaseNameDraft);
    if (!normalizedName) {
      setPhaseNameDraft(currentPhase.name);
      return;
    }
    setPhaseNameDraft(normalizedName);
    updatePhaseName(normalizedName).catch(() => {
      setPhaseNameDraft(currentPhase.name);
    });
  };

  const updatePhaseCutoff = async (value) => {
    const num = parseInt(value);
    const nextPhases = getNextPhasesWithUpdate(currentPhaseIndex, phase => ({
      ...phase,
      cutoff: isNaN(num) || num <= 0 ? null : num
    }));
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

    const nextPhases = getNextPhasesWithUpdate(currentPhaseIndex, phase => ({
      ...phase,
      absentParticipantIds: nextAbsentIds.length ? nextAbsentIds : null
    }));
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

  const reclaimHostControls = async () => {
    if (!session?.host || !isSameJudge(judgeName, session.host)) return;
    const now = Date.now();
    await setDoc(doc(db, "sessions", sessionId, "presence", "host"), {
      host: session.host,
      lastSeenAt: now
    }, { merge: true });
    await updateDoc(doc(db, "sessions", session.id), {
      controlHost: session.host,
      controlHostAssignedAt: now
    });
  };

  const getNextPhasesWithUpdate = (phaseIndex, updater) => {
    const nextPhases = [...phases];
    while (nextPhases.length <= phaseIndex) {
      nextPhases.push(getDefaultPhase(currentLanguage));
    }

    nextPhases[phaseIndex] = updater({ ...(nextPhases[phaseIndex] || getDefaultPhase(currentLanguage)) });
    return nextPhases;
  };

  const advancePhase = async (cutoffOverride = null) => {
    if (isAdvancingPhase) return;
    setIsAdvancingPhase(true);
    const phaseKey = `phase_${currentPhaseIndex}`;
    let phaseScores = { ...(scores[phaseKey] || {}) };
    const currentParticipants = getPhaseParticipants(currentPhaseIndex);
    const judges = getVotingJudges(session);
    const effectiveCutoff = Number.isFinite(cutoffOverride) && cutoffOverride > 0
      ? cutoffOverride
      : currentPhase.cutoff;
    const submittedJudges = Array.isArray(currentPhase?.submittedJudges) ? currentPhase.submittedJudges : [];
    const submittedScoreSheets = await loadSubmittedScoreSheets(currentPhaseIndex, submittedJudges);

    judges.forEach(judge => {
      if (!judgeListIncludes(submittedJudges, judge)) return;
      const sheet = submittedScoreSheets[getJudgeSubmissionKey(judge)];
      if (!sheet || typeof sheet !== 'object') return;
      currentParticipants.forEach(participant => {
        const parsed = Number.parseFloat(sheet[participant.id]);
        if (!Number.isFinite(parsed)) return;
        phaseScores[participant.id] = { ...(phaseScores[participant.id] || {}) };
        phaseScores[participant.id][judge] = Math.min(Math.max(parsed, 0), 10);
      });
    });
    phaseScores = mergeCurrentJudgeDraftScores(phaseScores, currentParticipants, judges);

    const hasNonHostJudges = judges.some(j => normalizeJudgeIdentity(j) !== normalizeJudgeIdentity(session.host));

    // If only host is voting, skip judge-completion checks
    const allComplete = !hasNonHostJudges || currentParticipants.every(p => {
      const pScores = phaseScores[p.id] || {};
      return judges.every(j => pScores[j] !== undefined && pScores[j] !== null);
    });

    if (!allComplete && !forceAttempted) {
      setForceAttempted(true);
      setIsAdvancingPhase(false);
      return; // Show warning, next click will force
    }

    // Force: fill missing scores with 1
    if (!allComplete) {
      const nextPhaseScores = { ...phaseScores };
      currentParticipants.forEach(p => {
        nextPhaseScores[p.id] = { ...(nextPhaseScores[p.id] || {}) };
        judges.forEach(j => {
          if (!phaseScores[p.id]?.[j] && phaseScores[p.id]?.[j] !== 0) {
            nextPhaseScores[p.id][j] = 1;
          }
        });
      });
      phaseScores = nextPhaseScores;
    }

    try {
      await setDoc(doc(db, "sessions", `${sessionId}_scores`), {
        [phaseKey]: phaseScores
      }, { merge: true });

    // Mark current phase complete, add new phase
    const nextPhases = [...phases];
    const rankedCurrentParticipants = rankParticipantsByPhaseScores(currentParticipants, phaseScores);
    const qualifiedParticipants = rankedCurrentParticipants.slice(0, effectiveCutoff || rankedCurrentParticipants.length);

    nextPhases[currentPhaseIndex] = {
      ...nextPhases[currentPhaseIndex],
      cutoff: effectiveCutoff || null,
      status: 'completed',
      resultsPublished: true,
      participantIds: currentParticipants.map(participant => participant.id)
    };
    const newPhaseIndex = currentPhaseIndex + 1;
    nextPhases[newPhaseIndex] = {
      ...(nextPhases[newPhaseIndex] || {}),
      name: nextPhases[newPhaseIndex]?.name || getDefaultPhaseName(newPhaseIndex, currentLanguage),
      cutoff: null,
      status: 'active',
      resultsPublished: false,
      submittedJudges: [],
      submittedScoreSheets: {},
      absentParticipantIds: null,
      participantIds: qualifiedParticipants.map(participant => participant.id)
    };

      await updateDoc(doc(db, "sessions", session.id), {
        phases: nextPhases,
        currentPhaseIndex: newPhaseIndex
      });
      setForceAttempted(false);
    } finally {
      setIsAdvancingPhase(false);
    }
  };

  const revealWinner = async (cutoffOverride = null) => {
    if (isAdvancingPhase) return;
    setIsAdvancingPhase(true);
    const phaseKey = `phase_${currentPhaseIndex}`;
    let phaseScores = { ...(scores[phaseKey] || {}) };
    const currentParticipants = getPhaseParticipants(currentPhaseIndex);
    const judges = getVotingJudges(session);
    const effectiveCutoff = Number.isFinite(cutoffOverride) && cutoffOverride > 0
      ? cutoffOverride
      : currentPhase.cutoff;
    const submittedJudges = Array.isArray(currentPhase?.submittedJudges) ? currentPhase.submittedJudges : [];
    const submittedScoreSheets = await loadSubmittedScoreSheets(currentPhaseIndex, submittedJudges);

    judges.forEach(judge => {
      if (!judgeListIncludes(submittedJudges, judge)) return;
      const sheet = submittedScoreSheets[getJudgeSubmissionKey(judge)];
      if (!sheet || typeof sheet !== 'object') return;
      currentParticipants.forEach(participant => {
        const parsed = Number.parseFloat(sheet[participant.id]);
        if (!Number.isFinite(parsed)) return;
        phaseScores[participant.id] = { ...(phaseScores[participant.id] || {}) };
        phaseScores[participant.id][judge] = Math.min(Math.max(parsed, 0), 10);
      });
    });
    phaseScores = mergeCurrentJudgeDraftScores(phaseScores, currentParticipants, judges);

    const hasNonHostJudges = judges.some(j => normalizeJudgeIdentity(j) !== normalizeJudgeIdentity(session.host));
    const allComplete = !hasNonHostJudges || currentParticipants.every(participant => {
      const participantScores = phaseScores[participant.id] || {};
      return judges.every(judge => participantScores[judge] !== undefined && participantScores[judge] !== null);
    });

    if (!allComplete && !forceAttempted) {
      setForceAttempted(true);
      setIsAdvancingPhase(false);
      return;
    }

    if (!allComplete) {
      const nextPhaseScores = { ...phaseScores };
      currentParticipants.forEach(participant => {
        nextPhaseScores[participant.id] = { ...(nextPhaseScores[participant.id] || {}) };
        judges.forEach(judge => {
          if (!phaseScores[participant.id]?.[judge] && phaseScores[participant.id]?.[judge] !== 0) {
            nextPhaseScores[participant.id][judge] = 1;
          }
        });
      });
      phaseScores = nextPhaseScores;
    }

    try {
      await setDoc(doc(db, "sessions", `${sessionId}_scores`), {
        [phaseKey]: phaseScores
      }, { merge: true });

    const rankedCurrentParticipants = rankParticipantsByPhaseScores(currentParticipants, phaseScores);
    const scoreSnapshot = { ...scores, [phaseKey]: phaseScores };
    const winnerCandidates = rankedCurrentParticipants.map(participant => {
      const cumulativeStats = getParticipantScoreStatsByPhases(
        participant.id,
        [...completedPhaseIndexes.filter(idx => idx < currentPhaseIndex), currentPhaseIndex],
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
      resultsPublished: true,
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
    } finally {
      setIsAdvancingPhase(false);
    }
  };

  const openCutoffModal = (maxAllowed) => {
    setCutoffModalMax(maxAllowed);
    setCutoffModalValue(String(maxAllowed));
    setCutoffModalError('');
    setIsCutoffModalOpen(true);
  };

  const closeCutoffModal = () => {
    setIsCutoffModalOpen(false);
    setCutoffModalError('');
  };

  const executePhaseAction = async (selectedCutoff) => {
    if (!selectedCutoff) return;
    if (selectedCutoff === 1) {
      revealWinner(selectedCutoff).catch(() => {});
      return;
    }
    advancePhase(selectedCutoff).catch(() => {});
  };

  const handlePhaseAction = async () => {
    if (isAdvancingPhase) return;
    setUndoAttempted(false);
    if (pendingSubmitJudges.length > 0 && !submitReminderAttempted) {
      setSubmitReminderAttempted(true);
      return;
    }
    const existingCutoff = Number.parseInt(currentPhase.cutoff, 10);
    if (Number.isFinite(existingCutoff) && existingCutoff > 0) {
      executePhaseAction(existingCutoff);
      return;
    }
    const maxAllowed = currentParticipants.length;
    if (!maxAllowed) return;
    openCutoffModal(maxAllowed);
  };

  const submitCutoffModal = async () => {
    const parsed = Number.parseInt(cutoffModalValue, 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > cutoffModalMax) {
      setCutoffModalError(t.board.invalidCutoffPrompt(cutoffModalMax));
      return;
    }

    await updatePhaseCutoff(String(parsed));
    closeCutoffModal();
    executePhaseAction(parsed);
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

  const controlHost = session.controlHost || session.host;
  const isHost = isSameJudge(controlHost, judgeName);
  const isOriginalHost = isSameJudge(session.host, judgeName);
  const isJudgeRemoved = !isHost && !isOriginalHost && judgeListIncludes(session.removedJudges, judgeName);
  const allParticipants = session.participants || [];
  const judges = getVotingJudges(session);
  const pendingJudgeRequests = session.pendingJudges || [];
  const hasPendingJudgeRequests = isHost && pendingJudgeRequests.length > 0;
  const isJudgeApproved = isOriginalHost || isHost || judgeListIncludes(judges, judgeName);
  const isJudgePendingApproval = !isOriginalHost && !isHost && judgeListIncludes(pendingJudgeRequests, judgeName);
  const requestedPhaseIndex = Number.isInteger(session.currentPhaseIndex) ? session.currentPhaseIndex : 0;
  const phases = normalizePhases(session.phases, requestedPhaseIndex, currentLanguage);
  const currentPhaseIndex = Math.min(Math.max(requestedPhaseIndex, 0), phases.length - 1);
  const currentPhase = phases[currentPhaseIndex] || getDefaultPhase(currentLanguage);
  const participantMap = new Map(allParticipants.map(participant => [participant.id, participant]));
  const phaseKey = `phase_${currentPhaseIndex}`;
  const phaseScores = scores[phaseKey] || {};
  const phaseSubmittedJudges = Array.isArray(currentPhase.submittedJudges) ? currentPhase.submittedJudges : [];
  const currentPhaseSubmissionSheets = currentPhase?.submittedScoreSheets && typeof currentPhase.submittedScoreSheets === 'object'
    ? currentPhase.submittedScoreSheets
    : {};

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
  const currentJudgeSubmissionSheet = Object.keys(ownSubmittedScoreSheet).length > 0
    ? ownSubmittedScoreSheet
    : (currentPhaseSubmissionSheets[getJudgeSubmissionKey(judgeName)] || {});
  const scoredParticipants = currentParticipants.map(p => {
    const pScores = phaseScores[p.id] || {};
    const vals = Object.values(pScores).filter(v => v !== null && v !== undefined);
    const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    const myScore = pScores[judgeName] ?? currentJudgeSubmissionSheet[p.id];
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

  // Check completion for advance button
  const hasNonHostJudges = judges.some(judge => normalizeJudgeIdentity(judge) !== normalizeJudgeIdentity(session.host));
  const judgeHasSubmittedPhase = (judge) => {
    return judgeListIncludes(phaseSubmittedJudges, judge);
  };

  const allJudgesComplete = !hasNonHostJudges || (judges.length > 0 && judges.every(judge => judgeHasSubmittedPhase(judge)));
  const votedJudges = !hasNonHostJudges
    ? judges.length
    : judges.filter(judge => judgeHasSubmittedPhase(judge)).length;
  const pendingSubmitJudges = !hasNonHostJudges ? [] : judges.filter(judge => !judgeHasSubmittedPhase(judge));
  const pendingVotesCount = Math.max(judges.length - votedJudges, 0);
  const judgeCompletionRatio = judges.length > 0 ? Math.min(votedJudges / judges.length, 1) : 1;
  const isFinalRound = currentPhase.cutoff === 1;
  const isSessionComplete = session.status === 'completed' && Boolean(session.winnerId);
  const hostVotingDisabledForCurrentUser = session.hostCanVote === false && isOriginalHost;
  const hasTransferredControls = !isSameJudge(controlHost, session.host);
  const showTransferredControlsNotice = isHost && hasTransferredControls;
  const showReclaimControlsNotice = isOriginalHost && hasTransferredControls;
  const completedPhaseIndexes = phases
    .map((phase, idx) => (isPhaseResultPublished(phase) ? idx : null))
    .filter(idx => idx !== null);
  const lastCompletedPhaseIndex = completedPhaseIndexes.length > 0
    ? completedPhaseIndexes[completedPhaseIndexes.length - 1]
    : null;
  const lastCompletedPhase = lastCompletedPhaseIndex !== null ? phases[lastCompletedPhaseIndex] : null;
  const canUndoPhase = isHost && (currentPhaseIndex > 0 || isSessionComplete);
  const currentPhaseHasSavedScores = phaseHasSavedScores(currentPhaseIndex);
  const currentUserCanSubmitScores = canCurrentJudgeVote() && !isSessionComplete && currentParticipants.length > 0;
  const currentUserSubmittedPhase = currentUserCanSubmitScores
    ? (submissionOverrides[phaseKey] ?? judgeListIncludes(phaseSubmittedJudges, judgeName))
    : false;

  const undoPhaseAdvance = async () => {
    setForceAttempted(false);

    if (isSessionComplete) {
      const reopenedPhases = [...phases];
      reopenedPhases[currentPhaseIndex] = {
        ...reopenedPhases[currentPhaseIndex],
        status: 'active',
        resultsPublished: isPhaseResultPublished(reopenedPhases[currentPhaseIndex])
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
    const rewoundPhases = phases.map((phase, index) => {
      const published = isPhaseResultPublished(phase);

      if (index === previousPhaseIndex) {
        return { ...phase, status: 'active', resultsPublished: published };
      }

      if (phase.status === 'active') {
        return { ...phase, status: published ? 'completed' : 'pending', resultsPublished: published };
      }

      if (index > previousPhaseIndex && !published) {
        return { ...phase, status: 'pending', resultsPublished: false };
      }

      return { ...phase, resultsPublished: published };
    });

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
      completedPhaseIndexes,
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
  const lastSubmittedResults = lastCompletedPhaseIndex !== null
    ? rankParticipantsByPhaseScores(
      getPhaseParticipants(lastCompletedPhaseIndex),
      scores[`phase_${lastCompletedPhaseIndex}`] || {}
    )
    : [];
  const lastSubmittedCutoff = lastCompletedPhase?.cutoff || lastSubmittedResults.length;
  const lastSubmittedQualifiedIds = new Set(
    lastSubmittedResults.slice(0, lastSubmittedCutoff).map(participant => participant.id)
  );

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
      <header className="min-h-10 md:min-h-12 border-b border-app-border/60 bg-app-card/80 backdrop-blur-md flex items-center justify-between gap-2 md:gap-3 px-2 md:px-5 py-1.5 md:py-2 flex-shrink-0 z-20 flex-wrap">
        <div className="flex items-center gap-1.5 md:gap-3 min-w-0 flex-wrap">
          {session.type === 'Global' ? <Globe className="w-3 md:w-4 h-3 md:h-4 text-app-muted/70 shrink-0" /> : <MapPin className="w-3 md:w-4 h-3 md:h-4 text-app-muted/70 shrink-0" />}
          <h1 className="text-xs sm:text-sm md:text-base font-bold text-app-text tracking-tight truncate max-w-[160px] sm:max-w-[280px] md:max-w-none">{session.name}</h1>
          <span className="text-[10px] md:text-xs text-app-muted/50 bg-app-border/30 px-1.5 md:px-2 py-0.5 rounded border border-app-border shrink-0">{getSessionTypeLabel(session.type, currentLanguage)}</span>
          <span className="hidden sm:inline text-[10px] md:text-xs text-app-muted/50 shrink-0">{judges.length} {judges.length === 1 ? t.board.judgeSingular : t.board.judgePlural}</span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0 flex-wrap justify-end">
          {isHost && (
            <>
              <button onClick={openPublicResults} className="scoring-btn-icon hidden lg:flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium" title={t.board.openInNewTab} aria-label={t.board.openInNewTab}>
                <ExternalLink className="w-3 h-3" />
                {t.board.publicResultsLabel}
              </button>
              <button onClick={copyPublicResultsLink} className="scoring-btn-icon hidden lg:flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium" title={t.board.copyPublicLink} aria-label={t.board.copyPublicLink}>
                {resultsLinkCopied ? <Check className="w-3 h-3 text-green-500" /> : <Link2 className="w-3 h-3" />}
                {resultsLinkCopied ? t.board.linkCopied : t.board.copyPublicLink}
              </button>
              <button onClick={() => setIsSettingsModalOpen(true)} className="scoring-btn-icon hidden lg:flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium">
                <Settings2 className="w-3 h-3" />
                {t.board.settingsButton}
              </button>
              <button onClick={() => setIsReportModalOpen(true)} className="scoring-btn-icon hidden lg:flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium">
                <BarChart3 className="w-3 h-3" />
                {t.board.reportsButton}
              </button>
            </>
          )}
          <button onClick={copyCode} className="scoring-btn-icon flex items-center gap-1 px-2 py-1 rounded text-[10px] sm:text-xs font-mono tracking-widest" title={t.board.copyCode}>
            {session.id}
            {codeCopied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
          </button>
          <div className="hidden lg:flex items-center gap-2">
            <span className="text-sm text-app-muted max-w-[120px] truncate">{judgeName}</span>
            {isHost && <span className="scoring-badge text-[10px] px-1.5 py-0.5 rounded">{t.board.hostBadge}</span>}
            <button onClick={() => {
              const newTheme = theme === 'dark' ? 'light' : 'dark';
              setTheme(newTheme);
              persistScoringTheme(newTheme);
            }} className="scoring-btn-icon p-1.5 rounded" title={t.board.themeToggle} aria-label={t.board.themeToggle}>
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
          </div>
          <div className="hidden lg:block h-4 w-px bg-app-border/50 mx-1" />
          <button onClick={() => { localStorage.removeItem('judgeName'); navigate('/'); }} className="hidden lg:inline-flex scoring-btn-icon p-1.5 rounded-full text-app-danger hover:bg-app-danger/10" title={t.board.exitSession} aria-label={t.board.exitSession}>
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {showTransferredControlsNotice && (
        <div className="px-3 sm:px-4 pt-3">
          <div className="rounded-xl border border-cyan-300/30 bg-cyan-500/10 px-4 py-3">
            <p className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.12em] sm:tracking-[0.2em] text-cyan-200">
              {t.board.controlsTransferredNotice(controlHost)}
            </p>
            <p className="text-sm text-app-text mt-1">{t.board.controlsTransferredPrompt}</p>
          </div>
        </div>
      )}

      {showReclaimControlsNotice && (
        <div className="px-3 sm:px-4 pt-3">
          <div className="rounded-xl border border-app-accent/35 bg-app-accent/10 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.12em] sm:tracking-[0.2em] text-app-accent">
                {t.board.controlsTransferredNotice(controlHost)}
              </p>
              <p className="text-sm text-app-text mt-1">{t.board.controlsTransferredPrompt}</p>
            </div>
            <button
              type="button"
              onClick={() => reclaimHostControls().catch(() => {})}
              className="scoring-btn-primary rounded-lg h-10 px-4 text-xs font-bold uppercase tracking-widest"
            >
              {t.board.reclaimHostControls}
            </button>
          </div>
        </div>
      )}

      {hasPendingJudgeRequests && (
        <div className="px-3 sm:px-4 pt-3">
          <div className="rounded-xl border border-amber-300/35 bg-amber-500/10 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.12em] sm:tracking-[0.2em] text-amber-200">{t.board.pendingRequestsNotice(pendingJudgeRequests.length)}</p>
                <p className="text-sm text-app-text mt-1">{t.board.pendingRequestPrompt(pendingJudgeRequests[0])}</p>
              </div>
              <div className="flex w-full sm:w-auto items-center gap-2">
                <button
                  type="button"
                  onClick={() => approveJudge(pendingJudgeRequests[0]).catch(() => {})}
                  className="rounded-lg border border-emerald-300/30 bg-emerald-500/15 px-3 py-2 text-xs font-bold uppercase tracking-widest text-emerald-200 hover:bg-emerald-500/25 transition-colors flex-1 sm:flex-none"
                >
                  {t.board.approveFromNotice}
                </button>
                <button
                  type="button"
                  onClick={() => rejectJudge(pendingJudgeRequests[0]).catch(() => {})}
                  className="rounded-lg border border-red-300/30 bg-red-500/15 px-3 py-2 text-xs font-bold uppercase tracking-widest text-red-200 hover:bg-red-500/25 transition-colors flex-1 sm:flex-none"
                >
                  {t.board.rejectFromNotice}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MAIN CONTENT AREA with GAP */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 gap-3 md:gap-4 p-3 md:p-4 pb-[calc(env(safe-area-inset-bottom,0px)+5rem)] lg:pb-4 overflow-hidden">
        
        {/* LEFT: TABLERO DE PUNTUACIÓN (CARD) - 60% */}
        <div className={`lg:w-[66%] xl:w-[68%] flex flex-col min-h-0 bg-app-card rounded-2xl shadow-xl border border-app-border overflow-hidden ${activeTab !== 'scoring' ? 'hidden lg:flex' : 'flex'} ${isSessionComplete ? 'bg-gradient-to-br from-app-card to-app-border/10' : ''}`}>
          {/* Phase header */}
          <div className="px-2.5 md:px-3 py-2 border-b border-app-border/50 bg-app-card/50 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              {isHost ? (
                <input
                  type="text" value={phaseNameDraft}
                  onChange={e => setPhaseNameDraft(e.target.value)}
                  onBlur={commitPhaseName}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitPhaseName();
                      e.currentTarget.blur();
                    }
                    if (e.key === 'Escape') {
                      setPhaseNameDraft(currentPhase.name);
                      e.currentTarget.blur();
                    }
                  }}
                  className="h-9 min-w-0 flex-1 rounded-lg border border-transparent bg-app-border/15 px-2.5 text-sm sm:text-base font-black uppercase tracking-tight text-app-text transition-colors focus:outline-none focus:border-app-accent focus:bg-app-card"
                  placeholder={t.board.phaseNamePlaceholder}
                />
              ) : (
                <h2 className="min-w-0 flex-1 truncate text-sm sm:text-base font-black uppercase tracking-tight text-app-text">{currentPhase.name}</h2>
              )}
              {isHost && (
                <div
                  className="shrink-0 rounded-lg border border-app-accent/35 bg-app-accent/10 px-2 py-1 shadow-[0_0_0_1px_var(--color-app-accent-muted)]"
                  title={t.board.classifyHint}
                >
                  <label className="flex items-center gap-1.5">
                    <span className="text-[9px] text-app-muted/90 uppercase tracking-[0.18em] font-black">{t.board.classifyLabel}</span>
                    <span className="inline-flex h-1.5 w-1.5 rounded-full bg-app-accent" />
                  </label>
                  <input
                    type="number" min="1" max={currentParticipants.length || 99}
                    value={currentPhase.cutoff || ''}
                    onChange={e => updatePhaseCutoff(e.target.value)}
                    placeholder="—"
                    aria-label={t.board.classifyLabel}
                    className="mt-0.5 h-6 w-12 bg-transparent text-center font-mono text-base font-black text-app-text focus:outline-none"
                  />
                </div>
              )}
            </div>
            {phases.length > 1 && (
              <div className="mt-1.5 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
                {/* Phase nav pills (completed + current) */}
                {phases.map((ph, i) => (
                  <div key={i} className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    i === currentPhaseIndex ? 'scoring-badge-active' :
                    isPhaseResultPublished(ph) ? 'bg-app-border text-app-muted/70' : 'bg-app-border/30 text-app-muted/50'
                  }`}>
                    {ph.name}
                    {isPhaseResultPublished(ph) && <span className="ml-1 text-app-muted/50">✓</span>}
                  </div>
                ))}
              </div>
            )}
            {!isHost && currentPhase.cutoff && (
              <p className="mt-1 text-[11px] text-app-muted/50">{t.board.classifySummary(currentPhase.cutoff, currentParticipants.length)}</p>
            )}
          </div>

          {/* Search bar (host, first phase only for adding) */}
          {isHost && currentPhaseIndex === 0 && !isSessionComplete && (
            <div className="px-2.5 md:px-3 py-2 border-b border-app-border/30 bg-app-card/30 shrink-0">
              {session.type === 'Nacional' && !selectedParentCountry && (
                <div className="relative mb-2" ref={searchRef}>
                  <div className="relative">
                      <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                        onKeyDown={e => {
                          const isEnter = e.key === 'Enter' || e.code === 'Enter' || e.keyCode === 13;
                          if (isEnter && searchResults.length === 1) {
                            e.preventDefault();
                            setSelectedParentCountry(searchResults[0]);
                            setSearchQuery('');
                            setSearchResults([]);
                            e.currentTarget.blur();
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
                <>
                  <div className="flex items-center gap-2">
                    <div className="relative min-w-0 flex-1" ref={searchRef}>
                    <div className="relative">
                      <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                        onKeyDown={e => {
                          const isEnter = e.key === 'Enter' || e.code === 'Enter' || e.keyCode === 13;
                          if (!isEnter) return;

                          e.preventDefault();
                          const queryValue = searchQuery.trim();
                          const selected = searchResults.length === 1
                            ? searchResults[0]
                            : buildManualSearchCandidate(queryValue);

                          if (!selected) return;
                          e.currentTarget.blur();
                          addParticipantFromSearch(selected, queryValue).catch(() => {});
                        }}
                        disabled={session.type === 'Nacional' && loadingCities}
                        placeholder={session.type === 'Global' ? t.board.addCountryPlaceholder : loadingCities ? t.board.loadingCities : t.board.addCityPlaceholder}
                        className="scoring-input h-9 w-full rounded-lg pl-9 pr-3 text-sm disabled:opacity-40" />
                      <Search className="w-4 h-4 text-app-muted/70 absolute left-3 top-2.5" />
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
                            <button key={c.id} onClick={() => addParticipantFromSearch(c, c.name).catch(() => {})}
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
                            onClick={() => addParticipantFromSearch(buildManualSearchCandidate(searchQuery), searchQuery).catch(() => {})}
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
                          <button onClick={() => addParticipantFromSearch(buildManualSearchCandidate(searchQuery), searchQuery).catch(() => {})}
                            className="scoring-btn-primary text-xs px-4 py-2 rounded-lg font-bold uppercase tracking-widest">
                            {t.board.addManualEntry(searchQuery)}
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsBulkListOpen(prev => !prev)}
                      className={`h-9 shrink-0 rounded-lg px-2.5 text-[10px] font-black uppercase tracking-widest inline-flex items-center justify-center gap-1.5 ${isBulkListOpen ? 'scoring-btn-primary' : 'scoring-btn-secondary'}`}
                      title={t.board.bulkAddButton}
                      aria-label={t.board.bulkAddButton}
                    >
                      <ClipboardList className="w-3.5 h-3.5" />
                      <span className="sm:hidden">{t.board.bulkAddShort || t.board.bulkAddButton}</span>
                      <span className="hidden sm:inline">{t.board.bulkAddButton}</span>
                    </button>
                  </div>
                  {isBulkListOpen && (
                    <div className="mt-2 rounded-xl border border-app-border/70 bg-app-card/55 p-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-app-muted/85">{t.board.bulkAddTitle}</p>
                        <button
                          type="button"
                          onClick={() => setIsBulkListOpen(false)}
                          className="text-[11px] text-app-muted/80 hover:text-app-text"
                        >
                          {t.board.bulkAddClose}
                        </button>
                      </div>
                      <p className="mt-1 text-[11px] text-app-muted/75">{t.board.bulkAddHelp}</p>
                      <textarea
                        value={bulkListRawText}
                        onChange={e => setBulkListRawText(e.target.value)}
                        placeholder={session.type === 'Global' ? t.board.bulkAddPlaceholderGlobal : t.board.bulkAddPlaceholderNational}
                        className="mt-2 scoring-input w-full rounded-lg min-h-20 p-2.5 text-xs leading-5 resize-y"
                      />
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={parseBulkList}
                          className="scoring-btn-secondary rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest"
                        >
                          {t.board.bulkAddPreviewButton}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setBulkListRawText('');
                            setBulkListPreview([]);
                            setBulkListSkipped([]);
                            setBulkListTotalLines(0);
                            setBulkListParseAttempted(false);
                          }}
                          className="scoring-btn-secondary rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest"
                        >
                          {t.board.bulkAddClear}
                        </button>
                        <button
                          type="button"
                          disabled={!bulkListPreview.length || isBulkApplying}
                          onClick={() => addParticipantsFromBulkList().catch(() => {})}
                          className="scoring-btn-primary rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest disabled:opacity-35"
                        >
                          {isBulkApplying ? t.board.bulkAddApplying : t.board.bulkAddApply(bulkListPreview.length)}
                        </button>
                      </div>
                      {bulkListParseAttempted && (
                        <div className="mt-2 rounded-lg border border-app-border/60 bg-app-card/35 p-2.5">
                          <p className="text-xs text-app-text">
                            {t.board.bulkAddPreviewSummary(bulkListPreview.length, bulkListTotalLines, bulkListSkipped.length)}
                          </p>
                          {bulkListPreview.length > 0 && (
                            <div className="mt-2 max-h-24 overflow-auto space-y-1 custom-scrollbar">
                              {bulkListPreview.map(item => (
                                <div key={`preview-${item.name}-${item.id}`} className="text-xs text-app-muted/90">
                                  {item.flag ? `${item.flag} ` : ''}{item.name}
                                </div>
                              ))}
                            </div>
                          )}
                          {bulkListSkipped.length > 0 && (
                            <div className="mt-2">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-[11px] text-app-muted/80 uppercase tracking-wider">{t.board.bulkAddSkippedTitle}</p>
                                <button
                                  type="button"
                                  onClick={() => setIsSkippedReviewOpen(true)}
                                  className="scoring-btn-secondary rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest"
                                >
                                  {t.board.bulkAddReviewSkipped(bulkListSkipped.length)}
                                </button>
                              </div>
                              <div className="mt-1 max-h-16 overflow-auto space-y-1 custom-scrollbar">
                                {bulkListSkipped.slice(0, 8).map(item => (
                                  <div key={`skip-${item.line}-${item.value}`} className="text-[11px] text-app-muted/70">
                                    {t.board.bulkAddSkippedLine(item.line)}: {item.value}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
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
                        <th className="font-normal py-2 md:py-3 px-2 text-center w-28 md:w-52 bg-app-border/40 border-x border-app-border/50">{t.board.yourScoreHeader}</th>
                        {isHost && <th className="font-normal py-2 md:py-3 pr-2 md:pr-3 w-16 md:w-28"></th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-app-border/50">
	                      {tableParticipants.map((p, idx) => {
	                        const isAbsent = Boolean(p.isAbsent);
	                        const hasScore = p.myScore !== undefined && p.myScore !== null;
	                        const scoreInputValue = scoreDrafts[p.id] ?? (hasScore ? String(p.myScore) : '');
	                        const sliderValue = scoreInputValue === '' ? '0' : scoreInputValue;

	                        return (
	                          <tr key={p.id} className="transition-all duration-300 hover:bg-app-border/30">
	                            <td className="py-2 md:py-4 pl-2 md:pl-4 pr-1 md:pr-2 text-center">
	                              <span className={`text-[10px] md:text-xs font-mono font-bold ${idx === 0 ? 'text-app-accent' : 'text-app-text'}`}>{idx + 1}</span>
	                            </td>
	                            <td className="py-1.5 md:py-3 px-2">
	                              <div className="flex items-center gap-1.5 md:gap-2">
	                                <span className="text-lg md:text-xl">{p.flag}</span>
	                                <span className="text-xs md:text-sm font-medium truncate text-app-text">{p.name}</span>
	                              </div>
	                            </td>
                            <td className="py-1.5 md:py-3 px-1.5 md:px-3 bg-app-border/10 border-x border-app-border/20 text-center">
                              {isAbsent ? (
                                <span className="inline-flex items-center rounded-full border border-amber-300/30 bg-amber-500/10 px-2.5 py-1 text-[10px] md:text-xs font-bold uppercase tracking-widest text-amber-300">
                                  {t.board.absentBadge}
                                </span>
                              ) : hostVotingDisabledForCurrentUser ? (
                                <span className="inline-flex items-center rounded-full border border-app-border/60 bg-app-card px-2.5 py-1 text-[10px] md:text-xs font-bold uppercase tracking-widest text-app-muted/80">
                                  {t.board.hostNotVotingLabel}
                                </span>
                              ) : (
                                <div className="flex items-center gap-1.5 md:gap-3">
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
                                    value={scoreInputValue}
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
                                    className="w-14 h-8 md:w-16 md:h-9 bg-app-card border border-app-border rounded-lg text-center font-mono text-xs md:text-sm focus:outline-none focus:border-app-accent transition-colors"
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
                                    className={`inline-flex items-center gap-1 rounded-lg border px-1.5 sm:px-2 py-1 text-[10px] md:text-xs font-bold uppercase tracking-widest transition-colors ${
                                      isAbsent
                                        ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                                        : 'border-amber-300/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
                                    }`}
                                    title={isAbsent ? t.board.markPresent : t.board.markAbsent}
                                    aria-label={`${isAbsent ? t.board.markPresent : t.board.markAbsent}: ${p.name}`}
                                  >
                                    {isAbsent ? <UserCheck className="w-3 h-3" /> : <UserX className="w-3 h-3" />}
                                    <span className="hidden sm:inline">{isAbsent ? t.board.markPresent : t.board.markAbsent}</span>
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

              {currentUserCanSubmitScores && (
                <div className="px-3 py-2 shrink-0 border-t border-app-border/60 bg-app-card/90">
                  <div className="flex items-center gap-3 flex-wrap">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-app-muted/75">{t.board.submitScores}</p>
                    <p className={`text-[10px] font-bold uppercase tracking-[0.14em] ${currentUserSubmittedPhase ? 'text-emerald-300' : 'text-amber-300'}`}>
                      {currentUserSubmittedPhase ? t.board.submitScoresStatusSubmitted : t.board.submitScoresStatusDraft}
                    </p>
                    <button
                      type="button"
                      disabled={isSubmittingScores}
                      onClick={() => submitCurrentJudgeScores().catch(() => {})}
                      className="w-full sm:w-auto sm:ml-auto scoring-btn-primary rounded-lg h-9 px-4 text-[10px] font-bold uppercase tracking-widest disabled:opacity-35"
                    >
                      {isSubmittingScores
                        ? t.board.submitScoresBusy
                        : currentUserSubmittedPhase
                          ? t.board.resubmitScores
                          : t.board.submitScores}
                    </button>
                  </div>
                  {submitScoreError && (
                    <p className="mt-1 text-[11px] text-red-300">{submitScoreError}</p>
                  )}
                </div>
              )}

              {/* Advance button (host only) */}
              {isHost && (currentParticipants.length > 0 || currentPhaseIndex > 0) && (
                <div className="px-3 py-2 shrink-0 border-t border-app-border/60 bg-app-card/95">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="text-xs text-app-muted/80 space-y-1 flex-1 min-w-[220px]">
                      <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-app-muted/70">
                        {t.board.judgesCompleted(votedJudges, judges.length)}
                      </p>
                      <div className="h-1.5 max-w-[320px] rounded-full bg-app-border/60 overflow-hidden">
                        <div className="h-full rounded-full bg-app-accent transition-all" style={{ width: `${Math.round(judgeCompletionRatio * 100)}%` }} />
                      </div>
                      {submitReminderAttempted && pendingSubmitJudges.length > 0 && (
                        <p className="text-[11px]" style={{ color: 'var(--color-app-warning)' }}>
                          {t.board.pendingSubmitList(pendingSubmitJudges.join(', '))}
                        </p>
                      )}
                      {!isSessionComplete && currentPhaseIndex > 0 && undoAttempted && currentPhaseHasSavedScores && (
                        <p className="text-[11px]" style={{ color: 'var(--color-app-danger)' }}>{t.board.undoPhaseWarning}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end w-full sm:w-auto">
                      {canUndoPhase && !isSessionComplete && (
                        <button
                          type="button"
                          onClick={() => undoPhaseAdvance().catch(() => {})}
                          className={`w-full sm:w-auto justify-center flex items-center gap-2 px-4 py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-widest transition-all ${
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
                          disabled={isAdvancingPhase}
                          className={`w-full sm:w-auto justify-center flex items-center gap-2 px-4 py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-widest transition-all ${
                            forceAttempted
                              ? 'scoring-btn-danger animate-pulse'
                              : allJudgesComplete
                                ? 'scoring-btn-primary'
                                : 'scoring-btn-secondary'
                          } ${isAdvancingPhase ? 'opacity-60 pointer-events-none' : ''}`}
                        >
                          {isAdvancingPhase ? (
                            <>{t.board.advancingPhaseBusy}</>
                          ) : forceAttempted ? (
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
        <div className={`${activeTab !== 'results' ? 'hidden lg:flex' : 'flex'} lg:w-[34%] xl:w-[32%] flex flex-col overflow-hidden shrink-0 bg-app-card rounded-2xl shadow-xl border border-app-border`}>
          <div className="px-6 py-5 border-b border-app-border/50 bg-app-card shrink-0">
            <h3 className="text-xs font-bold tracking-widest text-app-muted/70 uppercase">{t.board.lastSubmittedResultsTitle}</h3>
            <p className="text-[10px] text-app-muted/30 mt-1">{t.board.phasesCompleted(allParticipants.length, phases.filter(isPhaseResultPublished).length)}</p>
            <p className="text-[10px] text-app-muted/50 mt-1">
              {t.board.scoringModeLabel}: {isTotalScoring ? t.board.scoringModeTotal : t.board.scoringModePhase}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="p-3">
              <div className="rounded-xl border border-app-border/70 bg-app-card/40 px-4 py-4">
                {lastCompletedPhase ? (
                  <p className="text-xs text-app-muted/80 mb-3">
                    {t.board.submittedPhaseLabel}: {lastCompletedPhase.name}
                  </p>
                ) : null}
                {lastSubmittedResults.length === 0 ? (
                  <p className="text-sm text-app-muted/70">{t.board.lastSubmittedResultsEmpty}</p>
                ) : (
                  <div className="space-y-2">
                    {lastSubmittedResults.map((participant, idx) => {
                      const isQualified = lastSubmittedQualifiedIds.has(participant.id);
                      return (
                        <div
                          key={`last-submitted-${participant.id}`}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg ${isQualified ? 'bg-app-card/55' : 'bg-app-danger/10 opacity-70'}`}
                        >
                          <div className="w-5 text-center text-xs font-mono font-bold text-app-muted/80">{idx + 1}</div>
                          <span className="text-lg">{participant.flag}</span>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm truncate ${isQualified ? 'text-app-text' : 'text-app-muted/80 line-through'}`}>{participant.name}</p>
                          </div>
                          <p className="text-sm font-mono font-bold text-app-text">{participant.avg.toFixed(2)}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        {/* MOBILE SETTINGS TAB */}
        <div className={`${activeTab !== 'settings' ? 'hidden' : 'flex lg:hidden'} flex-1 flex flex-col overflow-hidden bg-app-card rounded-2xl shadow-xl border border-app-border`}>
          <div className="px-6 py-5 border-b border-app-border/50 bg-app-card shrink-0">
            <h3 className="text-xs font-bold tracking-widest text-app-muted/70 uppercase">{t.board.settingsButton} & {t.board.infoTitle || 'Info'}</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 sm:space-y-8 text-center pb-24">
            <div className="space-y-2">
              <p className="text-xs text-app-muted uppercase tracking-widest">{t.board.judgeSingular}</p>
              <p className="text-2xl font-black text-app-text">{judgeName}</p>
              {isHost && <span className="scoring-badge text-[10px] px-2 py-1 rounded inline-block mt-2">{t.board.hostBadge}</span>}
            </div>

            <div className="space-y-4 pt-4 border-t border-app-border/50">
              <div>
                <p className="text-[10px] text-app-muted uppercase tracking-widest mb-1">{t.board.sessionCode || 'Código de Sesión'}</p>
                <div className="flex items-center justify-center gap-2">
                  <code className="text-lg sm:text-xl font-mono text-app-accent font-bold tracking-widest break-all">{session.id}</code>
                  <button onClick={copyCode} className="p-2 text-app-muted/50 transition-colors hover:text-app-text">
                    {codeCopied ? <Check className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5" />}
                  </button>
                </div>
              </div>
              {isHost && (
                <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
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
              {isHost && (
                <button
                  onClick={() => setIsReportModalOpen(true)}
                  className="w-full flex items-center justify-center gap-3 py-4 rounded-xl border border-app-border bg-app-border/10 text-sm font-bold uppercase tracking-widest"
                >
                  <BarChart3 className="w-4 h-4" />
                  {t.board.reportsButton}
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
      <div
        className="lg:hidden fixed bottom-0 left-0 right-0 bg-app-card/95 backdrop-blur-lg border-t border-app-border flex items-center justify-around py-1.5 md:py-3 px-2 z-[60] shadow-[0_-10px_20px_rgba(0,0,0,0.1)]"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.375rem)' }}
      >
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

      {isSkippedReviewOpen && (
        <div className="fixed inset-0 z-[72] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-app-border bg-app-card p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-black text-app-text">{t.board.bulkAddSkippedModalTitle}</h3>
              <button
                type="button"
                onClick={() => setIsSkippedReviewOpen(false)}
                className="scoring-btn-secondary rounded-lg h-9 px-3 text-[11px] font-bold uppercase tracking-widest"
              >
                {t.board.bulkAddClose}
              </button>
            </div>
            <p className="text-sm text-app-muted/80 mt-2">{t.board.bulkAddSkippedModalHelp}</p>
            <div className="mt-4 max-h-[45vh] overflow-auto space-y-3 pr-1 custom-scrollbar">
              {bulkSkippedDrafts.length === 0 ? (
                <p className="text-sm text-app-muted/70">{t.board.bulkAddSkippedEmpty}</p>
              ) : (
                bulkSkippedDrafts.map(item => (
                  <div key={item.id} className="rounded-xl border border-app-border/60 bg-app-card/35 p-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <p className="text-[10px] uppercase tracking-wider text-app-muted/70">{t.board.bulkAddSkippedLine(item.line)}</p>
                      <button
                        type="button"
                        onClick={() => removeSkippedDraftLine(item.id)}
                        className="scoring-btn-secondary rounded-lg px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-red-300"
                      >
                        {t.board.bulkAddRemoveLine}
                      </button>
                    </div>
                    <textarea
                      value={item.value}
                      onChange={event => updateSkippedDraftLine(item.id, event.target.value)}
                      className="scoring-input w-full rounded-lg min-h-20 p-2.5 text-xs leading-5 resize-y"
                    />
                  </div>
                ))
              )}
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsSkippedReviewOpen(false)}
                className="scoring-btn-secondary rounded-lg h-10 px-3 text-[11px] font-bold uppercase tracking-widest"
              >
                {t.board.bulkAddCancelReview}
              </button>
              <button
                type="button"
                disabled={bulkSkippedDrafts.length === 0}
                onClick={submitSkippedLinesAsIs}
                className="scoring-btn-primary rounded-lg h-10 px-3 text-[11px] font-bold uppercase tracking-widest disabled:opacity-35"
              >
                {t.board.bulkAddSubmitAsIs}
              </button>
            </div>
          </div>
        </div>
      )}

      {isCutoffModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-app-border bg-app-card p-5">
            <h3 className="text-lg font-black text-app-text">{t.board.cutoffModalTitle}</h3>
            <p className="text-sm text-app-muted/80 mt-2">{t.board.cutoffModalBody(cutoffModalMax)}</p>
            <div className="mt-4">
              <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-app-muted/70 mb-2">
                {t.board.cutoffModalInputLabel}
              </label>
              <input
                type="number"
                min="1"
                max={cutoffModalMax || 1}
                value={cutoffModalValue}
                onChange={event => {
                  setCutoffModalValue(event.target.value);
                  setCutoffModalError('');
                }}
                className="scoring-input w-full rounded-lg h-12 px-4 text-lg font-mono font-bold text-center"
                autoFocus
              />
            </div>
            {cutoffModalError && (
              <p className="mt-3 text-xs text-red-300">{cutoffModalError}</p>
            )}
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeCutoffModal}
                className="scoring-btn-secondary rounded-lg h-11 px-4 text-xs font-bold uppercase tracking-widest"
              >
                {t.board.cutoffModalCancel}
              </button>
              <button
                type="button"
                onClick={() => submitCutoffModal().catch(() => {})}
                className="scoring-btn-primary rounded-lg h-11 px-4 text-xs font-bold uppercase tracking-widest"
              >
                {t.board.cutoffModalConfirm}
              </button>
            </div>
          </div>
        </div>
      )}

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
