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
import type { BranchDetailResponse, GraphResponse } from '../../types';
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
} from './CustomNodes';
import { OrganicBranchEdge, TrunkEdge } from './CustomEdges';
import { ElevenLabsBriefingDock } from '../ElevenLabsBriefingDock';
import { SmoothZoomControls } from './SmoothZoomControls';

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

interface GraphCanvasProps {
  graph: GraphResponse;
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
  branchDetailsMap,
  selectedBranchId,
  isRightPanelOpen,
  demoDaysAdvanced,
  onSelectBranch,
  onOpenRecord,
  onAdvanceDemo,
  onOpenNewBranch,
}) => {
  const { fitView } = useReactFlow();
  const [showEvidenceNodes, setShowEvidenceNodes] = useState(true);
  const [showSharedMycelium, setShowSharedMycelium] = useState(true);
  const [animateSap, setAnimateSap] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const flowContainerRef = useRef<HTMLDivElement | null>(null);
  const [spotlightIds, setSpotlightIds] = useState<string[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fitView({ padding: 0.11, duration: 380 });
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
    const trunkEndX = 1960;
    n.push(
      { id: 'trunk-start', type: 'anchor', position: { x: trunkStartX, y: TRUNK_Y }, data: {} },
      { id: 'trunk-end', type: 'anchor', position: { x: trunkEndX, y: TRUNK_Y }, data: {} }
    );

    const dateTicks = [
      { date: '2026-09-10', label: 'Sep 10' },
      { date: '2026-10-01', label: 'Oct 1' },
      { date: '2026-10-22', label: 'Oct 22' },
      { date: '2026-11-03', label: 'Nov 3' },
      { date: '2026-11-22', label: 'Nov 22' },
    ].map((t) => ({ x: dateToX(rangeStart, t.date), label: t.label }));
    dateTicks.push({ x: 1740, label: 'Future Growth' });

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
    const kn1 = graph.knowledge.find((k) => k.id === 'kn_1');
    if (br0 && kn1) {
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
            title: 'Caffeine after 4 PM & sleep?',
            status: 'concluded',
            labelSide: 'below',
            subtitle: 'Solved Oct 22 · 3 sub-branches melted',
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

      n.push(
        {
          id: 'br0-sub-1',
          type: 'subHypothesis',
          position: { x: sub0X, y: b0HubY - 105 },
          data: {
            rank: 1,
            label: 'Late caffeine',
            confidence: 84,
            detail: 'Supported · -31m sleep',
            tone: 'solved',
            compact: true,
            spotlight: isLit('br0-sub-1'),
            onClick: () => onSelectBranch('br_0'),
          },
        },
        {
          id: 'br0-sub-2',
          type: 'subHypothesis',
          position: { x: sub0X, y: b0HubY },
          data: {
            rank: 2,
            label: 'Dinner timing',
            confidence: 18,
            detail: 'Refuted · no shift',
            tone: 'muted',
            compact: true,
            onClick: () => onSelectBranch('br_0'),
          },
        },
        {
          id: 'br0-sub-3',
          type: 'subHypothesis',
          position: { x: sub0X, y: b0HubY + 100 },
          data: {
            rank: 3,
            label: 'Late workout',
            confidence: 12,
            detail: 'Refuted · weak link',
            tone: 'muted',
            compact: true,
            onClick: () => onSelectBranch('br_0'),
          },
        },
        {
          id: 'br0-melt',
          type: 'meltConfluence',
          position: { x: melt0X, y: melt0Y },
          data: {
            label: '3 melted -> 1 truth',
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
            dateLabel: 'Oct 22',
            confidence: 'Medium · 14d Exp',
            recordIds: ['sl_0412', 'sl_0413'],
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
              ? 'Solved · 3 sub-branches melted into Knowledge'
              : 'Open · 12 days · 3 sub-branches · 6 twigs',
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
        const detailText =
          idx === 0
            ? `4/5 days <6h · ${firstRec ?? 'sl_0412'}`
            : idx === 1
            ? `3/5 days <1 L · ${firstRec ?? 'wt_0210'}`
            : 'Weak · upstream signal';

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
              label: '3 melted -> 1 truth',
              onClick: () => onSelectBranch('br_1'),
            },
          },
          {
            id: 'br1-knowledge',
            type: 'knowledgeNode',
            position: { x: melt1X + 245, y: melt1Y },
            data: {
              branchId: 'br_1',
              statement:
                kn2?.statement ??
                'Lights out by 11:30 PM increased sleep to 7h 18m and cut headaches by 75%',
              dateLabel: 'Nov 22',
              confidence: 'High · 10d Exp',
              recordIds: ['sl_0412', 'hd_0031'],
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
              description: 'Lights out 11:30 PM (10d)',
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

        n.push(
          {
            id: 'br1-exp-2',
            type: 'experimentLeaf',
            position: { x: twigX + 20, y: b1HubY + 6 },
            data: {
              description: 'Drink 2 L water daily (10d)',
              adherence: 0,
              locked: false,
              isDraft: true,
              onClick: () => onSelectBranch('br_1'),
            },
          },
          {
            id: 'br1-exp-3',
            type: 'experimentLeaf',
            position: { x: twigX + 20, y: b1HubY + 132 },
            data: {
              description: 'No screens after 10 PM (7d)',
              adherence: 0,
              locked: false,
              isDraft: true,
              onClick: () => onSelectBranch('br_1'),
            },
          }
        );
        e.push(
          { id: 'e-br1-exp-2', source: 'br1-sub-2', target: 'br1-exp-2', type: 'organicBranch', data: { kind: 'sub-cyan', animateFlow: false } },
          { id: 'e-br1-exp-3', source: 'br1-sub-3', target: 'br1-exp-3', type: 'organicBranch', data: { kind: 'sub-muted', animateFlow: false } }
        );

        if (showEvidenceNodes) {
          n.push(
            {
              id: 'ev-dew-sl1',
              type: 'evidenceDewdrop',
              position: { x: twigX, y: b1HubY - 94 },
              data: {
                recordId: 'sl_0412',
                summary: '5h 15m',
                spotlight: isLit('ev-dew-sl1'),
                onOpenRecord: (id: string) => onOpenRecord(id, 'raw'),
              },
            },
            {
              id: 'ev-dew-sl2',
              type: 'evidenceDewdrop',
              position: { x: twigX, y: b1HubY - 52 },
              data: { recordId: 'hd_0031', summary: 'Headache', onOpenRecord: (id: string) => onOpenRecord(id, 'raw') },
            },
            {
              id: 'ev-dew-wt',
              type: 'evidenceDewdrop',
              position: { x: twigX, y: b1HubY + 64 },
              data: { recordId: 'wt_0210', summary: '820 ml', onOpenRecord: (id: string) => onOpenRecord(id, 'raw') },
            }
          );
          e.push(
            { id: 'e-dew-sl1', source: 'br1-sub-1', target: 'ev-dew-sl1', type: 'organicBranch', data: { kind: 'evidence-tendril' } },
            { id: 'e-dew-sl2', source: 'br1-sub-1', target: 'ev-dew-sl2', type: 'organicBranch', data: { kind: 'evidence-tendril' } },
            { id: 'e-dew-wt', source: 'br1-sub-2', target: 'ev-dew-wt', type: 'organicBranch', data: { kind: 'evidence-tendril' } }
          );
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
    const extraBranches = graph.branches.filter((b) => b.id !== 'br_0' && b.id !== 'br_1');
    extraBranches.forEach((cb, idx) => {
      const detail = branchDetailsMap[cb.id];
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
            subtitle: `${cb.branch_type === 'habit' ? 'Habit' : 'Investigation'} · New · ${detail?.hypotheses.length ?? 2} sub-branches`,
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
            confidence: hyp.confidence ?? 45,
            detail: hyp.test,
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
        fitViewOptions={{ padding: 0.11 }}
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
