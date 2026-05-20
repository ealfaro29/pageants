import { useEffect, useState } from 'react';
import { Settings2, Save, X, UserRoundMinus, UserRoundCheck, ShieldX } from 'lucide-react';
import { scoringCopy } from './scoringI18n';
import { getScoringThemeStyleVars, getStoredScoringAccent } from './scoringTheme';

export default function SessionSettingsModal({
  isOpen,
  onClose,
  session,
  language,
  onRenameSession,
  onExpelJudge,
  onApproveJudge,
  onRejectJudge
}) {
  const normalizeJudgeIdentity = value => String(value || '').trim().toLowerCase();
  const [sessionName, setSessionName] = useState(session?.name || '');
  const [isSavingName, setIsSavingName] = useState(false);
  const [expellingJudge, setExpellingJudge] = useState('');
  const [processingPendingJudge, setProcessingPendingJudge] = useState('');
  const [accentColor] = useState(getStoredScoringAccent());
  const t = scoringCopy[language] || scoringCopy.es;
  const settingsCopy = t.board.settings;
  const judges = Array.isArray(session?.judges) ? session.judges : [];
  const pendingJudges = Array.isArray(session?.pendingJudges) ? session.pendingJudges : [];
  const guestJudges = judges.filter(judge => judge !== session?.host);
  const normalizedGuestJudges = guestJudges.map(normalizeJudgeIdentity);
  const pendingJudgeRequests = pendingJudges.filter(
    judge => (
      normalizeJudgeIdentity(judge) !== normalizeJudgeIdentity(session?.host)
      && !normalizedGuestJudges.includes(normalizeJudgeIdentity(judge))
    )
  );

  useEffect(() => {
    if (isOpen) {
      setSessionName(session?.name || '');
      setIsSavingName(false);
      setExpellingJudge('');
      setProcessingPendingJudge('');
    }
  }, [isOpen, session?.name]);

  if (!isOpen || !session) return null;

  const handleSaveName = async (event) => {
    event.preventDefault();
    if (!sessionName.trim() || sessionName.trim() === session.name || isSavingName) return;

    setIsSavingName(true);
    try {
      await onRenameSession(sessionName.trim());
    } finally {
      setIsSavingName(false);
    }
  };

  const handleExpelJudge = async (judge) => {
    if (!judge || expellingJudge) return;

    setExpellingJudge(judge);
    try {
      await onExpelJudge(judge);
    } finally {
      setExpellingJudge('');
    }
  };

  const handleApproveJudge = async (judge) => {
    if (!judge || processingPendingJudge) return;
    setProcessingPendingJudge(judge);
    try {
      await onApproveJudge(judge);
    } finally {
      setProcessingPendingJudge('');
    }
  };

  const handleRejectJudge = async (judge) => {
    if (!judge || processingPendingJudge) return;
    setProcessingPendingJudge(judge);
    try {
      await onRejectJudge(judge);
    } finally {
      setProcessingPendingJudge('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" style={getScoringThemeStyleVars(accentColor)}>
      <div className="scoring-panel rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-app-border/80 bg-app-border/30">
          <h2 className="text-lg font-bold text-app-text flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-app-muted" />
            {settingsCopy.title}
          </h2>
          <button
            onClick={onClose}
            className="scoring-btn-icon p-2 rounded-lg"
            title={settingsCopy.close}
            aria-label={settingsCopy.close}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          <form onSubmit={handleSaveName} className="space-y-3">
            <label className="block text-xs font-bold tracking-widest text-app-muted/80 uppercase">
              {settingsCopy.contestName}
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={sessionName}
                onChange={event => setSessionName(event.target.value)}
                className="scoring-input flex-1 rounded-lg h-12 px-4 text-sm"
                placeholder={settingsCopy.contestPlaceholder}
              />
              <button
                type="submit"
                disabled={!sessionName.trim() || sessionName.trim() === session.name || isSavingName}
                className="scoring-btn-primary h-12 px-5 rounded-lg text-xs font-bold uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                {settingsCopy.saveName}
              </button>
            </div>
          </form>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-bold tracking-widest text-app-muted/80 uppercase">
                {settingsCopy.pendingJudgesTitle}
              </h3>
              <span className="scoring-badge text-[10px] px-2 py-1 rounded-md">
                {pendingJudgeRequests.length}
              </span>
            </div>

            <div className="border border-app-border rounded-xl overflow-hidden">
              <div className="divide-y divide-app-border/70 bg-app-card/60">
                {pendingJudgeRequests.map(judge => (
                  <div key={judge} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-4">
                    <p className="text-sm font-medium text-app-text">{judge}</p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleApproveJudge(judge)}
                        disabled={processingPendingJudge === judge}
                        className="scoring-btn-primary h-10 px-4 rounded-lg text-[10px] font-bold uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                      >
                        <UserRoundCheck className="w-4 h-4" />
                        {settingsCopy.approveJudge}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRejectJudge(judge)}
                        disabled={processingPendingJudge === judge}
                        className="scoring-btn-danger h-10 px-4 rounded-lg text-[10px] font-bold uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                      >
                        <ShieldX className="w-4 h-4" />
                        {settingsCopy.rejectJudge}
                      </button>
                    </div>
                  </div>
                ))}

                {pendingJudgeRequests.length === 0 && (
                  <div className="px-4 py-8 text-center text-sm text-app-muted/80">
                    {settingsCopy.noPendingJudges}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-bold tracking-widest text-app-muted/80 uppercase">
                {settingsCopy.judgesTitle}
              </h3>
              <span className="scoring-badge text-[10px] px-2 py-1 rounded-md">
                {judges.length}
              </span>
            </div>

            <div className="border border-app-border rounded-xl overflow-hidden">
              <div className="divide-y divide-app-border/70 bg-app-card/60">
                <div className="flex items-center justify-between gap-3 px-4 py-4">
                  <div>
                    <p className="text-sm font-semibold text-app-text">{session.host}</p>
                    <p className="text-[10px] uppercase tracking-[0.25em] text-app-muted/70">{settingsCopy.hostBadge}</p>
                  </div>
                  <span className="scoring-badge text-[10px] px-2 py-1 rounded-md">
                    {settingsCopy.hostBadge}
                  </span>
                </div>

                {guestJudges.map(judge => (
                  <div key={judge} className="flex items-center justify-between gap-3 px-4 py-4">
                    <p className="text-sm font-medium text-app-text">{judge}</p>
                    <button
                      type="button"
                      onClick={() => handleExpelJudge(judge)}
                      disabled={expellingJudge === judge}
                      className="scoring-btn-danger h-10 px-4 rounded-lg text-[10px] font-bold uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                    >
                      <UserRoundMinus className="w-4 h-4" />
                      {settingsCopy.expelJudge}
                    </button>
                  </div>
                ))}

                {guestJudges.length === 0 && (
                  <div className="px-4 py-8 text-center text-sm text-app-muted/80">
                    {settingsCopy.noGuestJudges}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
