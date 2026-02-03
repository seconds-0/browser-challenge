use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::PathBuf;

use anyhow::Result;

use common::{ensure_dir, run_root};
use events::{ArtifactManifest, EventEnvelope};

#[derive(Clone)]
pub struct JsonlStore {
    pub data_dir: PathBuf,
}

impl JsonlStore {
    pub fn new(data_dir: PathBuf) -> Self {
        Self { data_dir }
    }

    pub fn append_events(&self, events: &[EventEnvelope]) -> Result<()> {
        if events.is_empty() {
            return Ok(());
        }
        let run_id = &events[0].run_id;
        let run_dir = run_root(&self.data_dir, run_id);
        ensure_dir(&run_dir)?;
        let events_path = run_dir.join("events.jsonl");
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(events_path)?;
        for event in events {
            let line = serde_json::to_string(event)?;
            writeln!(file, "{}", line)?;
        }
        Ok(())
    }

    pub fn write_manifest(&self, manifest: &ArtifactManifest) -> Result<()> {
        let run_dir = run_root(&self.data_dir, &manifest.run_id);
        ensure_dir(&run_dir)?;
        let manifest_path = run_dir
            .join("levels")
            .join(&manifest.level_id)
            .join("episodes")
            .join(&manifest.episode_id)
            .join("artifact_manifest.json");
        if let Some(parent) = manifest_path.parent() {
            ensure_dir(parent)?;
        }
        let mut file = File::create(manifest_path)?;
        let data = serde_json::to_vec_pretty(manifest)?;
        file.write_all(&data)?;
        Ok(())
    }
}
