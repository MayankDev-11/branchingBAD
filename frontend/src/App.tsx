import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { api, USE_MOCK } from './api';
import { buildObsidianNote } from './obsidianExport';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { GraphCanvas } from './components/graph/GraphCanvas';
import { InvestigationPanel } from './components/panel/InvestigationPanel';
import { RecordModal } from './components/modal/RecordModal';
import { NewBranchModal } from './components/modal/NewBranchModal';
import { InsightsView } from './components/InsightsView';
import { HistoryReplayView } from './components/HistoryReplayView';
import {
  ConnectDataView,
  PrivacyView,
  ProfileView,
} from './components/SecondaryViews';
import type {
  AskResponse,
  BranchAction,
  BranchDetailResponse,
  CreateBranchInput,
  GraphResponse,
  InsightsResponse,
  NavView,
  RecordDetailResponse,
  ThemeMode,
  WorkspaceHistoryEntry,
} from './types';

const VALID_THEMES: ThemeMode[] = ['slate-pro', 'teal', 'warm-neuro', 'lab-ivory', 'ppt-light'];

const PAGE_TRANSITION = {
  initial: { opacity: 0, y: 7 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -5 },
  transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const },
};

export const App: React.FC = () => {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('roottrace_theme') as ThemeMode | null;
    return saved && VALID_THEMES.includes(saved) ? saved : 'slate-pro';
  });

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeView, setActiveView] = useState<NavView>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');

  const [graph, setGraph] = useState<GraphResponse | null>(null);
  const [workspaceHistory, setWorkspaceHistory] = useState<WorkspaceHistoryEntry[]>([]);
  const [branchDetailsMap, setBranchDetailsMap] = useState<Record<string, BranchDetailResponse>>({});
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<BranchDetailResponse | null>(null);

  // Record counts come from GET /api/insights (computed in Python), never a hand-typed number.
  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [isDataConnected, setIsDataConnected] = useState(true);
  const totalRecords = isDataConnected ? insights?.coverage.total_observations ?? 0 : 0;

  const [askResult, setAskResult] = useState<AskResponse | null>(null);
  const [askQuestion, setAskQuestion] = useState<string | null>(null);
  const [isAsking, setIsAsking] = useState(false);

  const [modalRecord, setModalRecord] = useState<RecordDetailResponse | null>(null);
  const [modalTab, setModalTab] = useState<'raw' | 'ai'>('raw');
  const [askAuditModalOpen, setAskAuditModalOpen] = useState(false);

  const [newBranchOpen, setNewBranchOpen] = useState(false);
  const [newBranchMode, setNewBranchMode] = useState<'manual' | 'voice'>('manual');

  const [demoDaysAdvanced, setDemoDaysAdvanced] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // An Ask failure keeps its question, so the banner's Retry re-asks it (not a page reload).
  const [askError, setAskError] = useState<{ message: string; question: string } | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('roottrace_theme', theme);
  }, [theme]);

  const loadInitialData = useCallback(async () => {
    try {
      setErrorMsg(null);
      // Insights and workspace history load on their own so the graph always renders.
      const insightsRequest = api.getInsights().then(setInsights);
      const historyRequest = api.getBranchHistory().then(async (history) => {
        setWorkspaceHistory(history);
        const workspaceDetails = await Promise.allSettled(history.map(({ id }) => api.getBranch(id)));
        setBranchDetailsMap((prev) => ({
          ...prev,
          ...Object.fromEntries(workspaceDetails.flatMap((result) =>
            result.status === 'fulfilled' ? [[result.value.id, result.value]] : []
          )),
        }));
      });
      const [g, br0, br1] = await Promise.all([
        api.getGraph(),
        api.getBranch('br_0'),
        api.getBranch('br_1'),
      ]);
      setGraph(g);
      setBranchDetailsMap((prev) => ({ ...prev, br_0: br0, br_1: br1 }));
      setIsDataConnected(true);
      await Promise.all([insightsRequest, historyRequest]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load RootTrace data');
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  const handleSelectBranch = useCallback(async (id: string, targetView?: NavView) => {
    setAskResult(null);
    setAskQuestion(null);
    setSelectedBranchId(id);
    if (targetView) {
      setActiveView(targetView);
    } else {
      setActiveView((prev) =>
        prev === 'dashboard' || prev === 'investigations' ? prev : 'investigations'
      );
    }
    try {
      const detail = await api.getBranch(id);
      setSelectedBranch(detail);
      setBranchDetailsMap((prev) => ({ ...prev, [id]: detail }));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Investigation not found');
    }
  }, []);

  const handleNavigate = (view: NavView) => {
    setActiveView(view);
    if (view === 'investigations') {
      handleSelectBranch(selectedBranchId ?? 'br_1', 'investigations');
    } else if (view === 'dashboard') {
      setSelectedBranchId(null);
      setSelectedBranch(null);
      setAskResult(null);
    }
  };

  const handleOpenRecord = useCallback(async (recordId: string, tab: 'raw' | 'ai' = 'raw') => {
    try {
      const rec = await api.getRecord(recordId);
      setAskAuditModalOpen(false);
      setModalTab(tab);
      setModalRecord(rec);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not load record');
    }
  }, []);

  const handleOpenAskAudit = useCallback(() => {
    setModalRecord(null);
    setModalTab('ai');
    setAskAuditModalOpen(true);
  }, []);

  const handleAskSubmit = async (question: string) => {
    setActiveView((prev) =>
      prev === 'dashboard' || prev === 'investigations' ? prev : 'dashboard'
    );
    setIsAsking(true);
    setAskResult(null);
    setErrorMsg(null);
    setAskError(null);
    setAskQuestion(question);
    try {
      const res = await api.ask(selectedBranchId, question);
      setAskResult(res);
    } catch (err) {
      // The backend already retried Gemini 3 times; this banner's Retry asks the same question again.
      setAskError({ message: err instanceof Error ? err.message : 'Ask request failed', question });
    } finally {
      setIsAsking(false);
    }
  };

  const handleCreateBranch = async (input: CreateBranchInput) => {
    const { branch, detail, draft_error } = await api.createBranch(input);
    setErrorMsg(draft_error ? `Branch saved. ${draft_error}` : null);
    const updatedGraph = await api.getGraph();
    setGraph(updatedGraph);
    setBranchDetailsMap((prev) => ({ ...prev, [branch.id]: detail }));
    setSelectedBranchId(branch.id);
    setSelectedBranch(detail);
    setAskResult(null);
    setAskQuestion(null);
    setActiveView('investigations');
    void api.getBranchHistory().then(setWorkspaceHistory).catch(() => {
      setErrorMsg('Branch saved. Refresh if it does not appear in History.');
    });
  };

  const handleGenerateBranchDrafts = async (id: string) => {
    const { detail, context } = await api.generateBranchDrafts(id);
    setBranchDetailsMap((prev) => ({ ...prev, [id]: detail }));
    setSelectedBranch((prev) => prev?.id === id ? detail : prev);
    return context;
  };

  const handleBranchTransition = async (id: string, action: BranchAction, resolution?: string) => {
    const { graph: updatedGraph, detail, history } = await api.transitionBranch(id, action, resolution);
    setGraph(updatedGraph);
    setWorkspaceHistory(history);
    setBranchDetailsMap((prev) => ({ ...prev, [id]: detail }));
    setSelectedBranchId(action === 'resolve' ? id : null);
    setSelectedBranch(action === 'resolve' ? detail : null);
  };

  const handleLockExperiment = async (expId: string) => {
    try {
      const updated = await api.lockExperiment(expId);
      if (selectedBranch) {
        const nextBranch = { ...selectedBranch, experiment: updated };
        setSelectedBranch(nextBranch);
        setBranchDetailsMap((prev) => ({ ...prev, [nextBranch.id]: nextBranch }));
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not lock experiment');
    }
  };

  const handleAdvanceDemo = async (days: number) => {
    try {
      setErrorMsg(null);
      const updatedGraph = await api.advanceClock(days);
      setDemoDaysAdvanced(days);
      setGraph(updatedGraph);
      const customIds = updatedGraph.branches
        .map((b) => b.id)
        .filter((id) => id.startsWith('br_custom_'));
      const [[br0, br1, ins], customResults] = await Promise.all([
        Promise.all([api.getBranch('br_0'), api.getBranch('br_1'), api.getInsights()]),
        Promise.allSettled(customIds.map((id) => api.getBranch(id))),
      ]);
      const refreshedCustom = Object.fromEntries(
        customResults.flatMap((result) =>
          result.status === 'fulfilled' ? [[result.value.id, result.value]] : []
        )
      );
      setBranchDetailsMap((prev) => ({ ...prev, ...refreshedCustom, br_0: br0, br_1: br1 }));
      setInsights(ins);
      if (selectedBranchId === 'br_0') {
        setSelectedBranch(br0);
      } else if (selectedBranchId === 'br_1') {
        setSelectedBranch(br1);
      } else if (selectedBranchId && refreshedCustom[selectedBranchId]) {
        setSelectedBranch(refreshedCustom[selectedBranchId]);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update demo clock');
    }
  };

  const handleDeleteAllData = () => {
    setIsDataConnected(false);
  };

  const openNewBranch = (mode: 'manual' | 'voice') => {
    setNewBranchMode(mode);
    setNewBranchOpen(true);
  };

  const isRightPanelOpen = Boolean(selectedBranch || askResult);
  const openCount = graph?.branches.filter((b) => b.status === 'open').length ?? 1;
  const changeCount = graph?.change_events.length ?? 1;

  // Keep Dashboard & Investigations under one shared key so React Flow never remounts when sliding the panel!
  const transitionKey =
    activeView === 'dashboard' || activeView === 'investigations'
      ? 'graph-workspace'
      : activeView;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg text-t1">
      <Sidebar
        collapsed={sidebarCollapsed}
        activeView={activeView}
        openCount={openCount}
        searchQuery={searchQuery}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
        onNavigate={handleNavigate}
        onSearchChange={setSearchQuery}
      />

      <div className="flex-1 min-w-0 flex flex-col h-screen">
        <Topbar
          activeView={activeView}
          changeCount={changeCount}
          openCount={openCount}
          totalRecords={totalRecords}
          dayCount={insights?.coverage.days ?? 0}
          isDataConnected={isDataConnected}
          isAsking={isAsking}
          onAskSubmit={handleAskSubmit}
          onOpenConnect={() => setActiveView('connect')}
        />

        {askError && !isAsking && (
          <div
            role="alert"
            className="px-5 py-2 flex items-center justify-between gap-4 text-[12px] font-mono"
            style={{
              backgroundColor: 'rgba(255, 77, 109, 0.14)',
              borderBottom: '1px solid rgba(255, 77, 109, 0.35)',
              color: 'var(--change)',
            }}
          >
            <span>{askError.message}</span>
            <span className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => handleAskSubmit(askError.question)}
                className="underline font-semibold"
              >
                Retry question
              </button>
              <button type="button" onClick={() => setAskError(null)} className="opacity-70 hover:opacity-100">
                Dismiss
              </button>
            </span>
          </div>
        )}

        {errorMsg && (
          <div
            className="px-5 py-2 flex items-center justify-between text-[12px] font-mono"
            style={{
              backgroundColor: 'rgba(255, 77, 109, 0.14)',
              borderBottom: '1px solid rgba(255, 77, 109, 0.35)',
              color: 'var(--change)',
            }}
          >
            <span>{errorMsg}</span>
            <button type="button" onClick={loadInitialData} className="underline font-semibold">
              Retry
            </button>
          </div>
        )}

        <main className="flex-1 min-h-0 flex overflow-hidden relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={transitionKey}
              initial={PAGE_TRANSITION.initial}
              animate={PAGE_TRANSITION.animate}
              exit={PAGE_TRANSITION.exit}
              transition={PAGE_TRANSITION.transition}
              className="flex-1 min-w-0 h-full flex overflow-hidden"
            >
              {transitionKey === 'graph-workspace' ? (
                <>
                  <div className="flex-1 min-w-0 h-full">
                    {graph ? (
                      <GraphCanvas
                        graph={graph}
                        insights={insights}
                        branchDetailsMap={branchDetailsMap}
                        selectedBranchId={selectedBranchId}
                        isRightPanelOpen={isRightPanelOpen}
                        demoDaysAdvanced={demoDaysAdvanced}
                        onSelectBranch={(id) => handleSelectBranch(id)}
                        onOpenRecord={handleOpenRecord}
                        onAdvanceDemo={handleAdvanceDemo}
                        onOpenNewBranch={openNewBranch}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-mono text-[12px] text-t3">
                        Growing RootTrace graph...
                      </div>
                    )}
                  </div>

                  {/* Smooth spring-free calibrated slide-in panel */}
                  <AnimatePresence>
                    {isRightPanelOpen && (
                      <motion.div
                        key="investigation-drawer"
                        initial={{ width: 0, opacity: 0.4 }}
                        animate={{ width: 448, opacity: 1 }}
                        exit={{ width: 0, opacity: 0 }}
                        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                        className="h-full overflow-hidden shrink-0"
                      >
                        <InvestigationPanel
                          branch={selectedBranch}
                          askResult={askResult}
                          askQuestion={askQuestion}
                          onClose={() => {
                            setSelectedBranchId(null);
                            setSelectedBranch(null);
                            if (activeView === 'investigations') setActiveView('dashboard');
                          }}
                          onClearAsk={() => {
                            setAskResult(null);
                            setAskQuestion(null);
                          }}
                          onOpenRecord={handleOpenRecord}
                          onOpenAskAudit={handleOpenAskAudit}
                          onLockExperiment={handleLockExperiment}
                          onBranchTransition={handleBranchTransition}
                          onGenerateDrafts={handleGenerateBranchDrafts}
                          resolution={workspaceHistory.find(({ id }) => id === selectedBranch?.id)?.resolution ?? null}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              ) : activeView === 'insights' && insights ? (
                <div className="flex-1 min-w-0 h-full">
                  <InsightsView
                    insights={insights}
                    graph={graph}
                    onOpenRecord={handleOpenRecord}
                    onOpenGraphBranch={(id) => handleSelectBranch(id, 'investigations')}
                  />
                </div>
              ) : activeView === 'history' && graph ? (
                <div className="flex-1 min-w-0 h-full">
                  <HistoryReplayView
                    graph={graph}
                    workspaceHistory={workspaceHistory}
                    branchDetailsMap={branchDetailsMap}
                    insights={insights}
                    onOpenRecord={handleOpenRecord}
                    onJumpToBranch={(id) => handleSelectBranch(id, 'investigations')}
                  />
                </div>
              ) : activeView === 'profile' ? (
                <div className="flex-1 min-w-0 h-full">
                  <ProfileView
                    theme={theme}
                    totalRecords={totalRecords}
                    insights={insights}
                    isDataConnected={isDataConnected}
                    onThemeChange={setTheme}
                    onGoConnect={() => setActiveView('connect')}
                  />
                </div>
              ) : activeView === 'connect' ? (
                <div className="flex-1 min-w-0 h-full">
                  <ConnectDataView
                    totalRecords={totalRecords}
                    insights={insights}
                    isDataConnected={isDataConnected}
                    onReloadDemo={loadInitialData}
                  />
                </div>
              ) : (
                <div className="flex-1 min-w-0 h-full">
                  <PrivacyView
                    theme={theme}
                    isDataConnected={isDataConnected}
                    onThemeChange={setTheme}
                    onInspectPayload={() => {
                      const firstId = insights?.sleep_shift?.record_ids[0] ?? insights?.days[insights.days.length - 1]?.sleep_id;
                      if (firstId) handleOpenRecord(firstId, 'ai');
                    }}
                    onDeleteAllData={handleDeleteAllData}
                    getExportMarkdown={() =>
                      graph ? buildObsidianNote(graph, branchDetailsMap, insights) : '# RootTrace\n\nData not loaded yet.\n'
                    }
                    onReloadDemo={loadInitialData}
                  />
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <RecordModal
        record={modalRecord}
        auditOnlyOpen={askAuditModalOpen}
        askContext={USE_MOCK ? askResult ?? api.getDefaultAskSample() : askResult}
        initialTab={modalTab}
        onClose={() => {
          setModalRecord(null);
          setAskAuditModalOpen(false);
        }}
      />

      <NewBranchModal
        open={newBranchOpen}
        initialMode={newBranchMode}
        onClose={() => setNewBranchOpen(false)}
        onCreate={handleCreateBranch}
      />
    </div>
  );
};

export default App;
