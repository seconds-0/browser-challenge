use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ActionType {
    Click,
    Type,
    Press,
    WaitFor,
    Scroll,
    EvalJs,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SelectorStrategy {
    Css,
    Role,
    Text,
    TestId,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SelectorTarget {
    pub strategy: SelectorStrategy,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionTarget {
    pub selector: Option<SelectorTarget>,
    pub point: Option<Point>,
    pub frame: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WaitForSpec {
    pub url_contains: Option<String>,
    pub selector: Option<SelectorTarget>,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScrollSpec {
    pub delta_x: f64,
    pub delta_y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Action {
    pub id: String,
    #[serde(rename = "type")]
    pub action_type: ActionType,
    pub target: Option<ActionTarget>,
    pub text: Option<String>,
    pub key: Option<String>,
    pub timeout_ms: Option<u64>,
    pub wait_for: Option<WaitForSpec>,
    pub scroll: Option<ScrollSpec>,
    pub script: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionPlan {
    pub actions: Vec<Action>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionResult {
    pub action_id: String,
    pub success: bool,
    pub error: Option<String>,
    pub started_at: DateTime<Utc>,
    pub ended_at: DateTime<Utc>,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RewardSignal {
    pub advanced: bool,
    pub reason: Option<String>,
    pub level_fingerprint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Checkpoint {
    pub url: String,
    pub storage_state_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventEnvelope {
    pub run_id: String,
    pub level_id: String,
    pub episode_id: String,
    pub step_id: Option<String>,
    pub ts: DateTime<Utc>,
    pub kind: String,
    pub data: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArtifactRef {
    pub kind: String,
    pub path: String,
    pub content_type: Option<String>,
    pub size_bytes: Option<u64>,
    pub sha256: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArtifactManifest {
    pub run_id: String,
    pub level_id: String,
    pub episode_id: String,
    pub artifacts: Vec<ArtifactRef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EpisodeResult {
    pub result: String,
    pub reward: RewardSignal,
    pub actions_executed: Vec<ActionResult>,
    pub artifacts: Option<ArtifactManifest>,
    pub diagnostics: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunMetadata {
    pub run_id: String,
    pub created_at: DateTime<Utc>,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EpisodeRequest {
    pub run_id: String,
    pub level_id: String,
    pub checkpoint: Option<Checkpoint>,
    pub plan: ActionPlan,
    pub time_budget_ms: u64,
    pub artifact_profile: String,
    pub telemetry_endpoint: Option<String>,
}
