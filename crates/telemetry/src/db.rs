use std::collections::BTreeMap;

use anyhow::Result;
use chrono::{DateTime, Utc};
use sqlx::{any::AnyPoolOptions, Any, Pool};

use events::{ArtifactManifest, ArtifactRef, EventEnvelope, RunMetadata};

#[derive(Clone)]
pub struct DbStore {
    pub db: Pool<Any>,
    pub use_postgres: bool,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct RunSummary {
    pub run_id: String,
    pub total_events: i64,
    pub by_kind: BTreeMap<String, i64>,
    pub first_ts: Option<String>,
    pub last_ts: Option<String>,
}

impl DbStore {
    pub async fn connect(database_url: Option<String>, data_dir: &std::path::Path) -> Result<Self> {
        sqlx::any::install_default_drivers();
        let db_path = data_dir.join("telemetry.sqlite");
        let url =
            database_url.unwrap_or_else(|| format!("sqlite://{}?mode=rwc", db_path.display()));
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

        Ok(Self { db, use_postgres })
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

    pub async fn get_artifacts(&self, run_id: &str, limit: usize) -> Result<Vec<ArtifactRef>> {
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
                |(kind, path, content_type, size_bytes, sha256)| ArtifactRef {
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

    pub async fn get_run_summary(&self, run_id: &str) -> Result<RunSummary> {
        let rows = sqlx::query_as::<_, (String, i64)>(self.sql(
            "SELECT kind, COUNT(*) FROM events WHERE run_id = ? GROUP BY kind",
            "SELECT kind, COUNT(*) FROM events WHERE run_id = $1 GROUP BY kind",
        ))
        .bind(run_id)
        .fetch_all(&self.db)
        .await?;
        let mut by_kind = BTreeMap::new();
        let mut total_events = 0i64;
        for (kind, count) in rows {
            total_events += count;
            by_kind.insert(kind, count);
        }
        let (first_ts, last_ts) = sqlx::query_as::<_, (Option<String>, Option<String>)>(self.sql(
            "SELECT MIN(ts), MAX(ts) FROM events WHERE run_id = ?",
            "SELECT MIN(ts), MAX(ts) FROM events WHERE run_id = $1",
        ))
        .bind(run_id)
        .fetch_one(&self.db)
        .await
        .unwrap_or((None, None));
        Ok(RunSummary {
            run_id: run_id.to_string(),
            total_events,
            by_kind,
            first_ts,
            last_ts,
        })
    }
}
