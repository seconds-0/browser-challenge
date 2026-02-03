mod db;
mod jsonl;

use std::path::PathBuf;

use anyhow::Result;

use common::{ensure_dir, run_root};
use events::{ArtifactManifest, EventEnvelope, RunMetadata};

use db::DbStore;
pub use db::RunSummary;
use jsonl::JsonlStore;

#[derive(Clone)]
pub struct TelemetryStore {
    pub data_dir: PathBuf,
    db: DbStore,
    jsonl: Option<JsonlStore>,
}

impl TelemetryStore {
    pub async fn connect(
        data_dir: PathBuf,
        database_url: Option<String>,
        jsonl_enabled: bool,
    ) -> Result<Self> {
        ensure_dir(&data_dir)?;
        let db = DbStore::connect(database_url, &data_dir).await?;
        let jsonl = if jsonl_enabled {
            Some(JsonlStore::new(data_dir.clone()))
        } else {
            None
        };
        Ok(Self {
            data_dir,
            db,
            jsonl,
        })
    }

    pub async fn insert_run(&self, run_id: &str, status: &str) -> Result<()> {
        self.db.insert_run(run_id, status).await
    }

    pub async fn update_run_status(&self, run_id: &str, status: &str) -> Result<()> {
        self.db.update_run_status(run_id, status).await
    }

    pub async fn get_run(&self, run_id: &str) -> Result<Option<RunMetadata>> {
        self.db.get_run(run_id).await
    }

    pub async fn append_events(&self, events: &[EventEnvelope]) -> Result<()> {
        if events.is_empty() {
            return Ok(());
        }
        let run_id = &events[0].run_id;
        let level_id = &events[0].level_id;
        let episode_id = &events[0].episode_id;
        for event in events {
            if event.run_id != *run_id
                || event.level_id != *level_id
                || event.episode_id != *episode_id
            {
                anyhow::bail!("event envelope identifiers are inconsistent");
            }
        }
        self.db.append_events(events).await?;
        if let Some(jsonl) = &self.jsonl {
            jsonl.append_events(events)?;
        }
        Ok(())
    }

    pub async fn write_manifest(&self, manifest: &ArtifactManifest) -> Result<()> {
        self.db.write_manifest(manifest).await?;
        if let Some(jsonl) = &self.jsonl {
            jsonl.write_manifest(manifest)?;
        }
        Ok(())
    }

    pub fn run_dir(&self, run_id: &str) -> PathBuf {
        run_root(&self.data_dir, run_id)
    }

    pub fn artifacts_dir(&self, run_id: &str, level_id: &str, episode_id: &str) -> PathBuf {
        self.run_dir(run_id)
            .join("levels")
            .join(level_id)
            .join("episodes")
            .join(episode_id)
    }

    pub async fn get_events(&self, run_id: &str, limit: usize) -> Result<Vec<EventEnvelope>> {
        self.db.get_events(run_id, limit).await
    }

    pub async fn get_artifacts(
        &self,
        run_id: &str,
        limit: usize,
    ) -> Result<Vec<events::ArtifactRef>> {
        self.db.get_artifacts(run_id, limit).await
    }

    pub async fn get_run_summary(&self, run_id: &str) -> Result<RunSummary> {
        self.db.get_run_summary(run_id).await
    }
}
