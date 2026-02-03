use std::net::SocketAddr;
use std::path::PathBuf;

use axum::{
    extract::Path, http::StatusCode, response::IntoResponse, routing::get, routing::post, Json,
    Router,
};
use serde::{Deserialize, Serialize};
use tracing::{error, info};

use events::{ArtifactManifest, EventEnvelope};
use telemetry::TelemetryStore;

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct EventsPayload {
    pub run_id: String,
    pub level_id: String,
    pub episode_id: String,
    pub events: Vec<EventEnvelope>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct ArtifactsPayload {
    pub run_id: String,
    pub level_id: String,
    pub episode_id: String,
    pub manifest: ArtifactManifest,
}

#[derive(Debug, Serialize)]
struct HealthResponse {
    status: &'static str,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt().with_env_filter("info").init();

    let data_dir = std::env::var("DATA_DIR").unwrap_or_else(|_| "data".to_string());
    let store = TelemetryStore::connect(PathBuf::from(data_dir)).await?;

    let app = Router::new()
        .route("/health", get(health))
        .route("/events", post(post_events))
        .route("/artifacts", post(post_artifacts))
        .route("/runs/:run_id", get(get_run))
        .with_state(store);

    let addr: SocketAddr = "0.0.0.0:8081".parse().unwrap();
    info!("telemetryd listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app.into_make_service()).await?;

    Ok(())
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse { status: "ok" })
}

async fn post_events(
    axum::extract::State(store): axum::extract::State<TelemetryStore>,
    Json(payload): Json<EventsPayload>,
) -> impl IntoResponse {
    if let Err(err) = store.insert_run(&payload.run_id, "in_progress").await {
        error!(?err, "failed to insert run");
        return StatusCode::INTERNAL_SERVER_ERROR;
    }

    if let Err(err) = store.append_events(&payload.events) {
        error!(?err, "failed to append events");
        return StatusCode::INTERNAL_SERVER_ERROR;
    }

    StatusCode::OK
}

async fn post_artifacts(
    axum::extract::State(store): axum::extract::State<TelemetryStore>,
    Json(payload): Json<ArtifactsPayload>,
) -> impl IntoResponse {
    if let Err(err) = store.write_manifest(&payload.manifest) {
        error!(?err, "failed to write manifest");
        return StatusCode::INTERNAL_SERVER_ERROR;
    }

    StatusCode::OK
}

async fn get_run(
    axum::extract::State(store): axum::extract::State<TelemetryStore>,
    Path(run_id): Path<String>,
) -> impl IntoResponse {
    match store.get_run(&run_id).await {
        Ok(Some(run)) => Json(run).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(err) => {
            error!(?err, "failed to get run");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}
