use events::ActionPlan;
use orchestrator::{build_request, default_run_id};

#[test]
fn builds_episode_request() {
    let run_id = default_run_id();
    let plan = ActionPlan { actions: vec![] };
    let request = build_request(
        run_id.clone(),
        "level-1".to_string(),
        "http://example.com".to_string(),
        plan,
        "http://telemetry".to_string(),
        1000,
        "trainer".to_string(),
    );

    assert_eq!(request.run_id, run_id);
    assert_eq!(request.level_id, "level-1");
    assert!(request.checkpoint.is_some());
}
