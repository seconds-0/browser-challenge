use orchestrator::{level_url, parse_levels};

#[test]
fn parses_levels_list() {
    let levels = parse_levels(Some("level-1, level-2,,".to_string()), None);
    assert_eq!(levels, vec!["level-1", "level-2"]);
}

#[test]
fn parses_levels_count_default() {
    let levels = parse_levels(None, Some(3));
    assert_eq!(levels, vec!["level-1", "level-2", "level-3"]);
}

#[test]
fn builds_level_url_from_template() {
    let url = level_url("http://example.com/", "level-7", "{base}/level/{level_num}");
    assert_eq!(url, "http://example.com/level/7");
}
