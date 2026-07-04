use futures_util::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

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
    messages: Arc<Mutex<Vec<Value>>>,
    timeout: Duration,
) -> Result<Value, String> {
    let deadline = Instant::now() + timeout;
    loop {
        {
            let msgs = messages.lock().await;
            if let Some(msg) = msgs.iter().find(|m| m.get("id") == Some(&json!(id))) {
                return Ok(msg.clone());
            }
        }
        if Instant::now() >= deadline {
            return Err(format!("MCP timeout waiting for response (id={id})"));
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
}

async fn run_rpc(origin: &str, req_id: i64, method: &str, params: Value) -> Result<Value, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(180))
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
    let messages: Arc<Mutex<Vec<Value>>> = Arc::new(Mutex::new(Vec::new()));
    let buf: Arc<Mutex<String>> = Arc::new(Mutex::new(String::new()));

    let messages_reader = messages.clone();
    let buf_reader = buf.clone();
    let read_task = tokio::spawn(async move {
        while let Some(chunk) = stream.next().await {
            match chunk {
                Ok(bytes) => {
                    let mut b = buf_reader.lock().await;
                    b.push_str(&String::from_utf8_lossy(&bytes));
                    let mut m = messages_reader.lock().await;
                    ingest_sse(&b, &mut m);
                }
                Err(_) => break,
            }
        }
    });

    let endpoint = {
        let deadline = Instant::now() + Duration::from_secs(30);
        loop {
            let sid = {
                let b = buf.lock().await;
                session_id(&b)
            };
            if let Some(sid) = sid {
                break format!("{origin}/mcp/messages?sessionId={sid}");
            }
            if Instant::now() >= deadline {
                read_task.abort();
                return Err("MCP SSE connection timed out".to_string());
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
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

    wait_for_id(1, messages.clone(), Duration::from_secs(15)).await?;

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

    let timeout = if method == "tools/call" {
        Duration::from_secs(120)
    } else {
        Duration::from_secs(45)
    };

    let result = wait_for_id(req_id, messages.clone(), timeout).await;
    read_task.abort();
    result
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
        return Err(clean_tool_error(err));
    }

    let result = msg.get("result").ok_or("Empty MCP tool result")?;
    if result.get("isError").and_then(|v| v.as_bool()) == Some(true) {
        let text = result
            .pointer("/content/0/text")
            .and_then(|t| t.as_str())
            .unwrap_or("Tool failed");
        return Err(clean_tool_error(text));
    }

    if let Some(text) = result.pointer("/content/0/text").and_then(|t| t.as_str()) {
        return Ok(format_tool_text(text));
    }

    Ok(format_tool_text(&result.to_string()))
}

fn clean_tool_error(raw: &str) -> String {
    let trimmed = raw.trim();
    if let Some(rest) = trimmed.strip_prefix("Error executing tool ") {
        if let Some(idx) = rest.find("': ") {
            return rest[idx + 3..].trim().to_string();
        }
    }
    trimmed
        .strip_prefix("Error: ")
        .unwrap_or(trimmed)
        .trim()
        .to_string()
}

fn format_tool_text(text: &str) -> String {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return "(empty response)".to_string();
    }
    if let Ok(value) = serde_json::from_str::<Value>(trimmed) {
        if let Ok(pretty) = serde_json::to_string_pretty(&value) {
            return pretty;
        }
    }
    trimmed.to_string()
}
