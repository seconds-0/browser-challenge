use chrono::Utc;
use events::{ActionPlan, Checkpoint, EpisodeRequest};

pub fn build_request(
    run_id: String,
    level_id: String,
    target_url: String,
    plan: ActionPlan,
    telemetry_url: String,
) -> EpisodeRequest {
    EpisodeRequest {
        run_id,
        level_id,
        checkpoint: Some(Checkpoint {
            url: target_url,
            storage_state_path: None,
        }),
        plan,
        time_budget_ms: 30_000,
        artifact_profile: "trainer".to_string(),
        telemetry_endpoint: Some(telemetry_url),
    }
}

pub fn default_run_id() -> String {
    format!("run-{}", Utc::now().timestamp())
}
