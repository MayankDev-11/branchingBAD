// Live data: requests go to /api, which Vite proxies to the FastAPI backend on http://localhost:8000.
// Set USE_MOCK = true to run the UI on the sample JSON without a backend.
import sampleGraph from './contracts/sample_graph.json';
import sampleBranch from './contracts/sample_branch.json';
import sampleRecord from './contracts/sample_record.json';
import sampleAsk from './contracts/sample_ask.json';
import sampleInsights from './contracts/sample_insights.json';
import type {
  AskResponse,
  BranchAction,
  BranchDetailResponse,
  CreateBranchInput,
  ExperimentInfo,
  GraphBranch,
  GraphResponse,
  ImportSummary,
  InsightsResponse,
  RecordDetailResponse,
  WorkspaceHistoryEntry,
} from './types';

export const USE_MOCK = false;
const API_BASE = ''; // Proxied via Vite /api -> http://localhost:8000 for same-origin HttpOnly cookies

const RED_FLAG_KEYWORDS = [
  'chest pain',
  'fainting',
  'sudden severe headache',
  'trouble breathing',
  'one-sided weakness',
  'self-harm',
];

const MOCK_RECORDS: Record<string, RecordDetailResponse> = {
  sl_0412: sampleRecord as RecordDetailResponse,
  hd_0031: {
    id: 'hd_0031',
    metric: 'headache',
    value: 1,
    unit: 'event',
    display: 'Moderate Headache',
    date: '2026-11-04',
    time: '15:20:10',
    device: 'Manual entry',
    source_id: 'src_b2',
    source_file: 'manual_checkins.sqlite',
    data_quality: 0.85,
    normalization: 'symptom_checkin -> binary_flag (1)',
  },
  sl_0413: {
    id: 'sl_0413',
    metric: 'sleep_min',
    value: 298,
    unit: 'minutes',
    display: '4 hours 58 minutes',
    date: '2026-11-04',
    time: '06:54:12',
    device: 'iPhone 15 Pro',
    source_id: 'src_a1',
    source_file: 'apple_health_export.xml',
    data_quality: 0.78,
    normalization: 'HKCategoryValueSleepAnalysisAsleep -> minutes',
  },
  sl_0398: {
    id: 'sl_0398',
    metric: 'sleep_min',
    value: 334,
    unit: 'minutes',
    display: '5 hours 34 minutes',
    date: '2026-11-07',
    time: '07:05:40',
    device: 'iPhone 15 Pro',
    source_id: 'src_a1',
    source_file: 'apple_health_export.xml',
    data_quality: 0.80,
    normalization: 'HKCategoryValueSleepAnalysisAsleep -> minutes',
  },
  wt_0210: {
    id: 'wt_0210',
    metric: 'water_ml',
    value: 820,
    unit: 'ml',
    display: '820 ml water',
    date: '2026-11-03',
    time: '21:10:00',
    device: 'Manual entry',
    source_id: 'src_c3',
    source_file: 'manual_checkins.sqlite',
    data_quality: 0.72,
    normalization: 'hydration_log_ml -> canonical ml',
  },
};

const CONCLUDED_BRANCH_MOCK: BranchDetailResponse = {
  id: 'br_0',
  title: 'Does caffeine after 4 PM cut my sleep?',
  status: 'concluded',
  branch_type: 'investigation',
  start_date: '2026-10-01',
  change_event: {
    id: 'ce_0',
    label: 'Sleep latency increased +26 min in early Oct',
    record_ids: ['sl_0412'],
  },
  hypotheses: [
    {
      rank: 1,
      label: 'Late afternoon caffeine',
      confidence: 84,
      claims: [
        {
          text: 'Nights after coffee past 4 PM averaged 31 min less sleep across 14 nights',
          record_ids: ['sl_0412', 'sl_0413'],
        },
      ],
      test: 'Zero caffeine after 4 PM for 14 days',
      test_days: 14,
    },
    {
      rank: 2,
      label: 'Late dinner timing',
      confidence: 18,
      claims: [],
      test: 'Dinner before 8 PM for 10 days',
      test_days: 10,
    },
    {
      rank: 3,
      label: 'Evening workout intensity',
      confidence: 12,
      claims: [],
      test: 'Finish lifting before 7 PM for 10 days',
      test_days: 10,
    },
  ],
  experiment: {
    id: 'exp_0',
    hypothesis_rank: 1,
    description: 'Zero caffeine after 4 PM every day',
    start_date: '2026-10-08',
    duration_days: 14,
    days_elapsed: 14,
    adherence_pct: 93,
    success_criterion: 'Average sleep rises by >= 25 min across >= 70% adherent days',
    locked: true,
    locked_at: '2026-10-08T08:00:00Z',
    status: 'supported',
  },
  evidence: (sampleBranch as BranchDetailResponse).evidence.slice(0, 2),
};

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

let mockExperimentLocked = true;
let mockClockDaysAdvanced = 0;
const customBranches: GraphBranch[] = [];
const customBranchDetails: Record<string, BranchDetailResponse> = {};

export const api = {
  async getGraph(): Promise<GraphResponse> {
    if (USE_MOCK) {
      const base = structuredClone(sampleGraph) as GraphResponse;
      if (mockClockDaysAdvanced >= 10) {
        base.branches = base.branches.map((b) =>
          b.id === 'br_1' ? { ...b, status: 'concluded', end_date: '2026-11-22' } : b
        );
        base.knowledge = [
          ...base.knowledge,
          {
            id: 'kn_2',
            date: '2026-11-20',
            statement: 'Lights out by 11:30 PM increased sleep to 7h 18m and cut headaches by 75%',
            confidence: 'high',
          },
        ];
      }
      base.branches = [...base.branches, ...customBranches];
      return base;
    }
    const res = await fetch(`${API_BASE}/api/graph`, { credentials: 'include' });
    if (!res.ok) throw new Error(`GET /api/graph failed (${res.status})`);
    return res.json();
  },

  async getBranch(id: string): Promise<BranchDetailResponse> {
    if (USE_MOCK) {
      if (customBranchDetails[id]) return structuredClone(customBranchDetails[id]);
      if (id === 'br_0') return structuredClone(CONCLUDED_BRANCH_MOCK);
      const b = structuredClone(sampleBranch) as BranchDetailResponse;
      if (b.experiment) {
        b.experiment.locked = mockExperimentLocked;
        if (mockClockDaysAdvanced >= 10) {
          b.status = 'concluded';
          b.experiment.days_elapsed = 10;
          b.experiment.adherence_pct = 90;
          b.experiment.status = 'supported';
        }
      }
      return b;
    }
    const res = await fetch(`${API_BASE}/api/branches/${encodeURIComponent(id)}`, { credentials: 'include' });
    if (!res.ok) throw new Error(`Investigation "${id}" not found (${res.status})`);
    return res.json();
  },

  async createBranch(input: CreateBranchInput): Promise<{ branch: GraphBranch; detail: BranchDetailResponse }> {
    if (USE_MOCK) {
      await delay(280);
      const id = `br_custom_${customBranches.length + 2}`;
      const lane = 2 + (customBranches.length % 2);
      const newBranch: GraphBranch = {
        id,
        title: input.title,
        status: 'open',
        branch_type: input.branch_type,
        start_date: input.start_date || '2026-11-20',
        end_date: null,
        lane,
      };
      const hypNames =
        input.hypotheses.length > 0
          ? input.hypotheses
          : input.branch_type === 'habit'
          ? ['Consistent daily cue', 'Energy boost after 10 days']
          : ['Sleep debt overlap', 'Meal timing shift', 'Hydration drop'];

      const detail: BranchDetailResponse = {
        id,
        title: input.title,
        status: 'open',
        branch_type: input.branch_type,
        start_date: newBranch.start_date,
        change_event:
          input.created_via === 'elevenlabs_voice'
            ? {
                id: `ce_${id}`,
                label: 'Created via ElevenLabs voice check-in (PII scrubbed)',
                record_ids: ['sl_0412'],
              }
            : undefined,
        hypotheses: hypNames.slice(0, 3).map((label, idx) => ({
          rank: idx + 1,
          label,
          confidence: idx === 0 ? 58 : idx === 1 ? 36 : 22,
          claims:
            idx === 0
              ? [
                  {
                    text: `Initial signal linked to ${input.metrics[0] || 'sleep_min'} baseline (collecting 10d evidence)`,
                    record_ids: ['sl_0412'],
                  },
                ]
              : [],
          test:
            input.branch_type === 'habit'
              ? `Track "${input.title}" daily for 14 days`
              : `Run 10-day controlled test for "${label}"`,
          test_days: input.branch_type === 'habit' ? 14 : 10,
        })),
        experiment: {
          id: `exp_${id}`,
          hypothesis_rank: 1,
          description:
            input.branch_type === 'habit'
              ? input.title
              : `Test: ${hypNames[0]} (10-day protocol)`,
          start_date: newBranch.start_date,
          duration_days: 10,
          days_elapsed: 1,
          adherence_pct: 10,
          success_criterion: 'Target metric improves by >= 20% over frozen 14-day baseline (>=70% adherence)',
          locked: false,
          locked_at: null,
          status: 'draft',
        },
        evidence: [
          {
            id: 'sl_0412',
            date: newBranch.start_date,
            metric: input.metrics[0] || 'sleep_min',
            value: 315,
            label: input.created_via === 'elevenlabs_voice' ? 'Voice seed observation' : 'Baseline seed record',
            device: input.created_via === 'elevenlabs_voice' ? 'ElevenLabs Voice' : 'Manual entry',
            source_id: 'src_a1',
          },
        ],
      };

      customBranches.push(newBranch);
      customBranchDetails[id] = detail;
      return { branch: newBranch, detail };
    }

    const res = await fetch(`${API_BASE}/api/branches`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`Create branch failed (${res.status})`);
    return res.json();
  },

  async getBranchHistory(): Promise<WorkspaceHistoryEntry[]> {
    if (USE_MOCK) return [];
    const res = await fetch(`${API_BASE}/api/branches/history`, { credentials: 'include' });
    if (!res.ok) throw new Error('Could not load workspace branch history.');
    return res.json();
  },

  async transitionBranch(id: string, action: BranchAction, resolution?: string): Promise<{
    graph: GraphResponse; detail: BranchDetailResponse; history: WorkspaceHistoryEntry[];
  }> {
    const res = await fetch(`${API_BASE}/api/branches/${encodeURIComponent(id)}/transition`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, resolution }),
    });
    if (!res.ok) {
      const failure = await res.json().catch(() => ({}));
      throw new Error(typeof failure.detail === 'string' ? failure.detail : 'Could not close this branch.');
    }
    return res.json();
  },

  async transcribeVoiceWithElevenLabs(audioBlob: Blob): Promise<string> {
    const form = new FormData();
    form.append('audio', audioBlob, 'voice.webm');
    const res = await fetch(`${API_BASE}/api/voice/transcribe`, {
      method: 'POST', credentials: 'include', body: form,
    });
    if (!res.ok) {
      const failure = await res.json().catch(() => ({}));
      throw new Error(typeof failure.detail === 'string' ? failure.detail : 'ElevenLabs transcription failed.');
    }
    const { transcript } = await res.json();
    return transcript;
  },

  async getRecord(id: string): Promise<RecordDetailResponse> {
    if (USE_MOCK) {
      return MOCK_RECORDS[id] ?? { ...(sampleRecord as RecordDetailResponse), id };
    }
    const res = await fetch(`${API_BASE}/api/records/${encodeURIComponent(id)}`, { credentials: 'include' });
    if (!res.ok) throw new Error(`Record "${id}" not found (${res.status})`);
    return res.json();
  },

  async ask(branchId: string | null, question: string): Promise<AskResponse> {
    if (USE_MOCK) {
      await delay(750);
      const qLower = question.toLowerCase();
      const isRedFlag = RED_FLAG_KEYWORDS.some((kw) => qLower.includes(kw));
      if (isRedFlag) {
        return {
          red_flag: true,
          hypotheses: [],
          dropped_claims: 0,
          sent_to_ai: '[BLOCKED BEFORE AI — RED FLAG SAFETY RULE TRIGGERED]',
        };
      }
      return {
        ...(sampleAsk as AskResponse),
        sent_to_ai: (sampleAsk as AskResponse).sent_to_ai.replace(
          'why do I keep getting headaches?',
          question.trim() || 'why do I keep getting headaches?'
        ),
      };
    }
    const res = await fetch(`${API_BASE}/api/ask`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch_id: branchId, question }),
    });
    if (!res.ok) throw new Error(`POST /api/ask failed (${res.status})`);
    return res.json();
  },

  async lockExperiment(experimentId: string): Promise<ExperimentInfo> {
    if (USE_MOCK) {
      await delay(280);
      mockExperimentLocked = true;
      for (const detail of Object.values(customBranchDetails)) {
        if (detail.experiment?.id === experimentId) {
          detail.experiment.locked = true;
          detail.experiment.locked_at = new Date().toISOString();
          detail.experiment.status = 'active';
          return structuredClone(detail.experiment);
        }
      }
      const b = structuredClone(sampleBranch) as BranchDetailResponse;
      return {
        ...b.experiment!,
        id: experimentId,
        locked: true,
        locked_at: new Date().toISOString(),
      };
    }
    const res = await fetch(`${API_BASE}/api/experiments/${encodeURIComponent(experimentId)}/lock`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!res.ok) throw new Error(`Lock failed (${res.status})`);
    return res.json();
  },

  async advanceClock(days: number): Promise<GraphResponse> {
    if (USE_MOCK) {
      mockClockDaysAdvanced = days;
      return this.getGraph();
    }
    // days = 0 is the Reset button: rebuild the demo from seed 42 and the 20 Nov clock.
    const res = days > 0
      ? await fetch(`${API_BASE}/api/demo/advance`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ days }),
        })
      : await fetch(`${API_BASE}/api/demo/reset`, { method: 'POST', credentials: 'include' });
    if (!res.ok) throw new Error(`Demo advance failed (${res.status})`);
    return res.json();
  },

  async getInsights(): Promise<InsightsResponse> {
    if (USE_MOCK) return structuredClone(sampleInsights) as InsightsResponse;
    const res = await fetch(`${API_BASE}/api/insights`, { credentials: 'include' });
    if (!res.ok) throw new Error(`GET /api/insights failed (${res.status})`);
    return res.json();
  },

  // Sends the raw file (not multipart) so a multi-hundred-MB export streams straight to disk.
  async importAppleHealth(file: File): Promise<ImportSummary> {
    if (USE_MOCK) throw new Error('Uploading needs the backend (USE_MOCK is on)');
    const res = await fetch(
      `${API_BASE}/api/import/apple-health?filename=${encodeURIComponent(file.name)}`,
      { method: 'POST', credentials: 'include', body: file }
    );
    if (!res.ok) {
      const detail = await res.json().then((d) => d?.detail as string | undefined).catch(() => undefined);
      throw new Error(detail ?? `Upload failed (${res.status})`);
    }
    return res.json();
  },

  getDefaultAskSample(): AskResponse {
    return sampleAsk as AskResponse;
  },
};

const ttsAudioCache = new Map<string, string>();
export async function synthesizeWithElevenLabs(text: string): Promise<string> {
  const cached = ttsAudioCache.get(text);
  if (cached) return cached;

  const res = await fetch(`${API_BASE}/api/voice/synthesize`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error('ElevenLabs narration unavailable.');
  const url = URL.createObjectURL(await res.blob());
  ttsAudioCache.set(text, url);
  return url;
}
