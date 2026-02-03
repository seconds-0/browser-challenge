use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::PathBuf;

use anyhow::Result;
use chrono::{DateTime, Utc};
use sqlx::{sqlite::SqliteConnectOptions, Pool, Sqlite, SqlitePool};

use common::{ensure_dir, run_root};
use events::{ArtifactManifest, EventEnvelope, RunMetadata};

#[derive(Clone)]
pub struct TelemetryStore {
    pub data_dir: PathBuf,
    pub db: Pool<Sqlite>,
}

impl TelemetryStore {
    pub async fn connect(data_dir: PathBuf) -> Result<Self> {
        ensure_dir(&data_dir)?;
        let db_path = data_dir.join("telemetry.sqlite");
        let options = SqliteConnectOptions::new()
            .filename(&db_path)
            .create_if_missing(true);
        let db = SqlitePool::connect_with(options).await?;
        sqlx::query(
            "CREATE TABLE IF NOT EXISTS runs (
                run_id TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL
            );",
        )
        .execute(&db)
        .await?;

        Ok(Self { data_dir, db })
    }

    pub async fn insert_run(&self, run_id: &str, status: &str) -> Result<()> {
        let created_at: DateTime<Utc> = Utc::now();
        sqlx::query("INSERT OR REPLACE INTO runs (run_id, status, created_at) VALUES (?, ?, ?)")
            .bind(run_id)
            .bind(status)
            .bind(created_at.to_rfc3339())
            .execute(&self.db)
            .await?;
        Ok(())
    }

    pub async fn update_run_status(&self, run_id: &str, status: &str) -> Result<()> {
        sqlx::query("UPDATE runs SET status = ? WHERE run_id = ?")
            .bind(status)
            .bind(run_id)
            .execute(&self.db)
            .await?;
        Ok(())
    }

    pub async fn get_run(&self, run_id: &str) -> Result<Option<RunMetadata>> {
        let row = sqlx::query_as::<_, (String, String, String)>(
            "SELECT run_id, status, created_at FROM runs WHERE run_id = ?",
        )
        .bind(run_id)
        .fetch_optional(&self.db)
        .await?;

        Ok(row.map(|(run_id, status, created_at)| RunMetadata {
            run_id,
            status,
            created_at: DateTime::parse_from_rfc3339(&created_at)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now()),
        }))
    }

    pub fn append_events(&self, events: &[EventEnvelope]) -> Result<()> {
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
}
