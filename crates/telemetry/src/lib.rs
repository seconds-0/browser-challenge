use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::PathBuf;

use anyhow::Result;
use chrono::{DateTime, Utc};
use sqlx::{any::AnyPoolOptions, Any, Pool};

use common::{ensure_dir, run_root};
use events::{ArtifactManifest, EventEnvelope, RunMetadata};

#[derive(Clone)]
pub struct TelemetryStore {
    pub data_dir: PathBuf,
    pub db: Pool<Any>,
    pub use_postgres: bool,
}

impl TelemetryStore {
    pub async fn connect(data_dir: PathBuf, database_url: Option<String>) -> Result<Self> {
        ensure_dir(&data_dir)?;
        let db_path = data_dir.join("telemetry.sqlite");
        let url = database_url.unwrap_or_else(|| format!("sqlite://{}", db_path.display()));
        let use_postgres = url.starts_with("postgres://") || url.starts_with("postgresql://");
        let db = AnyPoolOptions::new()
            .max_connections(10)
            .connect(&url)
            .await?;
        sqlx::query(
            "CREATE TABLE IF NOT EXISTS runs (
                run_id TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL
            );",
        )
        .execute(&db)
        .await?;
        sqlx::query(
            "CREATE TABLE IF NOT EXISTS events (
                run_id TEXT NOT NULL,
                level_id TEXT NOT NULL,
                episode_id TEXT NOT NULL,
                step_id TEXT,
                ts TEXT NOT NULL,
                kind TEXT NOT NULL,
                payload TEXT NOT NULL
            );",
        )
        .execute(&db)
        .await?;
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_events_run ON events(run_id);")
            .execute(&db)
            .await?;
        sqlx::query(
            "CREATE TABLE IF NOT EXISTS artifacts (
                run_id TEXT NOT NULL,
                level_id TEXT NOT NULL,
                episode_id TEXT NOT NULL,
                kind TEXT NOT NULL,
                path TEXT NOT NULL,
                content_type TEXT,
                size_bytes INTEGER,
                sha256 TEXT
            );",
        )
        .execute(&db)
        .await?;
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_artifacts_run ON artifacts(run_id);")
            .execute(&db)
            .await?;

        Ok(Self {
            data_dir,
            db,
            use_postgres,
        })
    }

    fn sql(&self, sqlite: &'static str, postgres: &'static str) -> &'static str {
        if self.use_postgres {
            postgres
        } else {
            sqlite
        }
    }

    pub async fn insert_run(&self, run_id: &str, status: &str) -> Result<()> {
        let created_at: DateTime<Utc> = Utc::now();
        sqlx::query(self.sql(
            "INSERT OR REPLACE INTO runs (run_id, status, created_at) VALUES (?, ?, ?)",
            "INSERT INTO runs (run_id, status, created_at) VALUES ($1, $2, $3)\n            ON CONFLICT (run_id) DO UPDATE SET status = EXCLUDED.status, created_at = EXCLUDED.created_at",
        ))
            .bind(run_id)
            .bind(status)
            .bind(created_at.to_rfc3339())
            .execute(&self.db)
            .await?;
        Ok(())
    }

    pub async fn update_run_status(&self, run_id: &str, status: &str) -> Result<()> {
        sqlx::query(self.sql(
            "UPDATE runs SET status = ? WHERE run_id = ?",
            "UPDATE runs SET status = $1 WHERE run_id = $2",
        ))
        .bind(status)
        .bind(run_id)
        .execute(&self.db)
        .await?;
        Ok(())
    }

    pub async fn get_run(&self, run_id: &str) -> Result<Option<RunMetadata>> {
        let row = sqlx::query_as::<_, (String, String, String)>(self.sql(
            "SELECT run_id, status, created_at FROM runs WHERE run_id = ?",
            "SELECT run_id, status, created_at FROM runs WHERE run_id = $1",
        ))
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
        let mut tx = self.db.begin().await?;
        for event in events {
            let payload = serde_json::to_string(event)?;
            sqlx::query(self.sql(
                "INSERT INTO events (run_id, level_id, episode_id, step_id, ts, kind, payload)
                 VALUES (?, ?, ?, ?, ?, ?, ?)",
                "INSERT INTO events (run_id, level_id, episode_id, step_id, ts, kind, payload)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)",
            ))
            .bind(&event.run_id)
            .bind(&event.level_id)
            .bind(&event.episode_id)
            .bind(&event.step_id)
            .bind(event.ts.to_rfc3339())
            .bind(&event.kind)
            .bind(payload)
            .execute(&mut *tx)
            .await?;
        }
        tx.commit().await?;
        Ok(())
    }

    pub async fn write_manifest(&self, manifest: &ArtifactManifest) -> Result<()> {
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
        let mut tx = self.db.begin().await?;
        for artifact in &manifest.artifacts {
            sqlx::query(self.sql(
                "INSERT INTO artifacts (run_id, level_id, episode_id, kind, path, content_type, size_bytes, sha256)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                "INSERT INTO artifacts (run_id, level_id, episode_id, kind, path, content_type, size_bytes, sha256)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
            ))
            .bind(&manifest.run_id)
            .bind(&manifest.level_id)
            .bind(&manifest.episode_id)
            .bind(&artifact.kind)
            .bind(&artifact.path)
            .bind(&artifact.content_type)
            .bind(artifact.size_bytes.map(|v| v as i64))
            .bind(&artifact.sha256)
            .execute(&mut *tx)
            .await?;
        }
        tx.commit().await?;
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
        let rows = sqlx::query_as::<_, (String,)>(self.sql(
            "SELECT payload FROM events WHERE run_id = ? ORDER BY ts ASC LIMIT ?",
            "SELECT payload FROM events WHERE run_id = $1 ORDER BY ts ASC LIMIT $2",
        ))
        .bind(run_id)
        .bind(limit as i64)
        .fetch_all(&self.db)
        .await?;
        let mut events = Vec::with_capacity(rows.len());
        for (payload,) in rows {
            let event: EventEnvelope = serde_json::from_str(&payload)?;
            events.push(event);
        }
        Ok(events)
    }

    pub async fn get_artifacts(
        &self,
        run_id: &str,
        limit: usize,
    ) -> Result<Vec<events::ArtifactRef>> {
        let rows = sqlx::query_as::<_, (String, String, Option<String>, Option<i64>, Option<String>)>(
            self.sql(
                "SELECT kind, path, content_type, size_bytes, sha256 FROM artifacts WHERE run_id = ? LIMIT ?",
                "SELECT kind, path, content_type, size_bytes, sha256 FROM artifacts WHERE run_id = $1 LIMIT $2",
            ),
        )
        .bind(run_id)
        .bind(limit as i64)
        .fetch_all(&self.db)
        .await?;
        let artifacts = rows
            .into_iter()
            .map(
                |(kind, path, content_type, size_bytes, sha256)| events::ArtifactRef {
                    kind,
                    path,
                    content_type,
                    size_bytes: size_bytes.map(|v| v as u64),
                    sha256,
                },
            )
            .collect();
        Ok(artifacts)
    }
}
