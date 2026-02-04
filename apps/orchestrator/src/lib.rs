use chrono::Utc;
use events::{ActionPlan, Checkpoint, EpisodeRequest};

pub fn parse_levels(levels: Option<String>, level_count: Option<usize>) -> Vec<String> {
    if let Some(levels) = levels {
        return levels
            .split(',')
            .map(|level| level.trim().to_string())
            .filter(|level| !level.is_empty())
            .collect();
    }
    let count = level_count.unwrap_or(1);
    (1..=count).map(|idx| format!("level-{}", idx)).collect()
}

pub fn level_url(base: &str, level: &str, template: &str) -> String {
    let base = base.trim_end_matches('/');
    let level_num = level.strip_prefix("level-").unwrap_or(level);
    template
        .replace("{base}", base)
        .replace("{level}", level)
        .replace("{level_num}", level_num)
}

pub fn build_request(
    run_id: String,
    level_id: String,
    target_url: String,
    plan: ActionPlan,
    telemetry_url: String,
    time_budget_ms: u64,
    artifact_profile: String,
) -> EpisodeRequest {
    EpisodeRequest {
        run_id,
        level_id,
        checkpoint: Some(Checkpoint {
            url: target_url,
            storage_state_path: None,
        }),
        plan,
        time_budget_ms,
        artifact_profile,
        telemetry_endpoint: Some(telemetry_url),
    }
}

pub fn default_run_id() -> String {
    format!("run-{}", Utc::now().timestamp())
}
