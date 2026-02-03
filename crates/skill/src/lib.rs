use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use events::{ActionPlan, RewardSignal};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillCard {
    pub id: String,
    pub level_fingerprint: String,
    pub created_at: DateTime<Utc>,
    pub solver: ActionPlan,
    pub verifier: ActionPlan,
    pub fallback: Option<ActionPlan>,
    pub reward: RewardSignal,
    pub notes: Option<String>,
}
