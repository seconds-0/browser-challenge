use std::net::SocketAddr;
use std::path::PathBuf;

use tracing::info;

use telemetry::TelemetryStore;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt().with_env_filter("info").init();

    let data_dir = std::env::var("DATA_DIR").unwrap_or_else(|_| "data".to_string());
    let database_url = std::env::var("DATABASE_URL").ok();
    let jsonl_enabled = std::env::var("TELEMETRY_JSONL")
        .map(|v| v != "0")
        .unwrap_or(true);
    let store =
        TelemetryStore::connect(PathBuf::from(data_dir), database_url, jsonl_enabled).await?;
    let app = telemetryd::build_app(store);

    let addr: SocketAddr = "0.0.0.0:8081".parse().unwrap();
    info!("telemetryd listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app.into_make_service()).await?;

    Ok(())
}
