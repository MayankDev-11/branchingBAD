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
import {
  AnchorNode,
  BranchHubNode,
  ChangeEventNode,
  EvidenceDewdropNode,
  ExperimentLeafNode,
  KnowledgeNode,
  MeltConfluenceNode,
  SubHypothesisNode,
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

const ALL_MILESTONES: HistoryMilestone[] = [
  {
    id: 'step_baseline',
    date: '2026-08-25',
    dateLabel: 'Aug 25, 2026',
    tag: 'BASELINE TRUNK STARTED',
    tone: 'var(--trunk)',
    title: 'Personal Baseline Trunk Initialized',
    whyCreated:
      'Apple Health export & daily hydration/symptom logs established your 30-day rolling personal normal (sleep 7h 10m ± 25m, steps 7,100/day, water 2.0 L).',
    hypotheses: [],
    experimentNote: 'No active experiments yet — passive baseline calibration window.',
    solution: 'Clean reference trunk ready to detect statistically meaningful shifts.',
    recordIds: ['sl_0412'],
  },
  {
    id: 'step_br0_open',
    date: '2026-10-01',
    dateLabel: 'Oct 1, 2026',
    tag: 'NEW BRANCH SPROUTED',
    tone: 'var(--branch-open)',
    title: 'Caffeine after 4 PM & sleep?',
    branchId: 'br_0',
    whyCreated:
      'You noticed slower sleep onset on weekdays and opened an investigation branch to test whether late afternoon coffee was the real culprit or a coincidence.',
    hypotheses: [
      { name: 'Late afternoon caffeine (>4 PM)', status: 'active', note: 'Primary suspect based on coffee timestamps' },
      { name: 'Late dinner timing', status: 'active', note: 'Competing digestive thermal load explanation' },
      { name: 'Evening workout intensity', status: 'active', note: 'Competing elevated heart-rate explanation' },
    ],
    experimentNote: 'Comparing 3 competing explanations before locking an experiment.',
    solution: 'In progress — evidence gathering across 14 nights.',
    recordIds: ['sl_0412', 'sl_0413'],
  },
  {
    id: 'step_br0_solved',
    date: '2026-10-22',
    dateLabel: 'Oct 22, 2026',
    tag: 'BRANCH SOLVED · MELTED',
    tone: 'var(--ok)',
    title: 'Solved: Caffeine after 4 PM cuts sleep ~30 min',
    branchId: 'br_0',
    whyCreated:
      'Completed a 14-day locked experiment (zero caffeine after 4 PM, 93% adherence). Python compared experiment sleep against your frozen Oct 1 baseline.',
    hypotheses: [
      { name: 'Late afternoon caffeine (>4 PM)', status: 'supported', note: '84% support · +31 min sleep recovered on cutoff nights' },
      { name: 'Late dinner timing', status: 'refuted', note: '18% · no consistent median sleep shift' },
      { name: 'Evening workout intensity', status: 'refuted', note: '12% · weak correlation across 14 nights' },
    ],
    experimentNote: 'Locked criterion met: average sleep rose >= 25 min across 13 of 14 adherent nights.',
    solution:
      'All 3 sub-branches melted into one verified Knowledge conclusion: cut off caffeine by 4 PM to protect ~30 minutes of sleep.',
    recordIds: ['sl_0412', 'sl_0413'],
  },
  {
    id: 'step_ce1',
    date: '2026-11-03',
    dateLabel: 'Nov 3, 2026',
    tag: 'CHANGE EVENT DETECTED',
    tone: 'var(--change)',
    title: 'PELT Alert: Sleep dropped 47 min',
    branchId: 'br_1',
    whyCreated:
      'Deterministic ruptures (PELT) flagged 5 of 7 consecutive nights more than 2 MAD below your 7h 10m normal, pinning the exact shift onset to November 3.',
    hypotheses: [],
    experimentNote: 'System surfaces a red change-event dot on the trunk — never auto-opens a branch without your approval.',
    solution: 'Prompted investigation into recurring afternoon headaches that began the next day.',
    recordIds: ['sl_0412', 'sl_0413'],
  },
  {
    id: 'step_br1_open',
    date: '2026-11-05',
    dateLabel: 'Nov 5, 2026',
    tag: 'NEW BRANCH · SHARED LINK',
    tone: 'var(--branch-open)',
    title: 'Why do I keep getting headaches?',
    branchId: 'br_1',
    whyCreated:
      'You asked about recurring headaches after the Nov 3 sleep drop. Python extracted cross-signal counts and Bedrock drafted 3 ranked competing hypotheses (1 uncited claim dropped).',
    hypotheses: [
      { name: 'Short sleep (<6 hours)', status: 'supported', note: '72% · 4 of 5 headache days followed nights under 6h' },
      { name: 'Low water intake (<1 L)', status: 'testing', note: '41% · 3 of 5 headache days had low hydration' },
      { name: 'Screen light before bed', status: 'active', note: '28% · likely upstream driver of late sleep' },
    ],
    experimentNote: 'Shared sleep records automatically linked this branch back to your October Caffeine investigation.',
    solution: 'Short sleep ranked #1; 1 honest counterexample on Nov 9 preserved.',
    recordIds: ['sl_0412', 'hd_0031', 'wt_0210'],
  },
  {
    id: 'step_br1_exp',
    date: '2026-11-10',
    dateLabel: 'Nov 10, 2026',
    tag: 'CRITERION LOCKED',
    tone: 'var(--sub-cyan)',
    title: 'Experiment Locked: Lights out by 11:30 PM (10d)',
    branchId: 'br_1',
    whyCreated:
      'Pre-registered a 10-night controlled sleep intervention with a SQLite database trigger locking the success criterion so goalposts cannot be moved afterward.',
    hypotheses: [
      { name: 'Short sleep (<6 hours)', status: 'testing', note: 'Active 10-night experiment · 80% adherence (8/10 nights)' },
      { name: 'Low water intake (<1 L)', status: 'active', note: 'Queued backup test: 2 L water daily (10d)' },
      { name: 'Screen light before bed', status: 'active', note: 'Queued backup test: No screens after 10 PM (7d)' },
    ],
    experimentNote: 'Locked criterion: Sleep average must exceed 7 hours on >= 7 of 10 nights.',
    solution: 'On track at 80% adherence; awaiting final 2 nights for Python verdict.',
    recordIds: ['sl_0412', 'hd_0031', 'wt_0210'],
  },
  {
    id: 'step_br1_solved',
    date: '2026-11-22',
    dateLabel: 'Nov 22, 2026',
    tag: 'RESOLVED · KNOWLEDGE MELTED',
    tone: 'var(--ok)',
    title: 'Solved: 11:30 PM bedtime cut headaches by 75%',
    branchId: 'br_1',
    whyCreated:
      'Experiment reached Day 10 at 90% adherence. Python evaluated experiment nights against the frozen Nov 10 baseline and verified the locked criterion was met.',
    hypotheses: [
      { name: 'Short sleep (<6 hours)', status: 'supported', note: 'Confirmed primary cause · sleep rose to 7h 18m' },
      { name: 'Low water intake (<1 L)', status: 'refuted', note: 'Secondary factor; not required once sleep recovered' },
      { name: 'Screen light before bed', status: 'refuted', note: 'Addressed indirectly by 11:30 PM lights-out boundary' },
    ],
    experimentNote: 'Criterion met deterministically in Python (no AI override).',
    solution:
      'All 3 headache sub-branches melted into Verified Knowledge: protecting an 11:30 PM bedtime restores sleep above 7h and cuts headaches by 75%.',
    recordIds: ['sl_0412', 'hd_0031'],
  },
];

interface HistoryReplayViewProps {
  onOpenRecord: (id: string, tab?: 'raw' | 'ai') => void;
  onJumpToBranch: (branchId: string) => void;
}

const HistoryReplayInner: React.FC<HistoryReplayViewProps> = ({
  onOpenRecord,
  onJumpToBranch,
}) => {
  const { fitView } = useReactFlow();
  const [dateFrom, setDateFrom] = useState('2026-08-25');
  const [dateTo, setDateTo] = useState('2026-11-22');
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
        recordIds: ['sl_0412'],
      };
      return [startAnchor, ...inside];
    }
    return inside;
  }, [dateFrom, dateTo]);

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
    const rangeStart = '2026-08-25';
    const isFresh = (stepId: string) => currentStep.id === stepId;

    // Trunk grows smoothly from dateFrom -> currentDate (minimum 260px so initial trunk looks clean & alive)
    const startX = Math.max(40, dateToX(rangeStart, dateFrom) - 30);
    const currentX = Math.max(startX + 260, dateToX(rangeStart, currentDate) + 180);

    n.push(
      { id: 'h-trunk-start', type: 'anchor', position: { x: startX, y: TRUNK_Y }, data: {} },
      { id: 'h-trunk-end', type: 'anchor', position: { x: currentX, y: TRUNK_Y }, data: {} }
    );

    const allTicks = [
      { date: '2026-08-25', label: 'Aug 25' },
      { date: '2026-09-10', label: 'Sep 10' },
      { date: '2026-10-01', label: 'Oct 1' },
      { date: '2026-10-22', label: 'Oct 22' },
      { date: '2026-11-03', label: 'Nov 3' },
      { date: '2026-11-10', label: 'Nov 10' },
      { date: '2026-11-22', label: 'Nov 22' },
    ]
      .filter((t) => t.date >= dateFrom && t.date <= currentDate)
      .map((t) => ({ x: dateToX(rangeStart, t.date), label: t.label }));

    e.push({
      id: 'h-edge-trunk',
      source: 'h-trunk-start',
      target: 'h-trunk-end',
      type: 'trunk',
      data: { kind: 'trunk', dateTicks: allTicks, animateFlow: true },
    });

    // STEP: Branch 0 (Oct 1) — Upper side of trunk
    if (revealedIds.has('step_br0_open')) {
      const fresh = isFresh('step_br0_open');
      const solved = revealedIds.has('step_br0_solved');
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
            title: 'Caffeine after 4 PM & sleep?',
            status: solved ? 'concluded' : 'open',
            labelSide: 'below',
            subtitle: solved ? 'Solved Oct 22 · 3 melted' : 'Opened Oct 1 · 3 competing hypotheses',
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
      n.push(
        {
          id: 'h-br0-s1',
          type: 'subHypothesis',
          position: { x: sub0X, y: b0HubY - 105 },
          data: {
            rank: 1,
            label: 'Late caffeine',
            confidence: solved ? 84 : 60,
            detail: solved ? 'Supported · -31m sleep' : 'Testing caffeine cutoff',
            tone: solved ? 'solved' : 'emerald',
            compact: true,
            animateIn: fresh,
            onClick: () => onJumpToBranch('br_0'),
          },
        },
        {
          id: 'h-br0-s2',
          type: 'subHypothesis',
          position: { x: sub0X, y: b0HubY },
          data: {
            rank: 2,
            label: 'Dinner timing',
            confidence: 18,
            detail: solved ? 'Refuted · no shift' : 'Competing hypothesis',
            tone: 'muted',
            compact: true,
            animateIn: fresh,
            onClick: () => onJumpToBranch('br_0'),
          },
        },
        {
          id: 'h-br0-s3',
          type: 'subHypothesis',
          position: { x: sub0X, y: b0HubY + 100 },
          data: {
            rank: 3,
            label: 'Late workout',
            confidence: 12,
            detail: solved ? 'Refuted · weak link' : 'Competing hypothesis',
            tone: 'muted',
            compact: true,
            animateIn: fresh,
            onClick: () => onJumpToBranch('br_0'),
          },
        }
      );

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
            data: { label: '3 melted -> 1 truth', animateIn: freshSolve, onClick: () => onJumpToBranch('br_0') },
          },
          {
            id: 'h-br0-kn',
            type: 'knowledgeNode',
            position: { x: melt0X + 245, y: b0HubY },
            data: {
              branchId: 'br_0',
              statement: 'Caffeine after 4 PM cuts my sleep by about 30 min',
              dateLabel: 'Oct 22',
              confidence: 'Medium · 14d Exp',
              recordIds: ['sl_0412', 'sl_0413'],
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
    if (revealedIds.has('step_ce1')) {
      const fresh = isFresh('step_ce1');
      n.push({
        id: 'h-ce-1',
        type: 'changeEvent',
        position: { x: dateToX(rangeStart, '2026-11-03'), y: TRUNK_Y },
        data: {
          label: 'sleep -47 min',
          dateLabel: 'Nov 3',
          spotlight: fresh,
          animateIn: fresh,
          onClick: () => onJumpToBranch('br_1'),
        },
      });
    }

    // STEP: Branch 1 (Nov 5) — Alternated cleanly to LOWER side of trunk!
    if (revealedIds.has('step_br1_open')) {
      const fresh = isFresh('step_br1_open');
      const hasExp = revealedIds.has('step_br1_exp');
      const solved = revealedIds.has('step_br1_solved');
      const b1StartX = dateToX(rangeStart, '2026-11-05');
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
            title: 'Why do I keep getting headaches?',
            status: solved ? 'concluded' : 'open',
            labelSide: 'below',
            subtitle: solved
              ? 'Solved Nov 22 · 3 melted into Knowledge'
              : hasExp
              ? 'Locked 10d Experiment · 80% adherence'
              : 'Opened Nov 5 · 3 competing hypotheses',
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
      n.push(
        {
          id: 'h-br1-s1',
          type: 'subHypothesis',
          position: { x: sub1X, y: b1HubY - 115 },
          data: {
            rank: 1,
            label: 'Short sleep',
            confidence: 72,
            detail: '4/5 days <6h · sl_0412',
            tone: solved ? 'solved' : 'emerald',
            animateIn: fresh,
            onClick: () => onJumpToBranch('br_1'),
          },
        },
        {
          id: 'h-br1-s2',
          type: 'subHypothesis',
          position: { x: sub1X, y: b1HubY },
          data: {
            rank: 2,
            label: 'Low water intake',
            confidence: 41,
            detail: '3/5 days <1 L · wt_0210',
            tone: 'cyan',
            animateIn: fresh,
            onClick: () => onJumpToBranch('br_1'),
          },
        },
        {
          id: 'h-br1-s3',
          type: 'subHypothesis',
          position: { x: sub1X, y: b1HubY + 115 },
          data: {
            rank: 3,
            label: 'Screen light',
            confidence: 28,
            detail: 'Upstream sleep driver',
            tone: 'muted',
            animateIn: fresh,
            onClick: () => onJumpToBranch('br_1'),
          },
        }
      );

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
      if (hasExp && !solved) {
        const freshExp = isFresh('step_br1_exp');
        const twigX = sub1X + 275;
        n.push(
          {
            id: 'h-br1-exp',
            type: 'experimentLeaf',
            position: { x: twigX + 15, y: b1HubY - 145 },
            data: {
              description: 'Lights out 11:30 PM (10d)',
              adherence: 80,
              locked: true,
              animateIn: freshExp,
              onClick: () => onJumpToBranch('br_1'),
            },
          },
          {
            id: 'h-ev-sl',
            type: 'evidenceDewdrop',
            position: { x: twigX, y: b1HubY - 76 },
            data: {
              recordId: 'sl_0412',
              summary: '5h 15m',
              animateIn: freshExp,
              onOpenRecord: (id: string) => onOpenRecord(id, 'raw'),
            },
          },
          {
            id: 'h-ev-wt',
            type: 'evidenceDewdrop',
            position: { x: twigX, y: b1HubY + 28 },
            data: {
              recordId: 'wt_0210',
              summary: '820 ml',
              animateIn: freshExp,
              onOpenRecord: (id: string) => onOpenRecord(id, 'raw'),
            },
          }
        );
        e.push(
          { id: 'h-e-exp', source: 'h-br1-s1', target: 'h-br1-exp', type: 'organicBranch', data: { kind: 'sub-exp', isNewStep: freshExp } },
          { id: 'h-e-ev1', source: 'h-br1-s1', target: 'h-ev-sl', type: 'organicBranch', data: { kind: 'evidence-tendril', isNewStep: freshExp } },
          { id: 'h-e-ev2', source: 'h-br1-s2', target: 'h-ev-wt', type: 'organicBranch', data: { kind: 'evidence-tendril', isNewStep: freshExp } }
        );
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
            data: { label: '3 melted -> 1 truth', animateIn: freshSolve, onClick: () => onJumpToBranch('br_1') },
          },
          {
            id: 'h-br1-kn',
            type: 'knowledgeNode',
            position: { x: melt1X + 245, y: b1HubY },
            data: {
              branchId: 'br_1',
              statement: 'Lights out by 11:30 PM increased sleep to 7h 18m and cut headaches by 75%',
              dateLabel: 'Nov 22',
              confidence: 'High · 10d Exp',
              recordIds: ['sl_0412', 'hd_0031'],
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

    return { nodes: n, edges: e };
  }, [dateFrom, currentDate, currentStep, revealedIds, onJumpToBranch, onOpenRecord]);

  // Smoothly pan/fit the camera as new branches grow on each Right Arrow press!
  useEffect(() => {
    const timer = setTimeout(() => {
      fitView({ padding: 0.16, duration: 480 });
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
              min="2026-08-25"
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
              max="2026-11-22"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-2.5 py-1 rounded-lg font-mono text-[11px] text-t1 focus:outline-none"
              style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border-strong)' }}
            />
          </label>

          {/* Quick Range Presets */}
          <div className="hidden xl:flex items-center gap-1.5 ml-1">
            {[
              { lbl: 'Full 90d', from: '2026-08-25', to: '2026-11-22' },
              { lbl: 'Oct–Nov', from: '2026-09-25', to: '2026-11-22' },
              { lbl: 'Nov Only', from: '2026-11-01', to: '2026-11-22' },
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
                      color: active ? '#030c0e' : passed ? 'var(--branch-open)' : 'var(--t3)',
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
