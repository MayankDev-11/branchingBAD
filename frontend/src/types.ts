export type ThemeMode = 'slate-pro' | 'teal' | 'warm-neuro' | 'lab-ivory' | 'ppt-light';
export type NavView = 'dashboard' | 'investigations' | 'insights' | 'history' | 'profile' | 'privacy' | 'connect';

export interface DataSourceSummary {
  id: string;
  name: string;
  sourceType: 'apple_health' | 'google_health' | 'manual_voice';
  connected: boolean;
  recordCount: number;
  lastSynced: string;
  detail: string;
}

export interface TrunkDay {
  date: string;
  sleep_min: number;
  steps: number;
  water_ml: number;
  headache: boolean;
}

export interface ChangeEvent {
  id: string;
  metric: string;
  date: string;
  delta: number;
  label: string;
  record_ids: string[];
}

export interface GraphBranch {
  id: string;
  title: string;
  status: 'open' | 'concluded' | 'inconclusive';
  branch_type?: 'investigation' | 'habit';
  start_date: string;
  end_date: string | null;
  lane: number;
}

export interface KnowledgeItem {
  id: string;
  date: string;
  statement: string;
  confidence: string;
}

export interface GraphResponse {
  range: { start: string; end: string };
  trunk: TrunkDay[];
  change_events: ChangeEvent[];
  branches: GraphBranch[];
  knowledge: KnowledgeItem[];
}

export interface ClaimItem {
  text: string;
  record_ids: string[];
}

export interface BranchHypothesis {
  rank: number;
  label?: string;
  text?: string;
  confidence?: number;
  claims: ClaimItem[];
  test: string;
  test_days?: number;
}

export interface ExperimentInfo {
  id: string;
  hypothesis_rank: number;
  description: string;
  start_date: string;
  duration_days: number;
  days_elapsed: number;
  adherence_pct: number;
  success_criterion: string;
  locked: boolean;
  locked_at: string | null;
  status: string;
}

export interface EvidenceRow {
  id: string;
  date: string;
  metric: string;
  value: number;
  label: string;
  device: string;
  source_id: string;
}

export interface BranchDetailResponse {
  id: string;
  title: string;
  status: 'open' | 'concluded' | 'inconclusive';
  branch_type?: 'investigation' | 'habit';
  start_date: string;
  change_event?: { id: string; label: string; record_ids: string[] };
  hypotheses: BranchHypothesis[];
  experiment?: ExperimentInfo;
  evidence: EvidenceRow[];
}

export type BranchAction = 'resolve' | 'dissolve';

export interface WorkspaceHistoryEntry {
  id: string;
  title: string;
  branch_type: 'investigation' | 'habit';
  start_date: string;
  lifecycle: 'open' | 'resolved' | 'dissolved';
  closed_date: string | null;
  resolution: string | null;
}

export interface CreateBranchInput {
  title: string;
  branch_type: 'investigation' | 'habit';
  start_date: string;
  metrics: string[];
  outcome?: 'auto' | 'headache' | 'sleep_min' | 'afternoon_energy' | 'untracked';
  hypotheses: string[];
  created_via: 'manual' | 'elevenlabs_voice';
  voice_transcript?: string;
}

export interface RecordDetailResponse {
  id: string;
  metric: string;
  value: number;
  unit: string;
  display: string;
  date: string;
  time: string;
  device: string;
  source_id: string;
  source_file: string;
  data_quality: number;
  normalization: string;
}

// GET /api/insights (contracts/sample_insights.json). Every number on the Insights,
// Profile and Data & help pages comes from here, computed in Python (rule 9).
export interface InsightsDay {
  date: string;
  sleep: number | null;
  sleep_id: string | null;
  water: number | null;
  water_id: string | null;
  screen: number | null;
  screen_id: string | null;
  headache: boolean | null;
  headache_id: string | null;
}

export interface InsightsHypothesis {
  branch_id: string;
  branch_title: string;
  rank: number;
  label: string;
  metric: string;
  op: string;
  threshold: number;
  exposure_text: string;
  confidence: number;
  k: number | null;
  n: number | null;
  j: number | null;
  m: number | null;
  claim: string;
  record_ids: string[];
}

export interface InsightsExperimentNight {
  date: string;
  value: number | null;
  record_id: string | null;
  met: boolean | null;
}

export interface InsightsResponse {
  as_of: string;
  sleep_shift: {
    change_event_id: string;
    date: string;
    delta_min: number;
    before_median_min: number;
    after_median_min: number;
    post_window_days: number;
    normal_low_min: number | null;
    normal_high_min: number | null;
    normal_median_min: number | null;
    baseline_days: number | null;
    record_ids: string[];
  } | null;
  days: InsightsDay[];
  screen: {
    weeks: { week_start: string; avg_min: number; days: number }[];
    before_avg_min: number | null;
    after_avg_min: number | null;
  };
  hypotheses: InsightsHypothesis[];
  experiment: {
    id: string;
    branch_id: string;
    description: string;
    success_criterion: string;
    metric: string;
    threshold: number;
    min_days: number | null;
    duration_days: number;
    days_elapsed: number;
    adherence_pct: number;
    status: string;
    nights: InsightsExperimentNight[];
    nights_met: number;
    nights_logged: number;
  } | null;
  knowledge_count: number;
  coverage: {
    total_observations: number;
    excluded: number;
    days: number;
    metrics: { metric: string; title: string; count: number; coverage_pct: number }[];
    sources: { source_file: string; device: string; count: number }[];
    weekly: { week_start: string; apple_health: number; other: number }[];
  };
}

// POST /api/import/apple-health
export interface ImportSummary {
  source_file: string;
  records_read: number;
  records_used: number;
  records_skipped: number;
  profile_skipped: boolean;
  raw_inserted: number;
  observations: Record<string, number>;
  excluded: number;
  already_present: number;
  first_date: string | null;
  last_date: string | null;
}

export interface AskResponse {
  red_flag: boolean;
  hypotheses: BranchHypothesis[];
  dropped_claims: number;
  sent_to_ai: string;
}
