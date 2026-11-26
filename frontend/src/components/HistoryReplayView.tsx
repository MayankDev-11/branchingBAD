import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  useReactFlow,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  CheckCircle2,
  FlaskConical,
  Grid3X3,
  HelpCircle,
  Keyboard,
  Lock,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { alternatingY, dateToX, TRUNK_Y } from './graph/graphMath';
import type {
  BranchDetailResponse,
  BranchHypothesis,
  ExperimentInfo,
  GraphBranch,
  GraphResponse,
  InsightsResponse,
  KnowledgeItem,
  WorkspaceHistoryEntry,
} from '../types';
import {
  AnchorNode,
  BranchHubNode,
  ChangeEventNode,
  EvidenceDewdropNode,
  ExperimentLeafNode,
  KnowledgeNode,
  MeltConfluenceNode,
  SubHypothesisNode,
  TimelineResolutionNode,
} from './graph/CustomNodes';
import { OrganicBranchEdge, TrunkEdge } from './graph/CustomEdges';
import { SmoothZoomControls } from './graph/SmoothZoomControls';

const nodeTypes = {
  anchor: AnchorNode,
  changeEvent: ChangeEventNode,
  branchHub: BranchHubNode,
  subHypothesis: SubHypothesisNode,
  experimentLeaf: ExperimentLeafNode,
  meltConfluence: MeltConfluenceNode,
  knowledgeNode: KnowledgeNode,
  timelineResolution: TimelineResolutionNode,
  evidenceDewdrop: EvidenceDewdropNode,
};

const edgeTypes = {
  trunk: TrunkEdge,
  organicBranch: OrganicBranchEdge,
};

interface HistoryMilestone {
  id: string;
  date: string;
  dateLabel: string;
  tag: string;
  tone: string;
  title: string;
  branchId?: string;
  whyCreated: string;
  hypotheses: Array<{ name: string; status: 'supported' | 'refuted' | 'testing' | 'active'; note: string }>;
  experimentNote: string;
  solution: string;
  recordIds: string[];
}

// ---------------------------------------------------------------------------------------------
// The replay is built from the live API data (graph, branch details, insights), so every date,
// count and percentage matches the dashboard and comes from Python (rule 9). A step that has
// not happened yet at the demo clock (e.g. the headache branch being solved) is not shown.
// ---------------------------------------------------------------------------------------------
const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const longLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const hm = (min: number) => `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, '0')}m`;
const claimCount = (hyp?: BranchHypothesis) => {
  const text = hyp?.claims[0]?.text;
  if (!text) return 'Not enough data yet';
  const m = text.match(/^(\d+ of \d+ \S+ \S+)/);
  return m ? m[1] : text;
};
const firstIds = (hyp: BranchHypothesis | undefined, count: number) => (hyp?.claims[0]?.record_ids ?? []).slice(0, count);
const hypStatus = (hyp: BranchHypothesis, idx: number, concluded: boolean, exp?: ExperimentInfo) => {
  if (!concluded) return 'active' as const;
  if (idx === 0 && exp?.status === 'supported') return 'supported' as const;
  if ((hyp.confidence ?? 0) === 0) return 'refuted' as const;
  return 'active' as const;
};
const isoMinusDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const hypNote =(hyp: BranchHypothesis) => `${hyp.confidence ?? 0}% · ${hyp.claims[0]?.text ?? 'Not enough data yet'}`;

interface HistoryData {
  graph: GraphResponse;
  workspaceHistory: WorkspaceHistoryEntry[];
  branchDetailsMap: Record<string, BranchDetailResponse>;
  br0?: GraphBranch;
  br1?: GraphBranch;
  d0?: BranchDetailResponse;
  d1?: BranchDetailResponse;
  kn0?: KnowledgeItem;
  kn1?: KnowledgeItem;
  insights: InsightsResponse | null;
}

const buildMilestones = (d: HistoryData): HistoryMilestone[] => {
  const steps: HistoryMilestone[] = [];
  const { graph, br0, br1, d0, d1, kn0, kn1, insights } = d;
  const shift = insights?.sleep_shift;
  const titles = insights?.coverage.metrics.map((m) => m.title.toLowerCase()) ?? [];

  steps.push({
    id: 'step_baseline',
    date: graph.range.start,
    dateLabel: longLabel(graph.range.start),
    tag: 'BASELINE TRUNK STARTED',
    tone: 'var(--trunk)',
    title: 'Daily logging starts',
    whyCreated: `Your first records: ${titles.join(', ') || 'daily health logs'}. RootTrace needs at least 7 days before it works out a 30-day normal.`,
    hypotheses: [],
    experimentNote: 'No experiments yet: the trunk is only collecting your normal.',
    solution: 'A clean reference trunk for spotting real shifts later.',
    recordIds: [],
  });

  if (br0 && d0) {
    const exp = d0.experiment;
    steps.push({
      id: 'step_br0_open',
      date: br0.start_date,
      dateLabel: longLabel(br0.start_date),
      tag: 'NEW BRANCH SPROUTED',
      tone: 'var(--branch-open)',
      title: br0.title,
      branchId: 'br_0',
      whyCreated: 'You opened an investigation to test this question against your own records instead of guessing.',
      hypotheses: d0.hypotheses.map((h) => ({ name: h.label ?? h.text ?? 'Hypothesis', status: 'active', note: hypNote(h) })),
      experimentNote: `Comparing ${d0.hypotheses.length} competing explanations before locking an experiment.`,
      solution: exp ? `Next: ${exp.description.toLowerCase()} for ${exp.duration_days} days.` : 'Collecting evidence.',
      recordIds: firstIds(d0.hypotheses[0], 2),
    });
    if (br0.status === 'concluded' && br0.end_date) {
      steps.push({
        id: 'step_br0_solved',
        date: br0.end_date,
        dateLabel: longLabel(br0.end_date),
        tag: 'BRANCH SOLVED · MELTED',
        tone: 'var(--ok)',
        title: `Solved: ${kn0?.statement ?? br0.title}`,
        branchId: 'br_0',
        whyCreated: exp
          ? `Finished a ${exp.duration_days}-day locked experiment (${exp.description.toLowerCase()}, ${exp.adherence_pct}% adherence). Python compared it with the locked criterion.`
          : 'Python compared the records with the locked criterion.',
        hypotheses: d0.hypotheses.map((h, i) => ({
          name: h.label ?? h.text ?? 'Hypothesis',
          status: hypStatus(h, i, true, exp),
          note: hypNote(h),
        })),
        experimentNote: exp ? `Locked criterion: ${exp.success_criterion}. Result: ${exp.status.replace('_', ' ')}.` : '',
        solution: `${d0.hypotheses.length} sub-branches melted into verified knowledge: ${kn0?.statement ?? 'concluded'}.`,
        recordIds: firstIds(d0.hypotheses[0], 2),
      });
    }
  }

  if (shift) {
    steps.push({
      id: 'step_ce1',
      date: shift.date,
      dateLabel: longLabel(shift.date),
      tag: 'CHANGE EVENT DETECTED',
      tone: 'var(--change)',
      title: `PELT alert: sleep dropped ${Math.abs(shift.delta_min)} min`,
      branchId: br1?.id,
      whyCreated: `Change detection found nights well below your ${hm(shift.before_median_min)} normal starting ${shortDate(
        shift.date
      )}; over the next ${shift.post_window_days} days your sleep settled at ${hm(shift.after_median_min)}.`,
      hypotheses: [],
      experimentNote: 'Shown as a red dot on the trunk. RootTrace never opens a branch without your approval.',
      solution: 'A prompt to investigate, not a diagnosis.',
      recordIds: shift.record_ids.slice(0, 3),
    });
  }

  if (br1 && d1) {
    const exp = d1.experiment;
    const top = d1.hypotheses[0];
    steps.push({
      id: 'step_br1_open',
      date: br1.start_date,
      dateLabel: longLabel(br1.start_date),
      tag: 'NEW BRANCH · SHARED LINK',
      tone: 'var(--branch-open)',
      title: br1.title,
      branchId: 'br_1',
      whyCreated: `You asked "${br1.title}"${shift ? ` after the ${shortDate(shift.date)} sleep drop` : ''}. Python counted how often each possible trigger came before headache days and before headache-free days.`,
      hypotheses: d1.hypotheses.map((h) => ({ name: h.label ?? h.text ?? 'Hypothesis', status: 'active', note: hypNote(h) })),
      experimentNote: 'Shared sleep records link this branch back to the earlier sleep investigation.',
      solution: top ? `${top.label} ranks first at ${top.confidence ?? 0}% confidence.` : 'Collecting evidence.',
      recordIds: firstIds(top, 3),
    });
    if (exp?.locked && exp.locked_at) {
      const lockedOn = exp.locked_at.slice(0, 10);
      steps.push({
        id: 'step_br1_exp',
        date: lockedOn,
        dateLabel: longLabel(lockedOn),
        tag: 'CRITERION LOCKED',
        tone: 'var(--sub-cyan)',
        title: `Experiment locked: ${exp.description} (${exp.duration_days}d)`,
        branchId: 'br_1',
        whyCreated: `The success criterion was locked before night 1 (${shortDate(exp.start_date)}). A SQLite trigger stops anyone changing it afterwards.`,
        hypotheses: d1.hypotheses.map((h, i) => ({
          name: h.label ?? h.text ?? 'Hypothesis',
          status: i === 0 ? 'testing' : 'active',
          note: i === 0 ? `Being tested: ${exp.duration_days}-night experiment from ${shortDate(exp.start_date)}` : `Proposed test: ${h.test}`,
        })),
        experimentNote: `Locked criterion: ${exp.success_criterion}.`,
        solution:
          br1.status === 'open'
            ? `Night ${exp.days_elapsed} of ${exp.duration_days}: ${exp.adherence_pct}% adherence so far. Python decides after the last night.`
            : `Decided by Python: ${exp.status.replace('_', ' ')}.`,
        recordIds: firstIds(top, 2),
      });
    }
    if (br1.status !== 'open' && br1.end_date) {
      steps.push({
        id: 'step_br1_solved',
        date: br1.end_date,
        dateLabel: longLabel(br1.end_date),
        tag: 'RESOLVED · KNOWLEDGE MELTED',
        tone: 'var(--ok)',
        title: `Solved: ${kn1?.statement ?? br1.title}`,
        branchId: 'br_1',
        whyCreated: exp
          ? `The experiment reached night ${exp.days_elapsed} at ${exp.adherence_pct}% adherence. Python checked the nights against the locked criterion.`
          : 'Python checked the records against the locked criterion.',
        hypotheses: d1.hypotheses.map((h, i) => ({
          name: h.label ?? h.text ?? 'Hypothesis',
          status: hypStatus(h, i, true, exp),
          note: hypNote(h),
        })),
        experimentNote: exp ? `Result: ${exp.status.replace('_', ' ')} (decided in Python, never by the AI).` : '',
        solution: kn1 ? `Verified knowledge: ${kn1.statement}.` : 'Concluded.',
        recordIds: firstIds(top, 2),
      });
    }
  }
  for (const entry of d.workspaceHistory) {
    const detail = d.branchDetailsMap[entry.id];
    const factors = detail?.hypotheses ?? [];
    const records = [...new Set(factors.flatMap((factor) => factor.claims.flatMap((claim) => claim.record_ids)))];
    const branchKind = entry.branch_type === 'habit' ? 'Habit' : 'Investigation';
    steps.push({
      id: `created-${entry.id}`, date: entry.start_date, dateLabel: longLabel(entry.start_date),
      tag: 'BRANCH CREATED', tone: 'var(--trunk)', title: `Created: ${entry.title}`, branchId: entry.id,
      whyCreated: `${branchKind} added to your workspace.`,
      hypotheses: factors.map((factor) => ({
        name: factor.label ?? factor.text ?? 'Factor', status: 'active',
        note: factor.claims[0]?.text ?? factor.test,
      })),
      experimentNote: 'Workspace branch opened for investigation.',
      solution: 'Branch added to the graph.', recordIds: records,
    });
    if (entry.closed_date && entry.lifecycle !== 'open') {
      const resolved = entry.lifecycle === 'resolved';
      steps.push({
        id: `closed-${entry.id}`, date: entry.closed_date, dateLabel: longLabel(entry.closed_date),
        tag: resolved ? 'BRANCH RESOLVED' : 'BRANCH DISSOLVED',
        tone: resolved ? 'var(--ok)' : 'var(--t3)',
        title: `${resolved ? 'Resolved' : 'Dissolved'}: ${entry.title}`, branchId: entry.id,
        whyCreated: resolved ? 'You closed the branch and saved a note on the main timeline.'
          : 'You removed the branch from the live graph. Its history is preserved.',
        hypotheses: [],
        experimentNote: 'Manually closed from the workspace.',
        solution: entry.resolution ?? 'Archived in History.', recordIds: records,
      });
    }
  }

  return steps.sort((a, b) => a.date.localeCompare(b.date));
};

interface HistoryReplayViewProps {
  graph: GraphResponse;
  workspaceHistory: WorkspaceHistoryEntry[];
  branchDetailsMap: Record<string, BranchDetailResponse>;
  insights: InsightsResponse | null;
  onOpenRecord: (id: string, tab?: 'raw' | 'ai') => void;
  onJumpToBranch: (branchId: string) => void;
}

const HistoryReplayInner: React.FC<HistoryReplayViewProps> = ({
  graph,
  workspaceHistory,
  branchDetailsMap,
  insights,
  onOpenRecord,
  onJumpToBranch,
}) => {
  const { fitView } = useReactFlow();
  const data = useMemo<HistoryData>(() => {
    const br0 = graph.branches.find((b) => b.id === 'br_0');
    const br1 = graph.branches.find((b) => b.id === 'br_1');
    const knFor = (b?: GraphBranch) => (b?.end_date ? graph.knowledge.find((k) => !k.id.startsWith('kn_br_custom_') && k.date === b.end_date) : undefined);
    return {
      graph,
      workspaceHistory,
      branchDetailsMap,
      br0,
      br1,
      d0: branchDetailsMap['br_0'],
      d1: branchDetailsMap['br_1'],
      kn0: knFor(br0) ?? graph.knowledge[0],
      kn1: knFor(br1),
      insights,
    };
  }, [graph, workspaceHistory, branchDetailsMap, insights]);
  const ALL_MILESTONES = useMemo(() => buildMilestones(data), [data]);
  const historyStart = ALL_MILESTONES[0]?.date ?? graph.range.start;
  const historyEnd = [graph.range.end, ALL_MILESTONES.slice(-1)[0]?.date ?? graph.range.end].sort()[1];
  const [dateFrom, setDateFrom] = useState(historyStart);
  const [dateTo, setDateTo] = useState(historyEnd);
  // When the demo clock moves (+10 days / Reset), extend or shrink the window with it.
  useEffect(() => {
    setDateFrom(historyStart);
    setDateTo(historyEnd);
  }, [historyStart, historyEnd]);
  const [stepIdx, setStepIdx] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const flowContainerRef = useRef<HTMLDivElement | null>(null);

  // Build filtered chronological steps starting cleanly with the selected Date From trunk
  const visibleSteps = useMemo(() => {
    const inside = ALL_MILESTONES.filter((m) => m.date >= dateFrom && m.date <= dateTo);
    if (inside.length === 0 || inside[0].date > dateFrom) {
      const startAnchor: HistoryMilestone = {
        id: 'step_custom_start',
        date: dateFrom,
        dateLabel: new Date(`${dateFrom}T00:00:00Z`).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          timeZone: 'UTC',
        }),
        tag: 'TIMELINE START',
        tone: 'var(--trunk)',
        title: `Trunk View Starting ${dateFrom}`,
        whyCreated: `Showing your personal baseline root starting from ${dateFrom}. Press the Right Arrow key (→) to grow each investigation, hypothesis, and solution chronologically.`,
        hypotheses: [],
        experimentNote: 'Step forward with → to watch branches sprout and melt in real time.',
        solution: 'Baseline trunk loaded for your selected date window.',
        recordIds: [],
      };
      return [startAnchor, ...inside];
    }
    return inside;
  }, [ALL_MILESTONES, dateFrom, dateTo]);

  // Reset to step 0 when date range changes
  useEffect(() => {
    setStepIdx(0);
    setAutoPlay(false);
  }, [dateFrom, dateTo]);

  const safeStepIdx = Math.min(stepIdx, visibleSteps.length - 1);
  const currentStep = visibleSteps[safeStepIdx];
  const currentDate = currentStep.date;
  const revealedIds = useMemo(
    () => new Set(visibleSteps.slice(0, safeStepIdx + 1).map((s) => s.id)),
    [visibleSteps, safeStepIdx]
  );

  // Keyboard ArrowRight / ArrowLeft / Spacebar navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setAutoPlay(false);
        setStepIdx((prev) => Math.min(visibleSteps.length - 1, prev + 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setAutoPlay(false);
        setStepIdx((prev) => Math.max(0, prev - 1));
      } else if (e.key === ' ') {
        e.preventDefault();
        setAutoPlay((p) => !p);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visibleSteps.length]);

  // Optional auto-play timer
  useEffect(() => {
    if (!autoPlay) return;
    if (safeStepIdx >= visibleSteps.length - 1) {
      setAutoPlay(false);
      return;
    }
    const t = setTimeout(() => {
      setStepIdx((prev) => Math.min(visibleSteps.length - 1, prev + 1));
    }, 1800);
    return () => clearTimeout(t);
  }, [autoPlay, safeStepIdx, visibleSteps.length]);

  // Build progressive graph nodes & edges ONLY up to the active step!
  const { nodes, edges } = useMemo(() => {
    const n: Node[] = [];
    const e: Edge[] = [];
    const rangeStart = graph.range.start;
    const isFresh = (stepId: string) => currentStep.id === stepId;
    const { br0, br1, d0, d1, kn0, kn1 } = data;
    const shift = insights?.sleep_shift;

    // Trunk grows smoothly from dateFrom -> currentDate (minimum 260px so initial trunk looks clean & alive)
    const startX = Math.max(40, dateToX(rangeStart, dateFrom) - 30);
    const currentX = Math.max(startX + 260, dateToX(rangeStart, currentDate) + 180);

    n.push(
      { id: 'h-trunk-start', type: 'anchor', position: { x: startX, y: TRUNK_Y }, data: {} },
      { id: 'h-trunk-end', type: 'anchor', position: { x: currentX, y: TRUNK_Y }, data: {} }
    );

    // A tick at each milestone date, plus the first and last day of data.
    const allTicks = [...new Set([graph.range.start, ...ALL_MILESTONES.map((m) => m.date), graph.range.end])]
      .sort()
      .filter((d) => d >= dateFrom && d <= currentDate)
      .map((d) => ({ x: dateToX(rangeStart, d), label: shortDate(d) }));

    e.push({
      id: 'h-edge-trunk',
      source: 'h-trunk-start',
      target: 'h-trunk-end',
      type: 'trunk',
      data: { kind: 'trunk', dateTicks: allTicks, animateFlow: true },
    });

    // STEP: Branch 0 (Oct 1) — Upper side of trunk
    if (revealedIds.has('step_br0_open') && br0 && d0) {
      const fresh = isFresh('step_br0_open');
      const solved = revealedIds.has('step_br0_solved');
      const h0 = d0.hypotheses;
      const b0StartX = Math.max(startX + 40, 240);
      const b0HubX = b0StartX + 175;
      const b0HubY = alternatingY(-1, 1);

      n.push(
        { id: 'h-br0-start', type: 'anchor', position: { x: b0StartX, y: TRUNK_Y }, data: {} },
        {
          id: 'h-br0-hub',
          type: 'branchHub',
          position: { x: b0HubX, y: b0HubY },
          data: {
            id: 'br_0',
            title: br0.title,
            status: solved ? 'concluded' : 'open',
            labelSide: 'below',
            subtitle: solved
              ? `Solved ${shortDate(br0.end_date ?? br0.start_date)} · ${h0.length} melted`
              : `Opened ${shortDate(br0.start_date)} · ${h0.length} competing hypotheses`,
            isSelected: currentStep.branchId === 'br_0',
            animateIn: fresh,
            onSelect: onJumpToBranch,
          },
        }
      );

      e.push({
        id: 'h-e-br0-root',
        source: 'h-br0-start',
        target: 'h-br0-hub',
        type: 'organicBranch',
        data: { kind: solved ? 'branch-concluded' : 'branch-open', isNewStep: fresh, animateFlow: true },
      });

      const sub0X = b0HubX + 275;
      const offsets0 = [-105, 0, 100];
      h0.slice(0, 3).forEach((h, i) => {
        n.push({
          id: `h-br0-s${i + 1}`,
          type: 'subHypothesis',
          position: { x: sub0X, y: b0HubY + offsets0[i] },
          data: {
            rank: h.rank,
            label: h.label ?? h.text ?? 'Hypothesis',
            confidence: h.confidence ?? 0,
            detail: claimCount(h),
            tone: i === 0 ? (solved ? 'solved' : 'emerald') : 'muted',
            compact: true,
            animateIn: fresh,
            onClick: () => onJumpToBranch('br_0'),
          },
        });
      });

      e.push(
        { id: 'h-e-b0s1', source: 'h-br0-hub', target: 'h-br0-s1', type: 'organicBranch', data: { kind: 'sub-emerald', isNewStep: fresh } },
        { id: 'h-e-b0s2', source: 'h-br0-hub', target: 'h-br0-s2', type: 'organicBranch', data: { kind: 'sub-muted', isNewStep: fresh } },
        { id: 'h-e-b0s3', source: 'h-br0-hub', target: 'h-br0-s3', type: 'organicBranch', data: { kind: 'sub-muted', isNewStep: fresh } }
      );

      // STEP: Branch 0 Solved (Oct 22) — Melts into sleek Verified Knowledge node!
      if (solved) {
        const freshSolve = isFresh('step_br0_solved');
        const melt0X = sub0X + 215;
        n.push(
          {
            id: 'h-br0-melt',
            type: 'meltConfluence',
            position: { x: melt0X, y: b0HubY },
            data: { label: `${h0.length} melted → 1 truth`, animateIn: freshSolve, onClick: () => onJumpToBranch('br_0') },
          },
          {
            id: 'h-br0-kn',
            type: 'knowledgeNode',
            position: { x: melt0X + 245, y: b0HubY },
            data: {
              branchId: 'br_0',
              statement: kn0?.statement ?? br0.title,
              dateLabel: shortDate(kn0?.date ?? br0.end_date ?? br0.start_date),
              confidence: `${capitalize(kn0?.confidence ?? 'pending')}${d0.experiment ? ` · ${d0.experiment.duration_days}d Exp` : ''}`,
              recordIds: firstIds(h0[0], 2),
              isNew: freshSolve,
              animateIn: freshSolve,
              onSelectBranch: onJumpToBranch,
              onOpenRecord: (rid: string) => onOpenRecord(rid, 'raw'),
            },
          }
        );
        e.push(
          { id: 'h-e-b0m1', source: 'h-br0-s1', target: 'h-br0-melt', type: 'organicBranch', data: { kind: 'melt-converge', isNewStep: freshSolve } },
          { id: 'h-e-b0m2', source: 'h-br0-s2', target: 'h-br0-melt', type: 'organicBranch', data: { kind: 'melt-converge', isNewStep: freshSolve } },
          { id: 'h-e-b0m3', source: 'h-br0-s3', target: 'h-br0-melt', type: 'organicBranch', data: { kind: 'melt-converge', isNewStep: freshSolve } },
          { id: 'h-e-b0kn', source: 'h-br0-melt', target: 'h-br0-kn', type: 'organicBranch', data: { kind: 'knowledge-stem', isNewStep: freshSolve } }
        );
      }
    }

    // STEP: Change Event (Nov 3)
    if (revealedIds.has('step_ce1') && shift) {
      const fresh = isFresh('step_ce1');
      n.push({
        id: 'h-ce-1',
        type: 'changeEvent',
        position: { x: dateToX(rangeStart, shift.date), y: TRUNK_Y },
        data: {
          label: `sleep ${shift.delta_min} min`,
          dateLabel: shortDate(shift.date),
          spotlight: fresh,
          animateIn: fresh,
          onClick: () => onJumpToBranch('br_1'),
        },
      });
    }

    // STEP: Branch 1 (Nov 5) — Alternated cleanly to LOWER side of trunk!
    if (revealedIds.has('step_br1_open') && br1 && d1) {
      const fresh = isFresh('step_br1_open');
      const hasExp = revealedIds.has('step_br1_exp');
      const solved = revealedIds.has('step_br1_solved');
      const h1 = d1.hypotheses;
      const exp1 = d1.experiment;
      const b1StartX = dateToX(rangeStart, br1.start_date);
      const b1HubX = b1StartX + 185;
      const b1HubY = alternatingY(1, 1);

      n.push(
        { id: 'h-br1-start', type: 'anchor', position: { x: b1StartX, y: TRUNK_Y }, data: {} },
        {
          id: 'h-br1-hub',
          type: 'branchHub',
          position: { x: b1HubX, y: b1HubY },
          data: {
            id: 'br_1',
            title: br1.title,
            status: solved ? 'concluded' : 'open',
            labelSide: 'below',
            subtitle: solved
              ? `Solved ${shortDate(br1.end_date ?? br1.start_date)} · ${h1.length} melted into Knowledge`
              : hasExp && exp1
              ? `Locked ${exp1.duration_days}d Experiment · ${exp1.adherence_pct}% adherence`
              : `Opened ${shortDate(br1.start_date)} · ${h1.length} competing hypotheses`,
            isSelected: currentStep.branchId === 'br_1',
            animateIn: fresh,
            onSelect: onJumpToBranch,
          },
        }
      );

      e.push({
        id: 'h-e-br1-root',
        source: 'h-br1-start',
        target: 'h-br1-hub',
        type: 'organicBranch',
        data: { kind: solved ? 'branch-concluded' : 'branch-open', isNewStep: fresh, animateFlow: true },
      });

      const sub1X = b1HubX + 290;
      const offsets1 = [-115, 0, 115];
      const tones1 = ['emerald', 'cyan', 'muted'] as const;
      h1.slice(0, 3).forEach((h, i) => {
        const rid = h.claims[0]?.record_ids[0];
        n.push({
          id: `h-br1-s${i + 1}`,
          type: 'subHypothesis',
          position: { x: sub1X, y: b1HubY + offsets1[i] },
          data: {
            rank: h.rank,
            label: h.label ?? h.text ?? 'Hypothesis',
            confidence: h.confidence ?? 0,
            detail: rid ? `${claimCount(h)} · ${rid}` : claimCount(h),
            tone: i === 0 && solved ? 'solved' : tones1[i],
            animateIn: fresh,
            onClick: () => onJumpToBranch('br_1'),
          },
        });
      });

      e.push(
        { id: 'h-e-b1s1', source: 'h-br1-hub', target: 'h-br1-s1', type: 'organicBranch', data: { kind: 'sub-emerald', isNewStep: fresh } },
        { id: 'h-e-b1s2', source: 'h-br1-hub', target: 'h-br1-s2', type: 'organicBranch', data: { kind: 'sub-cyan', isNewStep: fresh } },
        { id: 'h-e-b1s3', source: 'h-br1-hub', target: 'h-br1-s3', type: 'organicBranch', data: { kind: 'sub-muted', isNewStep: fresh } }
      );

      if (revealedIds.has('step_br0_open')) {
        e.push({
          id: 'h-e-shared',
          source: 'h-br0-s1',
          target: 'h-br1-s1',
          type: 'organicBranch',
          data: { kind: 'cross-mycelium', isNewStep: fresh },
        });
      }

      // STEP: Locked Experiment + Evidence Twigs (Nov 10)
      if (hasExp && !solved && exp1) {
        const freshExp = isFresh('step_br1_exp');
        const twigX = sub1X + 275;
        n.push({
          id: 'h-br1-exp',
          type: 'experimentLeaf',
          position: { x: twigX + 15, y: b1HubY - 145 },
          data: {
            description: `${exp1.description} (${exp1.duration_days}d)`,
            adherence: exp1.adherence_pct,
            locked: exp1.locked,
            animateIn: freshExp,
            onClick: () => onJumpToBranch('br_1'),
          },
        });
        e.push({ id: 'h-e-exp', source: 'h-br1-s1', target: 'h-br1-exp', type: 'organicBranch', data: { kind: 'sub-exp', isNewStep: freshExp } });

        // Evidence dots: real records cited by hypotheses 1 and 2, with their stored labels.
        const evidence = new Map(d1.evidence.map((row) => [row.id, row]));
        const dots = [
          { id: 'h-ev-sl', hyp: 0, prefix: 'sl_', y: b1HubY - 76 },
          { id: 'h-ev-wt', hyp: 1, prefix: 'wt_', y: b1HubY + 28 },
        ];
        dots.forEach((dot) => {
          const rid = (h1[dot.hyp]?.claims[0]?.record_ids ?? []).find((id) => id.startsWith(dot.prefix));
          if (!rid) return;
          const row = evidence.get(rid);
          n.push({
            id: dot.id,
            type: 'evidenceDewdrop',
            position: { x: twigX, y: dot.y },
            data: {
              recordId: rid,
              summary: row ? row.label.replace(/ (sleep|water)$/, '') : rid.startsWith('sl_') ? 'Sleep' : 'Water',
              animateIn: freshExp,
              onOpenRecord: (id: string) => onOpenRecord(id, 'raw'),
            },
          });
          e.push({
            id: `h-e-${dot.id}`,
            source: `h-br1-s${dot.hyp + 1}`,
            target: dot.id,
            type: 'organicBranch',
            data: { kind: 'evidence-tendril', isNewStep: freshExp },
          });
        });
      }

      // STEP: Branch 1 Resolved (Nov 22) — Melts into Verified Knowledge!
      if (solved) {
        const freshSolve = isFresh('step_br1_solved');
        const melt1X = sub1X + 230;
        n.push(
          {
            id: 'h-br1-melt',
            type: 'meltConfluence',
            position: { x: melt1X, y: b1HubY },
            data: { label: `${h1.length} melted → 1 truth`, animateIn: freshSolve, onClick: () => onJumpToBranch('br_1') },
          },
          {
            id: 'h-br1-kn',
            type: 'knowledgeNode',
            position: { x: melt1X + 245, y: b1HubY },
            data: {
              branchId: 'br_1',
              statement: kn1?.statement ?? br1.title,
              dateLabel: shortDate(kn1?.date ?? br1.end_date ?? br1.start_date),
              confidence: `${capitalize(kn1?.confidence ?? 'pending')}${exp1 ? ` · ${exp1.duration_days}d Exp` : ''}`,
              recordIds: firstIds(h1[0], 2),
              isNew: freshSolve,
              animateIn: freshSolve,
              onSelectBranch: onJumpToBranch,
              onOpenRecord: (rid: string) => onOpenRecord(rid, 'raw'),
            },
          }
        );
        e.push(
          { id: 'h-e-b1m1', source: 'h-br1-s1', target: 'h-br1-melt', type: 'organicBranch', data: { kind: 'melt-converge', isNewStep: freshSolve } },
          { id: 'h-e-b1m2', source: 'h-br1-s2', target: 'h-br1-melt', type: 'organicBranch', data: { kind: 'melt-converge', isNewStep: freshSolve } },
          { id: 'h-e-b1m3', source: 'h-br1-s3', target: 'h-br1-melt', type: 'organicBranch', data: { kind: 'melt-converge', isNewStep: freshSolve } },
          { id: 'h-e-b1kn', source: 'h-br1-melt', target: 'h-br1-kn', type: 'organicBranch', data: { kind: 'knowledge-stem', isNewStep: freshSolve } }
        );
      }
    }

    workspaceHistory.forEach((entry, index) => {
      if (entry.start_date >= dateFrom && !revealedIds.has(`created-${entry.id}`)) return;
      if (entry.start_date > currentDate) return;
      const closed = entry.closed_date && (entry.closed_date < dateFrom || revealedIds.has(`closed-${entry.id}`));
      const x = Math.min(currentX - 25, Math.max(startX + 40, dateToX(rangeStart, entry.start_date)));
      if (closed && entry.lifecycle === 'resolved') {
        const closedX = Math.min(currentX - 25, Math.max(startX + 40, dateToX(rangeStart, entry.closed_date!)));
        n.push({
          id: `resolved-${entry.id}`, type: 'timelineResolution',
          position: { x: closedX - 14, y: TRUNK_Y - 14 },
          data: { title: entry.title, dateLabel: shortDate(entry.closed_date!),
                  onClick: () => onJumpToBranch(entry.id) },
        });
      } else if (!closed) {
        n.push(
          { id: `start-${entry.id}`, type: 'anchor', position: { x, y: TRUNK_Y }, data: {} },
          { id: `history-${entry.id}`, type: 'branchHub',
            position: { x: x + 145 + Math.floor(index / 2) * 200, y: alternatingY(index % 2 === 0 ? -1 : 1, 1) },
            data: { id: entry.id, title: entry.title, status: 'open', branchType: entry.branch_type,
                    subtitle: 'Workspace branch', isSelected: currentStep.branchId === entry.id,
                    onSelect: () => {
                      const step = visibleSteps.findIndex(({ id }) => id === `created-${entry.id}`);
                      if (step >= 0) setStepIdx(step);
                    } } },
        );
        e.push({ id: `history-edge-${entry.id}`, source: `start-${entry.id}`, target: `history-${entry.id}`,
                 type: 'organicBranch', data: { kind: 'branch-open' } });
      }
    });

    return { nodes: n, edges: e };
  }, [graph, data, insights, ALL_MILESTONES, dateFrom, currentDate, currentStep, revealedIds, onJumpToBranch, onOpenRecord, workspaceHistory, visibleSteps]);

  // Smoothly pan/fit the camera as new branches grow on each Right Arrow press!
  useEffect(() => {
    const timer = setTimeout(() => {
      // Never zoom out so far that labels can't be read (same rule as the dashboard graph).
      fitView({ padding: 0.08, minZoom: 0.55, duration: 480 });
    }, 60);
    return () => clearTimeout(timer);
  }, [safeStepIdx, dateFrom, dateTo, fitView]);

  const statusPill = (st: 'supported' | 'refuted' | 'testing' | 'active') => {
    const map = {
      supported: { bg: 'rgba(16, 185, 129, 0.16)', col: 'var(--ok)', lbl: 'SUPPORTED' },
      refuted: { bg: 'rgba(255, 77, 109, 0.14)', col: 'var(--change)', lbl: 'REFUTED' },
      testing: { bg: 'rgba(56, 189, 248, 0.16)', col: 'var(--sub-cyan)', lbl: 'TESTING' },
      active: { bg: 'rgba(245, 158, 11, 0.14)', col: 'var(--amb)', lbl: 'EXPLORING' },
    }[st];
    return (
      <span
        className="px-2 py-0.5 rounded-full font-mono text-[9px] font-bold shrink-0"
        style={{ backgroundColor: map.bg, color: map.col }}
      >
        {map.lbl}
      </span>
    );
  };

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* TOP DATE-RANGE + PLAYBACK CONTROL BAR */}
      <div
        className="px-5 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0 z-10"
        style={{ backgroundColor: 'var(--s1)', borderBottom: '1px solid var(--border)' }}
      >
        {/* Date From -> Date To Selection */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 font-mono text-[10.5px] font-semibold text-branchOpen">
            <Calendar className="w-3.5 h-3.5" />
            <span>Replay Window:</span>
          </div>

          <label className="flex items-center gap-1.5 font-mono text-[10.5px] text-t3">
            <span>From</span>
            <input
              type="date"
              min={historyStart}
              max={dateTo}
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-2.5 py-1 rounded-lg font-mono text-[11px] text-t1 focus:outline-none"
              style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border-strong)' }}
            />
          </label>

          <label className="flex items-center gap-1.5 font-mono text-[10.5px] text-t3">
            <span>To</span>
            <input
              type="date"
              min={dateFrom}
              max={historyEnd}
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-2.5 py-1 rounded-lg font-mono text-[11px] text-t1 focus:outline-none"
              style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border-strong)' }}
            />
          </label>

          {/* Quick Range Presets */}
          <div className="hidden xl:flex items-center gap-1.5 ml-1">
            {[
              { lbl: 'All data', from: historyStart, to: historyEnd },
              { lbl: 'Last 60d', from: isoMinusDays(historyEnd, 59), to: historyEnd },
              { lbl: 'Last 21d', from: isoMinusDays(historyEnd, 20), to: historyEnd },
            ].map((p) => (
              <button
                key={p.lbl}
                type="button"
                onClick={() => {
                  setDateFrom(p.from);
                  setDateTo(p.to);
                }}
                className="px-2.5 py-1 rounded-full font-mono text-[10px] text-t2 hover:text-t1 transition-colors"
                style={{
                  backgroundColor: dateFrom === p.from && dateTo === p.to ? 'var(--s2)' : 'transparent',
                  border: '1px solid var(--border)',
                }}
              >
                {p.lbl}
              </button>
            ))}
          </div>
        </div>

        {/* Arrow Key Step Controls */}
        <div className="flex items-center gap-2">
          <span
            className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-mono text-[10px] text-t3"
            style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }}
          >
            <Keyboard className="w-3.5 h-3.5 text-branchOpen" />
            Use ← / → Arrow Keys
          </span>

          <button
            type="button"
            disabled={safeStepIdx === 0}
            onClick={() => {
              setAutoPlay(false);
              setStepIdx((p) => Math.max(0, p - 1));
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-mono text-[11px] font-semibold text-t1 disabled:opacity-35"
            style={{ backgroundColor: 'var(--s2)', border: '1px solid var(--border)' }}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Prev</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (safeStepIdx >= visibleSteps.length - 1) setStepIdx(0);
              setAutoPlay((p) => !p);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-[11px] font-semibold"
            style={{ backgroundColor: 'var(--trunk)', color: 'var(--btn-ink)' }}
          >
            {autoPlay ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
            <span>{autoPlay ? 'Pause' : 'Play'}</span>
          </button>

          <button
            type="button"
            disabled={safeStepIdx >= visibleSteps.length - 1}
            onClick={() => {
              setAutoPlay(false);
              setStepIdx((p) => Math.min(visibleSteps.length - 1, p + 1));
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-mono text-[11px] font-semibold text-t1 disabled:opacity-35"
            style={{ backgroundColor: 'var(--s2)', border: '1px solid var(--border-strong)' }}
          >
            <span>Next</span>
            <ArrowRight className="w-3.5 h-3.5 text-branchOpen" />
          </button>

          <button
            type="button"
            onClick={() => {
              setAutoPlay(false);
              setStepIdx(0);
            }}
            title="Restart from start date"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-t2 hover:text-t1"
            style={{ backgroundColor: 'var(--s2)', border: '1px solid var(--border)' }}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* MAIN SPLIT: ANIMATED GROWING GRAPH (LEFT) + CHRONOLOGICAL SUMMARY PANEL (RIGHT) */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Progressive Growing Graph Canvas */}
        <div ref={flowContainerRef} className="relative flex-1 min-w-0 h-full">
          <button
            type="button"
            onClick={() => setShowGrid((v) => !v)}
            className="absolute top-3 left-4 z-10 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-mono text-[10px] font-medium"
            style={{
              backgroundColor: showGrid ? 'var(--s2)' : 'var(--s1)',
              color: showGrid ? 'var(--branch-open)' : 'var(--t3)',
              border: showGrid ? '1px solid var(--border-strong)' : '1px solid var(--border)',
            }}
          >
            <Grid3X3 className="w-3 h-3" />
            <span>Grid</span>
          </button>
          <div
            className="pointer-events-none absolute inset-x-0 top-[44%] h-72 rounded-full blur-3xl"
            style={{ background: 'radial-gradient(ellipse at center, var(--ambient-glow), transparent 72%)' }}
          />

          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            nodeOrigin={[0.5, 0.5]}
            fitView
            fitViewOptions={{ padding: 0.16 }}
            minZoom={0.28}
            maxZoom={1.85}
            zoomOnScroll={false}
            zoomOnPinch={true}
            nodesDraggable={false}
            nodesConnectable={false}
            proOptions={{ hideAttribution: true }}
          >
            {showGrid && (
              <Background
                variant={BackgroundVariant.Dots}
                gap={26}
                size={1.35}
                color="var(--grid-dot)"
              />
            )}
          </ReactFlow>

          <SmoothZoomControls containerRef={flowContainerRef} />

          {/* Bottom Interactive Chapter Stepper Dots */}
          <div className="pointer-events-none absolute bottom-4 left-5 right-44 flex items-center justify-center">
            <div
              className="pointer-events-auto flex items-center gap-1.5 px-3.5 py-2 rounded-full overflow-x-auto max-w-full"
              style={{ backgroundColor: 'var(--s1)', border: '1px solid var(--border-strong)' }}
            >
              {visibleSteps.map((st, idx) => {
                const active = idx === safeStepIdx;
                const passed = idx < safeStepIdx;
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => {
                      setAutoPlay(false);
                      setStepIdx(idx);
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-mono text-[10px] transition-all whitespace-nowrap"
                    style={{
                      backgroundColor: active ? 'var(--trunk)' : passed ? 'var(--s2)' : 'transparent',
                      color: active ? 'var(--btn-ink)' : passed ? 'var(--branch-open)' : 'var(--t3)',
                      fontWeight: active ? 700 : 500,
                    }}
                  >
                    <span>{st.date.slice(5)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right-Hand Synchronized History Narrative & Summary Panel */}
        <aside
          className="w-[430px] shrink-0 h-full overflow-y-auto p-5 flex flex-col justify-between gap-4"
          style={{ backgroundColor: 'var(--s1)', borderLeft: '1px solid var(--border)' }}
        >
          <div className="space-y-4">
            {/* Step Progress + Date */}
            <div className="flex items-center justify-between gap-2">
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-mono text-[9.5px] font-bold"
                style={{
                  backgroundColor: 'var(--s2)',
                  color: currentStep.tone,
                  border: '1px solid var(--border-strong)',
                }}
              >
                <Sparkles className="w-3 h-3" />
                {currentStep.tag}
              </span>
              <span className="font-mono text-[10.5px] text-t3">
                Step {safeStepIdx + 1} / {visibleSteps.length} · {currentStep.dateLabel}
              </span>
            </div>

            <h2 className="font-serif italic text-[22px] text-t1 leading-snug">
              {currentStep.title}
            </h2>

            {/* 1. Why the Branch Was Created */}
            <div
              className="rounded-xl p-3.5 space-y-1.5"
              style={{ backgroundColor: 'var(--s2)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-center gap-1.5 font-mono text-[9.5px] font-bold uppercase tracking-wider text-branchOpen">
                <HelpCircle className="w-3.5 h-3.5" />
                <span>Why This Milestone Happened</span>
              </div>
              <p className="text-[12.5px] text-t2 leading-relaxed">{currentStep.whyCreated}</p>
            </div>

            {/* 2. Competing Hypotheses */}
            {currentStep.hypotheses.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 font-mono text-[9.5px] font-bold uppercase tracking-wider text-t3">
                  <FlaskConical className="w-3.5 h-3.5 text-hyp" />
                  <span>Hypotheses Explored ({currentStep.hypotheses.length})</span>
                </div>
                <div className="space-y-2">
                  {currentStep.hypotheses.map((h) => (
                    <div
                      key={h.name}
                      className="rounded-xl p-3 space-y-1"
                      style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[12.5px] font-semibold text-t1">{h.name}</span>
                        {statusPill(h.status)}
                      </div>
                      <p className="text-[11px] text-t3">{h.note}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 3. Experiment & Criterion */}
            <div
              className="rounded-xl p-3.5 space-y-1.5"
              style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-center gap-1.5 font-mono text-[9.5px] font-bold uppercase tracking-wider text-subCyan">
                <Lock className="w-3.5 h-3.5" />
                <span>Experiment &amp; Verification</span>
              </div>
              <p className="text-[12px] text-t2 leading-relaxed">{currentStep.experimentNote}</p>
            </div>

            {/* 4. Solution / Outcome */}
            <div
              className="rounded-xl p-3.5 space-y-1.5"
              style={{
                backgroundColor: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.34)',
              }}
            >
              <div className="flex items-center gap-1.5 font-mono text-[9.5px] font-bold uppercase tracking-wider text-ok">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Outcome &amp; Solution</span>
              </div>
              <p className="text-[12.5px] text-t1 leading-relaxed">{currentStep.solution}</p>
            </div>

            {/* Provenance Record Chips */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="font-mono text-[9.5px] text-t3">Records cited:</span>
              {currentStep.recordIds.map((rid) => (
                <button
                  key={rid}
                  type="button"
                  onClick={() => onOpenRecord(rid, 'raw')}
                  className="px-2 py-0.5 rounded-md font-mono text-[10px] font-semibold transition-transform hover:scale-105"
                  style={{
                    backgroundColor: 'var(--bg)',
                    color: 'var(--evi)',
                    border: '1px solid rgba(56, 189, 248, 0.42)',
                  }}
                >
                  {rid}
                </button>
              ))}
            </div>
          </div>

          {/* Bottom Next-Step Prompt */}
          <div className="pt-3 border-t flex items-center justify-between gap-2" style={{ borderColor: 'var(--border)' }}>
            {currentStep.branchId ? (
              <button
                type="button"
                onClick={() => onJumpToBranch(currentStep.branchId!)}
                className="font-mono text-[10.5px] font-semibold text-branchOpen hover:underline"
              >
                Open full branch workspace →
              </button>
            ) : (
              <span className="font-mono text-[10px] text-t3">Press → to animate next event</span>
            )}

            {safeStepIdx < visibleSteps.length - 1 && (
              <button
                type="button"
                onClick={() => setStepIdx((p) => p + 1)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg font-mono text-[10.5px] font-semibold"
                style={{ backgroundColor: 'var(--trunk)', color: 'var(--btn-ink)' }}
              >
                <span>Next step</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};

export const HistoryReplayView: React.FC<HistoryReplayViewProps> = (props) => (
  <ReactFlowProvider>
    <HistoryReplayInner {...props} />
  </ReactFlowProvider>
);
