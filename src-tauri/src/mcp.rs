use futures_util::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpTool {
    pub name: String,
    pub description: Option<String>,
}

fn ingest_sse(buf: &str, messages: &mut Vec<Value>) {
    for block in buf.split("\n\n") {
        let Some(line) = block.lines().find(|l| l.starts_with("data:")) else {
            continue;
        };
        let raw = line.trim_start_matches("data:").trim();
        if raw.starts_with("/mcp/") {
            continue;
        }
        if let Ok(v) = serde_json::from_str::<Value>(raw) {
            if v.get("id").is_some() || v.get("result").is_some() || v.get("error").is_some() {
                if !messages.iter().any(|m| m == &v) {
                    messages.push(v);
                }
            }
        }
    }
}

fn session_id(buf: &str) -> Option<String> {
    let idx = buf.find("sessionId=")?;
    let rest = &buf[idx + 10..];
    let end = rest
        .find(|c: char| !c.is_ascii_hexdigit() && c != '-')
        .unwrap_or(rest.len());
    Some(rest[..end].to_string())
}

async fn post_json(client: &Client, url: &str, body: Value) -> Result<(), String> {
    client
        .post(url)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

async fn wait_for_id(
    id: i64,
    messages: &mut Vec<Value>,
    stream: &mut (impl futures_util::Stream<Item = Result<bytes::Bytes, reqwest::Error>> + Unpin),
    buf: &mut String,
    timeout: Duration,
) -> Result<Value, String> {
    let deadline = Instant::now() + timeout;
    loop {
        if let Some(msg) = messages.iter().find(|m| m.get("id") == Some(&json!(id))) {
            return Ok(msg.clone());
        }
        if Instant::now() >= deadline {
            return Err(format!("MCP timeout waiting for response (id={id})"));
        }
        let chunk = tokio::time::timeout(Duration::from_millis(800), stream.next())
            .await
            .map_err(|_| format!("MCP timeout waiting for response (id={id})"))?;
        match chunk {
            Some(Ok(bytes)) => {
                buf.push_str(&String::from_utf8_lossy(&bytes));
                ingest_sse(buf, messages);
            }
            Some(Err(e)) => return Err(e.to_string()),
            None => return Err("MCP SSE stream closed".to_string()),
        }
    }
}

async fn run_rpc(origin: &str, req_id: i64, method: &str, params: Value) -> Result<Value, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    let sse_url = format!("{origin}/sse");
    let response = client
        .get(&sse_url)
        .header("Accept", "text/event-stream")
        .send()
        .await
        .map_err(|e| format!("SSE connect failed: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("SSE HTTP {}", response.status()));
    }

    let mut stream = response.bytes_stream();
    let mut buf = String::new();
    let mut messages: Vec<Value> = vec![];

    let endpoint = {
        let deadline = Instant::now() + Duration::from_secs(30);
        loop {
            if let Some(sid) = session_id(&buf) {
                break format!("{origin}/mcp/messages?sessionId={sid}");
            }
            if Instant::now() >= deadline {
                return Err("MCP SSE connection timed out".to_string());
            }
            let chunk = tokio::time::timeout(Duration::from_secs(8), stream.next())
                .await
                .map_err(|_| "MCP SSE connection timed out".to_string())?
                .ok_or("MCP SSE stream closed before session ready")?
                .map_err(|e| e.to_string())?;
            buf.push_str(&String::from_utf8_lossy(&chunk));
            ingest_sse(&buf, &mut messages);
        }
    };

    post_json(
        &client,
        &endpoint,
        json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": { "name": "smriti-desktop", "version": "1.0" }
            }
        }),
    )
    .await?;

    post_json(
        &client,
        &endpoint,
        json!({
            "jsonrpc": "2.0",
            "method": "notifications/initialized",
            "params": {}
        }),
    )
    .await?;

    post_json(
        &client,
        &endpoint,
        json!({
            "jsonrpc": "2.0",
            "id": req_id,
            "method": method,
            "params": params
        }),
    )
    .await?;

    wait_for_id(req_id, &mut messages, &mut stream, &mut buf, Duration::from_secs(45)).await
}

pub async fn list_tools(base: &str) -> Result<Vec<McpTool>, String> {
    let origin = base.trim_end_matches('/');
    let msg = run_rpc(origin, 2, "tools/list", json!({})).await?;

    let tools = msg
        .pointer("/result/tools")
        .and_then(|t| t.as_array())
        .cloned()
        .unwrap_or_default();

    Ok(tools
        .into_iter()
        .filter_map(|t| {
            Some(McpTool {
                name: t.get("name")?.as_str()?.to_string(),
                description: t
                    .get("description")
                    .and_then(|d| d.as_str())
                    .map(str::to_string),
            })
        })
        .collect())
}

pub async fn call_tool(base: &str, name: &str, args: Value) -> Result<String, String> {
    let origin = base.trim_end_matches('/');
    let msg = run_rpc(
        origin,
        3,
        "tools/call",
        json!({ "name": name, "arguments": args }),
    )
    .await?;

    if let Some(err) = msg.get("error").and_then(|e| e.get("message")).and_then(|m| m.as_str()) {
        return Err(err.to_string());
    }

    let result = msg.get("result").ok_or("Empty MCP tool result")?;
    if result.get("isError").and_then(|v| v.as_bool()) == Some(true) {
        let text = result
            .pointer("/content/0/text")
            .and_then(|t| t.as_str())
            .unwrap_or("Tool failed");
        return Err(text.to_string());
    }

    if let Some(text) = result.pointer("/content/0/text").and_then(|t| t.as_str()) {
        return Ok(text.to_string());
    }

    Ok(result.to_string())
}
