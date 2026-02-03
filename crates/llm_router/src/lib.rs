use anyhow::Result;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmRequest {
    pub model: String,
    pub prompt: String,
    pub schema: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmResponse {
    pub output: serde_json::Value,
    pub latency_ms: u64,
}

pub trait LlmRouter {
    fn call(&self, request: LlmRequest) -> Result<LlmResponse>;
}

pub struct StubRouter;

impl LlmRouter for StubRouter {
    fn call(&self, _request: LlmRequest) -> Result<LlmResponse> {
        Ok(LlmResponse {
            output: serde_json::json!({"status":"stub"}),
            latency_ms: 0,
        })
    }
}
