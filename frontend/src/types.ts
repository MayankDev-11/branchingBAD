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

export interface CreateBranchInput {
  title: string;
  branch_type: 'investigation' | 'habit';
  start_date: string;
  metrics: string[];
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

export interface AskResponse {
  red_flag: boolean;
  hypotheses: BranchHypothesis[];
  dropped_claims: number;
  sent_to_ai: string;
}
