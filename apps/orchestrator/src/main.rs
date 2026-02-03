use std::fs;

use anyhow::Result;
use events::ActionPlan;
use serde::Serialize;
use tracing::{info, warn};

#[derive(Debug, Serialize)]
struct OrchestratorResult {
    run_id: String,
    level_id: String,
    worker_status: String,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt().with_env_filter("info").init();

    let worker_url =
        std::env::var("WORKER_URL").unwrap_or_else(|_| "http://localhost:8080".to_string());
    let telemetry_url =
        std::env::var("TELEMETRY_URL").unwrap_or_else(|_| "http://localhost:8081".to_string());
    let target_url =
        std::env::var("TARGET_URL").unwrap_or_else(|_| "http://localhost:3000".to_string());
    let plan_path = std::env::var("PLAN_PATH").ok();

    let plan: ActionPlan = if let Some(path) = plan_path {
        let data = fs::read_to_string(path)?;
        serde_json::from_str(&data)?
    } else {
        ActionPlan { actions: vec![] }
    };

    let run_id = orchestrator::default_run_id();
    let level_id = "level-1".to_string();
    let request = orchestrator::build_request(
        run_id.clone(),
        level_id.clone(),
        target_url,
        plan,
        telemetry_url,
    );

    let client = reqwest::Client::new();
    let response = client
        .post(format!("{}/episode/run", worker_url))
        .json(&request)
        .send()
        .await?;

    if !response.status().is_success() {
        warn!(status = %response.status(), "worker returned non-success status");
    }

    let result: serde_json::Value = response
        .json()
        .await
        .unwrap_or_else(|_| serde_json::json!({}));

    let output = OrchestratorResult {
        run_id,
        level_id,
        worker_status: result.to_string(),
    };

    info!(
        "orchestrator completed: {}",
        serde_json::to_string_pretty(&output)?
    );

    Ok(())
}
