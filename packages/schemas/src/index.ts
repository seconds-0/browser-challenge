export type ActionType =
  | 'click'
  | 'type'
  | 'press'
  | 'wait_for'
  | 'scroll'
  | 'eval_js';

export type SelectorStrategy = 'css' | 'role' | 'text' | 'test_id';

export interface SelectorTarget {
  strategy: SelectorStrategy;
  value: string;
}

export interface Point {
  x: number;
  y: number;
}

export interface ActionTarget {
  selector?: SelectorTarget;
  point?: Point;
  frame?: string;
}

export interface WaitForSpec {
  url_contains?: string;
  selector?: SelectorTarget;
  timeout_ms?: number;
}

export interface ScrollSpec {
  delta_x: number;
  delta_y: number;
}

export interface Action {
  id: string;
  type: ActionType;
  target?: ActionTarget;
  text?: string;
  key?: string;
  timeout_ms?: number;
  wait_for?: WaitForSpec;
  scroll?: ScrollSpec;
  script?: string;
}

export interface ActionPlan {
  actions: Action[];
}

export interface ActionResult {
  action_id: string;
  success: boolean;
  error?: string;
  started_at: string;
  ended_at: string;
  duration_ms: number;
}

export interface RewardSignal {
  advanced: boolean;
  reason?: string;
  level_fingerprint?: string;
}

export interface Checkpoint {
  url: string;
  storage_state_path?: string;
}

export interface EventEnvelope {
  run_id: string;
  level_id: string;
  episode_id: string;
  step_id?: string;
  ts: string;
  kind: string;
  data: Record<string, unknown>;
}

export interface ArtifactRef {
  kind: string;
  path: string;
  content_type?: string;
  size_bytes?: number;
  sha256?: string;
}

export interface ArtifactManifest {
  run_id: string;
  level_id: string;
  episode_id: string;
  artifacts: ArtifactRef[];
}

export interface EpisodeRequest {
  run_id: string;
  level_id: string;
  checkpoint?: Checkpoint;
  plan: ActionPlan;
  time_budget_ms: number;
  artifact_profile: 'trainer' | 'runner';
  telemetry_endpoint?: string;
}

export interface EpisodeResult {
  result: string;
  reward: RewardSignal;
  actions_executed: ActionResult[];
  artifacts?: ArtifactManifest;
  diagnostics: Record<string, unknown>;
}

export interface SkillCard {
  id: string;
  level_fingerprint: string;
  created_at: string;
  solver: ActionPlan;
  verifier: ActionPlan;
  fallback?: ActionPlan;
  reward: RewardSignal;
  notes?: string;
}
