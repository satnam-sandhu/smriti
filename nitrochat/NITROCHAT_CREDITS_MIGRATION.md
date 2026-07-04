# NitroChat Credits & Analytics: Complete Implementation Guide

This document covers the refactoring of NitroChat credits from API-key-level to organization-level, and the implementation of the **NitroChat Analytics System** (ClickHouse + MongoDB).

---

## 1. Credits Architecture

| Feature | Change |
|--------|-------|
| **Storage** | Credits moved from `nitrochat_gateway_api_keys` to a shared `nitrochat_org_credits` collection. |
| **Allocation** | Every organization receives a default $5.00 (500 cents) allowance. |
| **Logic** | The gateway checks the organization's total balance instead of the individial key's balance. |

### Data Model (`nitrochat_org_credits`)
```json
{
  "organization": "<ObjectId>",
  "creditsTotal": 500,         // Total allowance
  "creditsUsed": 0,            // Total spent across all instances
  "instanceUsage": [           // Per-instance statistics
    { "instanceId": "...", "creditsUsed": 150, "totalRequests": 42 }
  ]
}
```

---

## 2. Analytics Architecture (NEW)

The analytics system uses a dual-write approach to provide both high-level aggregated charts and granular request logs.

### A. ClickHouse Table (`nitrochat_usage_logs`)
Stores every single request for "Call Intelligence" style logs. **Run this DDL in ClickHouse:**

```sql
CREATE TABLE IF NOT EXISTS nitrochat_usage_logs (
    id              UUID          DEFAULT generateUUIDv4(),
    created_at      DateTime      DEFAULT now(),
    api_key_id      String,
    api_key_prefix  String,
    organization_id String,
    instance_id     String,
    instance_name   String,
    model           String,        -- Important: model name (e.g. gpt-4o)
    prompt_tokens   UInt32        DEFAULT 0,
    completion_tokens UInt32      DEFAULT 0,
    total_tokens    UInt32        DEFAULT 0,
    cost            Float64       DEFAULT 0,   -- spent in dollars
    latency_ms      UInt32        DEFAULT 0,
    status_code     UInt16        DEFAULT 200,
    error_message   String        DEFAULT ''
) ENGINE = MergeTree()
ORDER BY (organization_id, created_at)
PARTITION BY toYYYYMM(created_at);
```

### B. MongoDB Daily Usage (`nitrochat_daily_usage`)
Used for fast rendering of the 7-day performance charts and per-key breakdown tables.
- **Key**: `(apiKeyId, organizationId, date)`
- **Updates**: Incremented on every request.

---

## 3. Gateway Implementation

The gateway must report usage after every invocation. This single API call handles credit deduction, ClickHouse logging, and daily aggregation.

### The Usage Reporting Call
**Endpoint**: `POST /api/v1/nitrochat-analytics/usage`

```typescript
// Example Gateway reporting logic
const usageReport = {
  apiKey: "nc_live_...",         // The full API key
  model: "gpt-4o",               // THE model used (crucial for analytics)
  promptTokens: 1250,
  completionTokens: 400,
  costCents: 2,                  // Cost of this specific request in cents
  latencyMs: 850,
  statusCode: 200,
  errorMessage: ""               // Optional
};

// This handles: 
// 1. Credit deduction in nitrochat_org_credits
// 2. Logging to ClickHouse nitrochat_usage_logs
// 3. Incrementing daily stats in nitrochat_daily_usage
await axios.post('https://nitrocloud.api/nitrochat-analytics/usage', usageReport);
```

---

## 4. Migration Steps

### Step 1: Deploy NitroCloud Backend
The new schema, service, and analytics endpoints are now live in the backend.

### Step 2: Backfill Existing Organizations
Initialize the $5 default for existing orgs via the admin endpoint:
```bash
curl -X POST https://your-api.com/api/v1/nitrochat-gateway/admin/backfill-credits \
  -H "Authorization: Bearer <admin-jwt-token>"
```

### Step 3: Run ClickHouse DDL
Ensure the `nitrochat_usage_logs` table exists in ClickHouse (see Section 2A).

### Step 4: Update Gateway Service
Update your gateway (NitroChat Gateway) to:
1.  **Check Credits**: `GET /api/v1/nitrochat-gateway/instances/:id/credits` before processing.
2.  **Report Usage**: `POST /api/v1/nitrochat-analytics/usage` after processing.

---

## 5. Summary of API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/nitrochat-gateway/instances/:id/credits` | Check if instace has credits available |
| `POST` | `/nitrochat-analytics/usage` | **Primary reporting endpoint** for gateway |
| `GET` | `/nitrochat-analytics/organizations/:id/overview` | Overall spending stats |
| `GET` | `/nitrochat-analytics/organizations/:id/daily` | Stats for the 7-day bar chart |
| `GET` | `/nitrochat-analytics/organizations/:id/keys` | Per-key usage breakdown |
| `GET` | `/nitrochat-analytics/keys/:keyId/requests` | Granular logs (ClickHouse) |

---

## Decision Log
- **Models**: We track the exact model name in ClickHouse to allow "Model Breakdown" in the future.
- **Tokens**: Prompt and completion tokens are tracked separately for precise billing logic.
- **Backward Compatibility**: Existing API keys will continue to work; their old credit fields are simply ignored by the new system.
- **Fail-Safe**: If ClickHouse is down, the system still records credits in MongoDB and returns success to the gateway.
