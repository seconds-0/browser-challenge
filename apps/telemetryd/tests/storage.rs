use chrono::Utc;
use events::{ArtifactManifest, ArtifactRef, EventEnvelope};
use telemetry::TelemetryStore;
use tempfile::tempdir;

#[tokio::test]
async fn stores_run_and_events() {
    let tmp = tempdir().expect("tempdir");
    let store = TelemetryStore::connect(tmp.path().to_path_buf())
        .await
        .expect("store");

    let run_id = "run-test";
    store.insert_run(run_id, "in_progress").await.unwrap();

    let event = EventEnvelope {
        run_id: run_id.to_string(),
        level_id: "level-1".to_string(),
        episode_id: "episode-1".to_string(),
        step_id: None,
        ts: Utc::now(),
        kind: "action_started".to_string(),
        data: serde_json::json!({"action": "click"}),
    };

    store.append_events(&[event]).expect("append events");

    let run = store.get_run(run_id).await.unwrap();
    assert!(run.is_some());

    let manifest = ArtifactManifest {
        run_id: run_id.to_string(),
        level_id: "level-1".to_string(),
        episode_id: "episode-1".to_string(),
        artifacts: vec![ArtifactRef {
            kind: "trace".to_string(),
            path: tmp.path().join("trace.zip").display().to_string(),
            content_type: Some("application/zip".to_string()),
            size_bytes: None,
            sha256: None,
        }],
    };

    store.write_manifest(&manifest).expect("write manifest");
}
