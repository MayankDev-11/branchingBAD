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
import { Clock, FileSearch, GitBranch, Grid3X3, Mic, Plus, RotateCcw, Sparkles, Waves } from 'lucide-react';
import type { BranchDetailResponse, BranchHypothesis, GraphResponse, InsightsResponse } from '../../types';
import { alternatingY, dateToX, TRUNK_Y } from './graphMath';
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
} from './CustomNodes';
import { OrganicBranchEdge, TrunkEdge } from './CustomEdges';
import { ElevenLabsBriefingDock, type BriefingBeat } from '../ElevenLabsBriefingDock';
import { SmoothZoomControls } from './SmoothZoomControls';

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

// Labels on the graph are built from the API data; these only format it.
const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const daysBetween = (fromIso: string, toIso: string) =>
  Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
// "11 of 13 short nights came after ..." -> "11 of 13 short nights"
const claimCount = (hyp?: BranchHypothesis) => {
  const text = hyp?.claims[0]?.text;
  if (!text) return 'Not enough data yet';
  const m = text.match(/^(\d+ of \d+ \S+ \S+)/);
  return m ? m[1] : text;
};
const firstClaimIds = (hyp: BranchHypothesis | undefined, count: number) =>
  (hyp?.claims[0]?.record_ids ?? []).slice(0, count);
const METRIC_WORD: Record<string, string> = { sl: 'Sleep', hd: 'Headache', wt: 'Water', sc: 'Screen', cf: 'Caffeine' };

// Default zoom: fit the whole graph, but never so far out that labels can't be read on a
// projector. The trunk's far ends may sit just off screen; pan or zoom out to see them.
const MIN_READABLE_ZOOM = 0.66;
const MIN_READABLE_ZOOM_WITH_PANEL = 0.55;

// The guided audio brief: four short lines built only from API numbers (rule 9).
const buildBriefing = (
  graph: GraphResponse,
  details: Record<string, BranchDetailResponse>,
  insights: InsightsResponse | null
): BriefingBeat[] => {
  const beats: Omit<BriefingBeat, 'label'>[] = [];
  const shift = insights?.sleep_shift;
  if (shift) {
    beats.push({
      id: 'beat-change',
      text: `Your sleep normal was ${spokenMinutes(shift.before_median_min)} until ${longDate(shift.date)}, when Python detected a ${Math.abs(
        shift.delta_min
      )} minute drop.`,
      recordIds: shift.record_ids.slice(0, 2),
      highlightNodes: [`ce-${shift.change_event_id}`],
    });
  }
  const openBranch = graph.branches.find((b) => b.status === 'open');
  const top = openBranch ? details[openBranch.id]?.hypotheses[0] : undefined;
  if (openBranch && top?.claims[0]) {
    beats.push({
      id: 'beat-cause',
      text: `For "${openBranch.title}", the strongest pattern is ${(top.label ?? '').toLowerCase()}: ${top.claims[0].text}.`,
      recordIds: top.claims[0].record_ids.slice(0, 2),
      highlightNodes: [`br1-hub`, 'br1-sub-1', 'ev-dew-sl1'],
    });
  }
  const exp = insights?.experiment;
  if (exp) {
    const lastNight = [...exp.nights].reverse().find((night) => night.record_id);
    beats.push({
      id: 'beat-experiment',
      text: `Your locked experiment, ${exp.description.toLowerCase()}, is at ${exp.adherence_pct} percent adherence after ${
        exp.days_elapsed
      } of ${exp.duration_days} nights. ${exp.nights_met} of ${exp.nights_logged} nights met the target so far.`,
      recordIds: lastNight?.record_id ? [lastNight.record_id] : [],
      highlightNodes: ['br1-exp-1'],
    });
  }
  const verifiedKnowledge = graph.knowledge.filter(({ id }) => !id.startsWith('kn_br_custom_'));
  const latest = verifiedKnowledge.slice(-1)[0];
  if (latest) {
    const solved = graph.branches.find((b) =>
      !b.id.startsWith('br_custom_') && b.status === 'concluded' && b.end_date === latest.date);
    beats.push({
      id: 'beat-knowledge',
      text: `${verifiedKnowledge.length === 1 ? 'One investigation has' : `${verifiedKnowledge.length} investigations have`} become verified knowledge. Latest: ${latest.statement}.`,
      recordIds: solved ? firstClaimIds(details[solved.id]?.hypotheses[0], 2) : [],
      highlightNodes: [solved?.id === 'br_1' ? 'br1-knowledge' : 'br0-knowledge'],
    });
  }
  return beats.map((b, i) => ({ ...b, label: `${i + 1} / ${beats.length} · ${BEAT_TITLES[b.id]}` }));
};

const BEAT_TITLES: Record<string, string> = {
  'beat-change': 'Change Detected',
  'beat-cause': 'Top Verified Pattern',
  'beat-experiment': 'Locked Experiment',
  'beat-knowledge': 'Verified Knowledge',
};
const spokenMinutes = (min: number) => `${Math.floor(min / 60)} hours ${Math.round(min % 60)} minutes`;
const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });

interface GraphCanvasProps {
  graph: GraphResponse;
  insights: InsightsResponse | null;
  branchDetailsMap: Record<string, BranchDetailResponse>;
  selectedBranchId: string | null;
  isRightPanelOpen: boolean;
  demoDaysAdvanced: number;
  onSelectBranch: (id: string) => void;
  onOpenRecord: (id: string, tab?: 'raw' | 'ai') => void;
  onAdvanceDemo: (days: number) => void;
  onOpenNewBranch: (mode: 'manual' | 'voice') => void;
}

const GraphCanvasInner: React.FC<GraphCanvasProps> = ({
  graph,
  insights,
  branchDetailsMap,
  selectedBranchId,
  isRightPanelOpen,
  demoDaysAdvanced,
  onSelectBranch,
  onOpenRecord,
  onAdvanceDemo,
  onOpenNewBranch,
}) => {
  const { fitView, getNodes } = useReactFlow();
  const [showEvidenceNodes, setShowEvidenceNodes] = useState(true);
  const [showSharedMycelium, setShowSharedMycelium] = useState(true);
  const [animateSap, setAnimateSap] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const flowContainerRef = useRef<HTMLDivElement | null>(null);
  const [spotlightIds, setSpotlightIds] = useState<string[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      // Frame the branches and their nodes, not the trunk's far ends, so a new knowledge node
      // at the right edge is never cut off.
      // (Branch start points stay in, since they sit left of each branch title.)
      const content = getNodes()
        .filter((node) => node.id !== 'trunk-start' && node.id !== 'trunk-end')
        .map((node) => ({ id: node.id }));
      fitView({
        nodes: content.length ? content : undefined,
        padding: 0.06,
        minZoom: isRightPanelOpen ? MIN_READABLE_ZOOM_WITH_PANEL : MIN_READABLE_ZOOM,
        duration: 380,
      });
    }, 90);
    return () => clearTimeout(timer);
  }, [isRightPanelOpen, graph, showEvidenceNodes, fitView]);

  const { nodes, edges } = useMemo(() => {
    const n: Node[] = [];
    const e: Edge[] = [];
    const rangeStart = graph.range.start;
    const isLit = (id: string) => spotlightIds.includes(id);

    // 1. Living Organic Main Root Trunk
    const trunkStartX = 40;
    const extraBranches = graph.branches.filter((branch) => branch.id.startsWith('br_custom_') && branch.status === 'open');
    const resolutions = graph.knowledge.filter((item) => item.id.startsWith('kn_br_custom_'));
    const trunkEndX = Math.max(
      1960,
      1530 + extraBranches.length * 240 + (extraBranches.length > 0 ? 420 : 0),
      1350 + resolutions.length * 185
    );
    n.push(
      { id: 'trunk-start', type: 'anchor', position: { x: trunkStartX, y: TRUNK_Y }, data: {} },
      { id: 'trunk-end', type: 'anchor', position: { x: trunkEndX, y: TRUNK_Y }, data: {} }
    );

    // Ticks at the dates that matter (first day, branch starts, change events, conclusions,
    // today), skipping any closer than 7 days to the previous one so labels never overlap.
    const tickDates = [
      graph.range.start,
      ...graph.branches.map((b) => b.start_date),
      ...graph.change_events.map((ce) => ce.date),
      ...graph.knowledge.map((k) => k.date),
      graph.range.end,
    ]
      .filter((d, i, all) => all.indexOf(d) === i)
      .sort();
    const dateTicks: { x: number; label: string }[] = [];
    let lastTick = '';
    for (const d of tickDates) {
      if (lastTick && daysBetween(lastTick, d) < 7 && d !== graph.range.end) continue;
      if (lastTick && daysBetween(lastTick, d) < 7) dateTicks.pop(); // keep "today" over a close neighbour
      dateTicks.push({ x: dateToX(rangeStart, d), label: shortDate(d) });
      lastTick = d;
    }
    dateTicks.push({ x: trunkEndX - 220, label: 'Future Growth' });

    e.push({
      id: 'edge-trunk',
      source: 'trunk-start',
      target: 'trunk-end',
      type: 'trunk',
      data: { kind: 'trunk', dateTicks, animateFlow: animateSap },
    });

    // 2. Change Event Nodes on Trunk
    graph.change_events.forEach((ce) => {
      const cx = dateToX(rangeStart, ce.date);
      const shortDate = new Date(`${ce.date}T00:00:00Z`).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      });
      n.push({
        id: `ce-${ce.id}`,
        type: 'changeEvent',
        position: { x: cx, y: TRUNK_Y },
        data: {
          label: `sleep ${ce.delta} min`,
          dateLabel: shortDate,
          spotlight: isLit(`ce-${ce.id}`),
          onClick: () => onSelectBranch('br_1'),
        },
      });
    });

    // 3. BRANCH 0 (SOLVED — UPPER SIDE OF TRUNK)
    // 3 sub-branches melt into 1 stem -> ends in sleek Verified Knowledge node (never mixes back to trunk)
    const br0 = graph.branches.find((b) => b.id === 'br_0');
    const br0Detail = branchDetailsMap['br_0'];
    const kn1 = graph.knowledge.find((k) => k.id === 'kn_1');
    if (br0 && kn1 && br0Detail) {
      const br0Hyps = br0Detail.hypotheses.slice(0, 3);
      const br0Exp = br0Detail.experiment;
      const b0StartX = 240;
      const b0HubX = 415;
      const b0HubY = alternatingY(-1, 1);

      n.push(
        { id: 'br0-start', type: 'anchor', position: { x: b0StartX, y: TRUNK_Y }, data: {} },
        {
          id: 'br0-hub',
          type: 'branchHub',
          position: { x: b0HubX, y: b0HubY },
          data: {
            id: 'br_0',
            title: br0.title,
            status: br0.status,
            labelSide: 'below',
            subtitle: `Solved ${shortDate(br0.end_date ?? kn1.date)} · ${br0Hyps.length} sub-branches melted`,
            isSelected: selectedBranchId === 'br_0',
            spotlight: isLit('br0-hub'),
            onSelect: onSelectBranch,
          },
        }
      );

      e.push({
        id: 'edge-br0-root',
        source: 'br0-start',
        target: 'br0-hub',
        type: 'organicBranch',
        data: { kind: 'branch-concluded', animateFlow: animateSap },
      });

      const sub0X = b0HubX + 275;
      const melt0X = sub0X + 215;
      const melt0Y = b0HubY;

      // Sub-branches, confidences and claim counts all come from GET /api/branches/br_0.
      const br0Offsets = [-105, 0, 100];
      br0Hyps.forEach((hyp, idx) => {
        n.push({
          id: `br0-sub-${idx + 1}`,
          type: 'subHypothesis',
          position: { x: sub0X, y: b0HubY + br0Offsets[idx] },
          data: {
            rank: hyp.rank,
            label: hyp.label ?? hyp.text ?? 'Hypothesis',
            confidence: hyp.confidence ?? 0,
            detail:
              idx === 0 && br0Exp
                ? `${capitalize(br0Exp.status.replace('_', ' '))} · ${claimCount(hyp)}`
                : claimCount(hyp),
            tone: idx === 0 ? 'solved' : 'muted',
            compact: true,
            spotlight: idx === 0 ? isLit('br0-sub-1') : false,
            onClick: () => onSelectBranch('br_0'),
          },
        });
      });

      n.push(
        {
          id: 'br0-melt',
          type: 'meltConfluence',
          position: { x: melt0X, y: melt0Y },
          data: {
            label: `${br0Hyps.length} melted → 1 truth`,
            onClick: () => onSelectBranch('br_0'),
          },
        },
        {
          id: 'br0-knowledge',
          type: 'knowledgeNode',
          position: { x: melt0X + 245, y: melt0Y },
          data: {
            branchId: 'br_0',
            statement: kn1.statement,
            dateLabel: shortDate(kn1.date),
            confidence: `${capitalize(kn1.confidence)}${br0Exp ? ` · ${br0Exp.duration_days}d Exp` : ''}`,
            recordIds: firstClaimIds(br0Hyps[0], 2),
            spotlight: isLit('br0-knowledge'),
            onSelectBranch,
            onOpenRecord: (rid: string) => onOpenRecord(rid, 'raw'),
          },
        }
      );

      e.push(
        { id: 'e-br0-s1', source: 'br0-hub', target: 'br0-sub-1', type: 'organicBranch', data: { kind: 'sub-emerald', animateFlow: animateSap } },
        { id: 'e-br0-s2', source: 'br0-hub', target: 'br0-sub-2', type: 'organicBranch', data: { kind: 'sub-muted', animateFlow: false } },
        { id: 'e-br0-s3', source: 'br0-hub', target: 'br0-sub-3', type: 'organicBranch', data: { kind: 'sub-muted', animateFlow: false } },
        { id: 'e-br0-m1', source: 'br0-sub-1', target: 'br0-melt', type: 'organicBranch', data: { kind: 'melt-converge', animateFlow: animateSap } },
        { id: 'e-br0-m2', source: 'br0-sub-2', target: 'br0-melt', type: 'organicBranch', data: { kind: 'melt-converge', animateFlow: false } },
        { id: 'e-br0-m3', source: 'br0-sub-3', target: 'br0-melt', type: 'organicBranch', data: { kind: 'melt-converge', animateFlow: false } },
        { id: 'e-br0-kn', source: 'br0-melt', target: 'br0-knowledge', type: 'organicBranch', data: { kind: 'knowledge-stem', animateFlow: animateSap } }
      );
    }

    // 4. BRANCH 1 (OPEN — ALTERNATED TO LOWER SIDE OF TRUNK)
    const br1 = graph.branches.find((b) => b.id === 'br_1');
    const br1Detail = branchDetailsMap['br_1'];
    if (br1 && br1Detail) {
      const b1Solved = br1.status === 'concluded';
      const b1StartX = dateToX(rangeStart, br1.start_date);
      const b1HubX = b1StartX + 185;
      const b1HubY = alternatingY(1, 1);

      n.push(
        { id: 'br1-start', type: 'anchor', position: { x: b1StartX, y: TRUNK_Y }, data: {} },
        {
          id: 'br1-hub',
          type: 'branchHub',
          position: { x: b1HubX, y: b1HubY },
          data: {
            id: 'br_1',
            title: br1.title,
            status: br1.status,
            labelSide: 'below',
            subtitle: b1Solved
              ? `Solved · ${br1Detail.hypotheses.length} sub-branches melted into Knowledge`
              : `Open · ${daysBetween(br1.start_date, graph.range.end) + 1} days · ${br1Detail.hypotheses.length} sub-branches`,
            isSelected: selectedBranchId === 'br_1',
            spotlight: isLit('br1-hub'),
            onSelect: onSelectBranch,
          },
        }
      );

      e.push({
        id: 'edge-br1-root',
        source: 'br1-start',
        target: 'br1-hub',
        type: 'organicBranch',
        data: { kind: b1Solved ? 'branch-concluded' : 'branch-open', animateFlow: animateSap },
      });

      const sub1X = b1HubX + 290;
      const subOffsets = [-120, 0, 120];
      const tones: Array<'emerald' | 'cyan' | 'muted'> = ['emerald', 'cyan', 'muted'];
      const edgeKinds: Array<'sub-emerald' | 'sub-cyan' | 'sub-muted'> = [
        'sub-emerald',
        'sub-cyan',
        'sub-muted',
      ];

      br1Detail.hypotheses.slice(0, 3).forEach((hyp, idx) => {
        const hid = `br1-sub-${hyp.rank}`;
        const hy = b1HubY + subOffsets[idx];
        const firstRec = hyp.claims[0]?.record_ids[0];
        const detailText = firstRec ? `${claimCount(hyp)} · ${firstRec}` : claimCount(hyp);

        n.push({
          id: hid,
          type: 'subHypothesis',
          position: { x: sub1X, y: hy },
          data: {
            rank: hyp.rank,
            label: hyp.label ?? hyp.text ?? 'Hypothesis',
            confidence: hyp.confidence ?? 50,
            detail: detailText,
            tone: b1Solved && idx === 0 ? 'solved' : tones[idx],
            spotlight: isLit(hid),
            onClick: () => onSelectBranch('br_1'),
          },
        });

        e.push({
          id: `e-br1-s-${hyp.rank}`,
          source: 'br1-hub',
          target: hid,
          type: 'organicBranch',
          data: { kind: edgeKinds[idx], animateFlow: animateSap },
        });
      });

      if (b1Solved) {
        const melt1X = sub1X + 230;
        const melt1Y = b1HubY;
        const kn2 = graph.knowledge.find((k) => k.id === 'kn_2');

        n.push(
          {
            id: 'br1-melt',
            type: 'meltConfluence',
            position: { x: melt1X, y: melt1Y },
            data: {
              label: `${br1Detail.hypotheses.length} melted → 1 truth`,
              onClick: () => onSelectBranch('br_1'),
            },
          },
          {
            id: 'br1-knowledge',
            type: 'knowledgeNode',
            position: { x: melt1X + 245, y: melt1Y },
            data: {
              branchId: 'br_1',
              statement: kn2?.statement ?? `${br1.title} Concluded by a locked experiment.`,
              dateLabel: shortDate(kn2?.date ?? br1.end_date ?? graph.range.end),
              confidence: `${capitalize(kn2?.confidence ?? 'pending')}${
                br1Detail.experiment ? ` · ${br1Detail.experiment.duration_days}d Exp` : ''
              }`,
              recordIds: firstClaimIds(br1Detail.hypotheses[0], 2),
              isNew: true,
              spotlight: isLit('br1-knowledge'),
              onSelectBranch,
              onOpenRecord: (rid: string) => onOpenRecord(rid, 'raw'),
            },
          }
        );

        e.push(
          { id: 'e-br1-m1', source: 'br1-sub-1', target: 'br1-melt', type: 'organicBranch', data: { kind: 'melt-converge', animateFlow: animateSap } },
          { id: 'e-br1-m2', source: 'br1-sub-2', target: 'br1-melt', type: 'organicBranch', data: { kind: 'melt-converge', animateFlow: false } },
          { id: 'e-br1-m3', source: 'br1-sub-3', target: 'br1-melt', type: 'organicBranch', data: { kind: 'melt-converge', animateFlow: false } },
          { id: 'e-br1-kn', source: 'br1-melt', target: 'br1-knowledge', type: 'organicBranch', data: { kind: 'knowledge-stem', animateFlow: animateSap } }
        );
      } else {
        const twigX = sub1X + 280;
        if (br1Detail.experiment) {
          n.push({
            id: 'br1-exp-1',
            type: 'experimentLeaf',
            position: { x: twigX + 20, y: b1HubY - 155 },
            data: {
              description: `${br1Detail.experiment.description} (${br1Detail.experiment.duration_days}d)`,
              adherence: br1Detail.experiment.adherence_pct,
              locked: br1Detail.experiment.locked,
              spotlight: isLit('br1-exp-1'),
              onClick: () => onSelectBranch('br_1'),
            },
          });
          e.push({
            id: 'e-br1-exp-1',
            source: 'br1-sub-1',
            target: 'br1-exp-1',
            type: 'organicBranch',
            data: { kind: 'sub-exp', animateFlow: animateSap },
          });
        }

        // Proposed (not yet locked) tests for hypotheses 2 and 3, as stored in the database.
        const proposals = [
          { idx: 1, y: b1HubY + 6, kind: 'sub-cyan' as const },
          { idx: 2, y: b1HubY + 132, kind: 'sub-muted' as const },
        ];
        proposals.forEach(({ idx, y, kind }) => {
          const hyp = br1Detail.hypotheses[idx];
          if (!hyp?.test) return;
          n.push({
            id: `br1-exp-${idx + 1}`,
            type: 'experimentLeaf',
            position: { x: twigX + 20, y },
            data: {
              // The stored text usually says "for 10 days" already; only add the length if not.
              description: hyp.test_days && !/\bdays?\b/.test(hyp.test) ? `${hyp.test} (${hyp.test_days}d)` : hyp.test,
              adherence: 0,
              locked: false,
              isDraft: true,
              onClick: () => onSelectBranch('br_1'),
            },
          });
          e.push({
            id: `e-br1-exp-${idx + 1}`,
            source: `br1-sub-${hyp.rank}`,
            target: `br1-exp-${idx + 1}`,
            type: 'organicBranch',
            data: { kind, animateFlow: false },
          });
        });

        // Evidence dots: real records cited by hypotheses 1 and 2, with their stored labels.
        if (showEvidenceNodes) {
          const evidenceById = new Map(br1Detail.evidence.map((row) => [row.id, row]));
          const cited = (hypIdx: number, prefix: string) =>
            (br1Detail.hypotheses[hypIdx]?.claims[0]?.record_ids ?? []).find((id) => id.startsWith(prefix));
          const dots = [
            { id: 'ev-dew-sl1', hyp: 0, rec: cited(0, 'sl_'), y: b1HubY - 94 },
            { id: 'ev-dew-sl2', hyp: 0, rec: cited(0, 'hd_'), y: b1HubY - 52 },
            { id: 'ev-dew-wt', hyp: 1, rec: cited(1, 'wt_'), y: b1HubY + 64 },
          ];
          dots.forEach((dot) => {
            if (!dot.rec) return;
            const row = evidenceById.get(dot.rec);
            n.push({
              id: dot.id,
              type: 'evidenceDewdrop',
              position: { x: twigX, y: dot.y },
              data: {
                recordId: dot.rec,
                summary: row ? row.label.replace(/ (sleep|water)$/, '') : METRIC_WORD[dot.rec.slice(0, 2)] ?? 'Record',
                spotlight: isLit(dot.id),
                onOpenRecord: (id: string) => onOpenRecord(id, 'raw'),
              },
            });
            e.push({
              id: `e-dew-${dot.id}`,
              source: `br1-sub-${br1Detail.hypotheses[dot.hyp].rank}`,
              target: dot.id,
              type: 'organicBranch',
              data: { kind: 'evidence-tendril' },
            });
          });
        }
      }

      if (showSharedMycelium && br0) {
        e.push({
          id: 'e-mycelium-shared',
          source: 'br0-sub-1',
          target: 'br1-sub-1',
          type: 'organicBranch',
          data: { kind: 'cross-mycelium' },
        });
      }
    }

    // 5. USER-CREATED BRANCHES — ALTERNATE CLEANLY UP (-1) -> DOWN (+1)
    let lastResolutionX = 0;
    for (const item of resolutions) {
      const branchId = item.id.slice(3);
      const x = Math.max(dateToX(rangeStart, item.date), lastResolutionX + 185);
      lastResolutionX = x;
      const branch = graph.branches.find(({ id }) => id === branchId);
      n.push({
        id: item.id, type: 'timelineResolution', position: { x: x - 14, y: TRUNK_Y - 14 },
        data: { title: branch?.title ?? item.statement, dateLabel: shortDate(item.date),
                onClick: () => onSelectBranch(branchId) },
      });
    }
    extraBranches.forEach((cb, idx) => {
      const detail = branchDetailsMap[cb.id];
      const factorCount = detail?.hypotheses.length;
      const branchKind = cb.branch_type === 'habit' ? 'Habit' : 'Investigation';
      const branchSummary = detail?.guidance ? 'Guidance' : factorCount === undefined
        ? 'Workspace'
        : `${factorCount} ${factorCount === 1 ? 'factor' : 'factors'}`;
      const side: -1 | 1 = idx % 2 === 0 ? -1 : 1;
      const startX = 1460 + idx * 240;
      const hubX = startX + 160;
      const hubY = alternatingY(side, 1);

      const startId = `cb-start-${cb.id}`;
      const hubId = `cb-hub-${cb.id}`;

      n.push(
        { id: startId, type: 'anchor', position: { x: startX, y: TRUNK_Y }, data: {} },
        {
          id: hubId,
          type: 'branchHub',
          position: { x: hubX, y: hubY },
          data: {
            id: cb.id,
            title: cb.title,
            status: cb.status,
            branchType: cb.branch_type,
            labelSide: side === -1 ? 'above' : 'below',
            subtitle: `${branchKind} · New · ${branchSummary}`,
            isSelected: selectedBranchId === cb.id,
            onSelect: onSelectBranch,
          },
        }
      );

      e.push({
        id: `e-cb-root-${cb.id}`,
        source: startId,
        target: hubId,
        type: 'organicBranch',
        data: { kind: cb.branch_type === 'habit' ? 'branch-habit' : 'branch-open', animateFlow: animateSap },
      });

      const subList = detail?.hypotheses ?? [];
      subList.slice(0, 3).forEach((hyp, sIdx) => {
        const subId = `cb-sub-${cb.id}-${hyp.rank}`;
        const spread = (sIdx - (subList.length - 1) / 2) * 86;
        n.push({
          id: subId,
          type: 'subHypothesis',
          position: { x: hubX + 260, y: hubY + spread },
          data: {
            rank: hyp.rank,
            label: hyp.label ?? hyp.text ?? 'Sub-branch',
            confidence: hyp.confidence,
            detail: hyp.claims[0]?.text ?? hyp.test,
            tone: sIdx === 0 ? 'emerald' : 'cyan',
            compact: true,
            onClick: () => onSelectBranch(cb.id),
          },
        });
        e.push({
          id: `e-cb-sub-${cb.id}-${hyp.rank}`,
          source: hubId,
          target: subId,
          type: 'organicBranch',
          data: { kind: sIdx === 0 ? 'sub-emerald' : 'sub-cyan', animateFlow: animateSap },
        });
      });
    });

    return { nodes: n, edges: e };
  }, [
    graph,
    branchDetailsMap,
    selectedBranchId,
    showEvidenceNodes,
    showSharedMycelium,
    animateSap,
    spotlightIds,
    onSelectBranch,
    onOpenRecord,
  ]);

  const briefing = useMemo(
    () => buildBriefing(graph, branchDetailsMap, insights),
    [graph, branchDetailsMap, insights]
  );

  return (
    <div ref={flowContainerRef} className="relative w-full h-full overflow-hidden">
      <div
        className="pointer-events-none absolute inset-x-0 top-[44%] h-72 rounded-full blur-3xl"
        style={{ background: 'radial-gradient(ellipse at center, var(--ambient-glow), transparent 72%)' }}
      />

      {/* Single Clean Canvas Action Row */}
      <div className="absolute top-3.5 left-5 right-5 z-10 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        <div className="flex flex-wrap items-center gap-2 pointer-events-auto">
          {[
            {
              active: showEvidenceNodes,
              onClick: () => setShowEvidenceNodes((v) => !v),
              icon: <FileSearch className="w-3.5 h-3.5" />,
              label: 'Evidence Twigs',
            },
            {
              active: showSharedMycelium,
              onClick: () => setShowSharedMycelium((v) => !v),
              icon: <GitBranch className="w-3.5 h-3.5" />,
              label: 'Shared Link',
            },
            {
              active: animateSap,
              onClick: () => setAnimateSap((v) => !v),
              icon: <Waves className="w-3.5 h-3.5" />,
              label: 'Living Flow',
            },
            {
              active: showGrid,
              onClick: () => setShowGrid((v) => !v),
              icon: <Grid3X3 className="w-3.5 h-3.5" />,
              label: 'Grid',
            },
          ].map((pill) => (
            <button
              key={pill.label}
              type="button"
              onClick={pill.onClick}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono text-[10.5px] font-medium transition-all"
              style={{
                backgroundColor: pill.active ? 'var(--s2)' : 'var(--s1)',
                color: pill.active ? 'var(--branch-open)' : 'var(--t3)',
                border: pill.active ? '1px solid var(--border-strong)' : '1px solid var(--border)',
              }}
            >
              {pill.icon}
              <span>{pill.label}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            type="button"
            onClick={() => onOpenNewBranch('manual')}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11.5px] font-semibold transition-all hover:opacity-90"
            style={{ backgroundColor: 'var(--trunk)', color: 'var(--btn-ink)' }}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Branch</span>
          </button>
          <button
            type="button"
            onClick={() => onOpenNewBranch('voice')}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11.5px] font-semibold text-t1 transition-all hover:opacity-90"
            style={{
              backgroundColor: 'var(--s2)',
              border: '1px solid var(--branch-open)',
            }}
          >
            <Mic className="w-3.5 h-3.5 text-branchOpen" />
            <span>Speak (ElevenLabs)</span>
          </button>
        </div>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodeOrigin={[0.5, 0.5]}
        fitView
        fitViewOptions={{ padding: 0.05, minZoom: MIN_READABLE_ZOOM }}
        minZoom={0.28}
        maxZoom={1.85}
        zoomOnScroll={false}
        zoomOnPinch={true}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
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

      {/* Bottom Interactive Dock */}
      <div className="pointer-events-none absolute bottom-4 left-5 right-44 flex flex-wrap items-end justify-between gap-3">
        <div
          className="pointer-events-auto hidden xl:flex items-center gap-3.5 px-3.5 py-2 rounded-xl text-[11px] text-t3"
          style={{ backgroundColor: 'var(--s1)', border: '1px solid var(--border)' }}
        >
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--branch-open)' }} />
            Open branch
          </span>
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-ok" />
            Solved → Knowledge
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--change)' }} />
            Change event
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--hyp)' }} />
            Shared link
          </span>
        </div>

        <ElevenLabsBriefingDock
          beats={briefing}
          onHighlightNodes={setSpotlightIds}
          onOpenRecord={onOpenRecord}
        />

        <div
          className="pointer-events-auto flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px]"
          style={{ backgroundColor: 'var(--s1)', border: '1px solid var(--border-strong)' }}
        >
          <Clock className="w-3.5 h-3.5 text-branchOpen" />
          <span className="font-mono text-t2">
            {demoDaysAdvanced >= 10 ? 'Concluded (+10d)' : 'Demo Clock'}
          </span>
          {demoDaysAdvanced < 10 ? (
            <button
              type="button"
              onClick={() => onAdvanceDemo(10)}
              className="px-2.5 py-1 rounded-lg font-semibold text-[11px] transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--trunk)', color: 'var(--btn-ink)' }}
            >
              +10 Days → Conclude
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onAdvanceDemo(0)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium text-[11px] text-t2 hover:text-t1"
              style={{ backgroundColor: 'var(--s2)', border: '1px solid var(--border)' }}
            >
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export const GraphCanvas: React.FC<GraphCanvasProps> = (props) => (
  <ReactFlowProvider>
    <GraphCanvasInner {...props} />
  </ReactFlowProvider>
);
