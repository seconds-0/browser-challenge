use axum::body::Body;
use axum::http::{Request, StatusCode};
use tower::ServiceExt;

use telemetry::TelemetryStore;

#[tokio::test]
async fn rejects_mismatched_payload_in_http() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let store = TelemetryStore::connect(tmp.path().to_path_buf(), None, false)
        .await
        .expect("store");
    let app = telemetryd::build_app(store);

    let payload = serde_json::json!({
        "run_id": "run-1",
        "level_id": "level-1",
        "episode_id": "episode-1",
        "events": [
            {
                "run_id": "run-2",
                "level_id": "level-1",
                "episode_id": "episode-1",
                "step_id": null,
                "ts": "2026-02-03T00:00:00Z",
                "kind": "action_started",
                "data": {}
            }
        ]
    });

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/events")
                .header("content-type", "application/json")
                .body(Body::from(payload.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}
