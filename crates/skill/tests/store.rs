use chrono::Utc;
use events::{ActionPlan, RewardSignal};
use skill::{SkillCard, SkillStore};
use tempfile::tempdir;

#[test]
fn saves_and_loads_skillcard() {
    let tmp = tempdir().expect("tempdir");
    let store = SkillStore::new(tmp.path().join("skills")).expect("store");

    let card = SkillCard {
        id: "skill-1".to_string(),
        level_fingerprint: "level-1".to_string(),
        created_at: Utc::now(),
        solver: ActionPlan { actions: vec![] },
        verifier: ActionPlan { actions: vec![] },
        fallback: None,
        reward: RewardSignal {
            advanced: true,
            reason: None,
            level_fingerprint: None,
        },
        notes: Some("test".to_string()),
    };

    store.save("level-1", &card).expect("save");
    let loaded = store.load("level-1").expect("load").expect("some");
    assert_eq!(loaded.id, card.id);
    assert_eq!(loaded.level_fingerprint, card.level_fingerprint);
}
