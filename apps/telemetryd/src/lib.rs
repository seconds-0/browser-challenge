use axum::{
    extract::Path, http::StatusCode, response::IntoResponse, routing::get, routing::post, Json,
    Router,
};
use serde::{Deserialize, Serialize};
use tracing::error;

use telemetry::TelemetryStore;

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct EventsPayload {
    pub run_id: String,
    pub level_id: String,
    pub episode_id: String,
    pub events: Vec<events::EventEnvelope>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct ArtifactsPayload {
    pub run_id: String,
    pub level_id: String,
    pub episode_id: String,
    pub manifest: events::ArtifactManifest,
}

#[derive(Debug, Serialize)]
struct HealthResponse {
    status: &'static str,
}

#[derive(Debug, Deserialize)]
struct QueryLimit {
    limit: Option<usize>,
}

pub fn build_app(store: TelemetryStore) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/events", post(post_events))
        .route("/artifacts", post(post_artifacts))
        .route("/runs/:run_id", get(get_run))
        .route("/runs/:run_id/events", get(get_run_events))
        .route("/runs/:run_id/artifacts", get(get_run_artifacts))
        .with_state(store)
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse { status: "ok" })
}

async fn post_events(
    axum::extract::State(store): axum::extract::State<TelemetryStore>,
    Json(payload): Json<EventsPayload>,
) -> impl IntoResponse {
    for event in &payload.events {
        if event.run_id != payload.run_id
            || event.level_id != payload.level_id
            || event.episode_id != payload.episode_id
        {
            return StatusCode::BAD_REQUEST;
        }
    }

    if let Err(err) = store.insert_run(&payload.run_id, "in_progress").await {
        error!(?err, "failed to insert run");
        return StatusCode::INTERNAL_SERVER_ERROR;
    }

    if let Err(err) = store.append_events(&payload.events).await {
        error!(?err, "failed to append events");
        return StatusCode::INTERNAL_SERVER_ERROR;
    }

    StatusCode::OK
}

async fn post_artifacts(
    axum::extract::State(store): axum::extract::State<TelemetryStore>,
    Json(payload): Json<ArtifactsPayload>,
) -> impl IntoResponse {
    if payload.manifest.run_id != payload.run_id
        || payload.manifest.level_id != payload.level_id
        || payload.manifest.episode_id != payload.episode_id
    {
        return StatusCode::BAD_REQUEST;
    }

    if let Err(err) = store.write_manifest(&payload.manifest).await {
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

async fn get_run_events(
    axum::extract::State(store): axum::extract::State<TelemetryStore>,
    Path(run_id): Path<String>,
    axum::extract::Query(params): axum::extract::Query<QueryLimit>,
) -> impl IntoResponse {
    let limit = params.limit.unwrap_or(1000);
    match store.get_events(&run_id, limit).await {
        Ok(events) => Json(events).into_response(),
        Err(err) => {
            error!(?err, "failed to get run events");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

async fn get_run_artifacts(
    axum::extract::State(store): axum::extract::State<TelemetryStore>,
    Path(run_id): Path<String>,
    axum::extract::Query(params): axum::extract::Query<QueryLimit>,
) -> impl IntoResponse {
    let limit = params.limit.unwrap_or(1000);
    match store.get_artifacts(&run_id, limit).await {
        Ok(artifacts) => Json(artifacts).into_response(),
        Err(err) => {
            error!(?err, "failed to get run artifacts");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}
