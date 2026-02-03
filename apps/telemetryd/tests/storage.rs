use chrono::Utc;
use events::{ArtifactManifest, ArtifactRef, EventEnvelope};
use telemetry::TelemetryStore;
use tempfile::tempdir;

#[tokio::test]
async fn stores_run_and_events() {
    let tmp = tempdir().expect("tempdir");
    let store = TelemetryStore::connect(tmp.path().to_path_buf(), None, false)
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

    store.append_events(&[event]).await.expect("append events");

    let run = store.get_run(run_id).await.unwrap();
    assert!(run.is_some());

    let events = store.get_events(run_id, 10).await.expect("get events");
    assert_eq!(events.len(), 1);

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

    store
        .write_manifest(&manifest)
        .await
        .expect("write manifest");
}

#[tokio::test]
async fn rejects_mismatched_event_ids() {
    let tmp = tempdir().expect("tempdir");
    let store = TelemetryStore::connect(tmp.path().to_path_buf(), None, false)
        .await
        .expect("store");

    let event_a = EventEnvelope {
        run_id: "run-1".to_string(),
        level_id: "level-1".to_string(),
        episode_id: "episode-1".to_string(),
        step_id: None,
        ts: Utc::now(),
        kind: "action_started".to_string(),
        data: serde_json::json!({}),
    };

    let mut event_b = event_a.clone();
    event_b.run_id = "run-2".to_string();

    let result = store.append_events(&[event_a, event_b]).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn summary_counts_events() {
    let tmp = tempdir().expect("tempdir");
    let store = TelemetryStore::connect(tmp.path().to_path_buf(), None, false)
        .await
        .expect("store");

    let run_id = "run-summary";
    store.insert_run(run_id, "in_progress").await.unwrap();

    let base = EventEnvelope {
        run_id: run_id.to_string(),
        level_id: "level-1".to_string(),
        episode_id: "episode-1".to_string(),
        step_id: None,
        ts: Utc::now(),
        kind: "action_started".to_string(),
        data: serde_json::json!({}),
    };
    let mut alert = base.clone();
    alert.kind = "alert".to_string();

    store.append_events(&[base, alert]).await.unwrap();

    let summary = store.get_run_summary(run_id).await.unwrap();
    assert_eq!(summary.total_events, 2);
    assert_eq!(summary.by_kind.get("action_started"), Some(&1));
    assert_eq!(summary.by_kind.get("alert"), Some(&1));
}
