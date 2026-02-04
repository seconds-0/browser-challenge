use std::fs;
use std::path::PathBuf;

use anyhow::Result;
use chrono::Utc;
use events::{ActionPlan, EpisodeResult, RewardSignal};
use serde::Serialize;
use skill::{SkillCard, SkillStore};
use tracing::{info, warn};

#[derive(Debug, Serialize)]
struct EpisodeOutcome {
    level_id: String,
    result: String,
    advanced: bool,
    duration_ms: u128,
    used_skill: bool,
}

#[derive(Debug, Serialize)]
struct OrchestratorResult {
    run_id: String,
    episodes: Vec<EpisodeOutcome>,
    total_duration_ms: u128,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt().with_env_filter("info").init();

    let worker_url =
        std::env::var("WORKER_URL").unwrap_or_else(|_| "http://localhost:8080".to_string());
    let telemetry_url =
        std::env::var("TELEMETRY_URL").unwrap_or_else(|_| "http://localhost:8081".to_string());
    let target_url_base =
        std::env::var("TARGET_URL").unwrap_or_else(|_| "http://localhost:3000".to_string());
    let level_url_template = std::env::var("LEVEL_URL_TEMPLATE")
        .unwrap_or_else(|_| "{base}/level/{level_num}".to_string());
    let plan_path = std::env::var("PLAN_PATH").ok();
    let data_dir = std::env::var("DATA_DIR").unwrap_or_else(|_| "data".to_string());
    let skills_dir = std::env::var("SKILLS_DIR").unwrap_or_else(|_| format!("{}/skills", data_dir));
    let skills_write = std::env::var("SKILLS_WRITE")
        .map(|v| v != "0")
        .unwrap_or(true);
    let skills_read = std::env::var("SKILLS_READ")
        .map(|v| v != "0")
        .unwrap_or(true);
    let time_budget_ms: u64 = std::env::var("TIME_BUDGET_MS")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(30_000);
    let artifact_profile =
        std::env::var("ARTIFACT_PROFILE").unwrap_or_else(|_| "trainer".to_string());

    let default_plan: Option<ActionPlan> = if let Some(path) = plan_path {
        let data = fs::read_to_string(path)?;
        Some(serde_json::from_str(&data)?)
    } else {
        None
    };

    let run_id = orchestrator::default_run_id();
    let levels = orchestrator::parse_levels(
        std::env::var("LEVELS").ok(),
        std::env::var("LEVEL_COUNT")
            .ok()
            .and_then(|value| value.parse().ok()),
    );

    let skill_store = SkillStore::new(PathBuf::from(skills_dir))?;
    let client = reqwest::Client::new();
    let mut outcomes = Vec::new();
    let mut total_duration_ms = 0u128;

    for level_id in levels {
        let target_url = orchestrator::level_url(&target_url_base, &level_id, &level_url_template);
        let (plan, used_skill) = if skills_read {
            if let Some(skill) = skill_store.load(&level_id)? {
                (skill.solver, true)
            } else {
                (
                    default_plan
                        .clone()
                        .unwrap_or(ActionPlan { actions: vec![] }),
                    false,
                )
            }
        } else {
            (
                default_plan
                    .clone()
                    .unwrap_or(ActionPlan { actions: vec![] }),
                false,
            )
        };

        if plan.actions.is_empty() {
            warn!(level = %level_id, "no plan actions provided");
        }

        let request = orchestrator::build_request(
            run_id.clone(),
            level_id.clone(),
            target_url,
            plan.clone(),
            telemetry_url.clone(),
            time_budget_ms,
            artifact_profile.clone(),
        );

        let start = std::time::Instant::now();
        let response = client
            .post(format!("{}/episode/run", worker_url))
            .json(&request)
            .send()
            .await?;
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        if !status.is_success() {
            warn!(status = %status, level = %level_id, "worker returned non-success status");
        }

        let result: EpisodeResult = serde_json::from_str(&body).unwrap_or(EpisodeResult {
            result: "failed".to_string(),
            reward: RewardSignal {
                advanced: false,
                reason: Some("parse_failed".to_string()),
                level_fingerprint: None,
            },
            actions_executed: vec![],
            artifacts: None,
            diagnostics: serde_json::json!({ "raw": body }),
        });

        let duration_ms = start.elapsed().as_millis();
        total_duration_ms += duration_ms;

        if skills_write && result.result == "ok" {
            let skill_card = SkillCard {
                id: format!("skill-{}-{}", level_id, Utc::now().timestamp_millis()),
                level_fingerprint: result
                    .reward
                    .level_fingerprint
                    .clone()
                    .unwrap_or_else(|| level_id.clone()),
                created_at: Utc::now(),
                solver: plan,
                verifier: ActionPlan { actions: vec![] },
                fallback: None,
                reward: result.reward.clone(),
                notes: Some("generated by orchestrator".to_string()),
            };
            skill_store.save(&level_id, &skill_card)?;
        }

        outcomes.push(EpisodeOutcome {
            level_id,
            result: result.result,
            advanced: result.reward.advanced,
            duration_ms,
            used_skill,
        });
    }

    let output = OrchestratorResult {
        run_id,
        episodes: outcomes,
        total_duration_ms,
    };

    info!(
        "orchestrator completed: {}",
        serde_json::to_string_pretty(&output)?
    );

    Ok(())
}
