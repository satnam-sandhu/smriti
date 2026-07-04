# M9 — Stabilization, Cleanup & Regression

> **Status:** `VERIFIED`
> **Branch:** single implementation branch
> **Repos affected:** `nitrostack-gateway`, `nitrochat`
> **Estimated effort:** 1.5h
> **Risk level:** None — cleanup and verification only; no behavior changes

---

## Objective

Remove all temporary debug logging, finalize edge case handling, run the full regression suite, and declare the branch merge-ready. This milestone produces no functional changes — it is the quality gate before code review.

**Success criteria:** Zero debug logs in production code, all regression checks pass, Swagger docs updated, and both repos build cleanly.

---

## Scope

| File | Change |
|---|---|
| `internal/handlers/threads.go` | Remove `[threads]` debug logs; keep error logs |
| `internal/repository/threads_clickhouse.go` | Remove `[threads-repo]` debug logs |
| `internal/services/actor_resolver.go` | Remove `[actor-resolver]` debug logs |
| `lib/threads-api.ts` | Remove `[threads-api]` console.debug calls |
| `app/page.tsx` | Remove `[bootstrap]`, `[persist]`, `[reconnect]` console.* calls |
| `app/embed/page.tsx` | Remove `[embed-bootstrap]` console.debug calls |
| `internal/handlers/threads.go` | Add Swagger doc annotations to all 4 handlers |
| `internal/repository/clickhouse.go` | Verify `GetMessages` deduplication by `message_id` (handle duplicate rows from retries) |

---

## Dependencies

- All milestones M0–M8 VERIFIED

---

## Cleanup Tasks

### Gateway — Remove debug logs

```bash
# Find all temporary log lines to remove:
grep -rn '\[threads\]\|\[threads-repo\]\|\[actor-resolver\]' internal/ --include="*.go"
```

**Keep** (these are production-quality error logs):
```go
log.Printf("[threads] created ClickHouse table: %s", t.name)
log.Printf("[threads] Thread routes registered")
// Errors in handlers: log.Printf("[threads] ... failed: %v", err)
```

**Remove** (these are debug-only):
```go
log.Printf("[threads] ResolveActor actor_id=%s actor_type=%s", ...)
log.Printf("[threads] ResolveThread found existing thread_id=%s ...")
log.Printf("[threads] ResolveThread created thread_id=%s ...")
log.Printf("[threads] GetMessages thread_id=%s count=%d", ...)
log.Printf("[threads] PostMessage thread_id=%s message_id=%s role=%s", ...)
log.Printf("[threads-repo] FindActiveThreadByActor actor_id=%s", ...)
log.Printf("[threads-repo] InsertMessage thread_id=%s ...", ...)
log.Printf("[threads-repo] GetMessages thread_id=%s ...", ...)
log.Printf("[actor-resolver] resolved actor_id=%s ...", ...)
```

### Frontend — Remove debug logs

```bash
# Find all temporary console.* calls to remove:
grep -rn '\[threads-api\]\|\[bootstrap\]\|\[persist\]\|\[reconnect\]\|\[embed-bootstrap\]\|\[migration\]\|\[store\]' lib/ app/ --include="*.ts" --include="*.tsx"
```

Remove all matching `console.debug`, `console.group`, `console.groupEnd` calls.

Keep `console.error` and `console.warn` in error/catch paths — those are production-appropriate.

### Gateway — Add Swagger annotations

Add to each handler in `internal/handlers/threads.go`:

```go
// ResolveActor godoc
// @Summary      Resolve or generate an actor identity
// @Description  Returns an actor ID and type based on priority chain: authenticated > external > anonymous
// @Tags         nitrochat-threads
// @Accept       json
// @Produce      json
// @Param        request body models.ResolveActorRequest false "Actor resolution request"
// @Success      200 {object} models.ResolveActorResponse
// @Failure      500 {object} models.NitroChatErrorResponse
// @Security     ApiKeyAuth
// @Router       /v1/nitrochat/actor/resolve [post]
func (h *ThreadsHandler) ResolveActor(c *fiber.Ctx) error {
```

Repeat for `ResolveThread`, `GetMessages`, `PostMessage`.

Run `swag init` to regenerate `docs/swagger.yaml` and `docs/docs.go`.

### ClickHouse — message_id deduplication on read

If retry logic causes duplicate `message_id` rows in `nitrochat_thread_messages`, add deduplication to `GetMessages`:

```sql
-- Use ROW_NUMBER to deduplicate on message_id, keep first by created_at
SELECT thread_id, actor_id, message_id, role, content, created_at, metadata
FROM (
    SELECT *,
           ROW_NUMBER() OVER (PARTITION BY message_id ORDER BY created_at ASC) AS rn
    FROM nitrochat_thread_messages
    WHERE thread_id = ?
)
WHERE rn = 1
ORDER BY created_at ASC, message_id ASC
LIMIT ?
```

---

## Full Regression Checklist

### Backend thread flow

- [ ] `POST /actor/resolve` — anonymous (empty body)
- [ ] `POST /actor/resolve` — restore existing `anon_xxx`
- [ ] `POST /actor/resolve` — external `externalUserId=user123`
- [ ] `POST /actor/resolve` — external with special chars (sanitized)
- [ ] `POST /threads/resolve` — creates new thread
- [ ] `POST /threads/resolve` — same actorId 5x → same threadId
- [ ] `GET /threads/:id/messages` — empty thread → `{ "messages": [] }`
- [ ] `GET /threads/:id/messages` — 1 message
- [ ] `GET /threads/:id/messages` — 50 messages (limit default)
- [ ] `GET /threads/:id/messages` — pagination with `before=` param
- [ ] `POST /threads/:id/messages` — role: user
- [ ] `POST /threads/:id/messages` — role: assistant
- [ ] `POST /threads/:id/messages` — role: tool with metadata
- [ ] Missing `X-API-Key` → 401 on all 4 routes
- [ ] `THREADS_ENABLED=false` → 404 on all 4 routes
- [ ] `go test ./...` — all tests pass
- [ ] `go vet ./...` — no issues
- [ ] `go build ./...` — no errors

### Frontend state sync

- [ ] First load: messages render in chronological order
- [ ] Reload: messages restored, no duplicates in UI
- [ ] `isBootstrapping` state: input disabled → input enabled transitions correctly
- [ ] `isThreadBootstrapped=false` after fresh mount → bootstrap triggers
- [ ] `isThreadBootstrapped=true` → bootstrap does not re-run

### Persistence / storage

- [ ] localStorage contains only: `threadActorId`, `threadActorType`, `threadId` (+ existing non-thread fields)
- [ ] No `messagesByUrlPrompt` key in localStorage
- [ ] `isThreadBootstrapped` NOT in localStorage (session-only)
- [ ] ClickHouse row count matches messages sent
- [ ] Duplicate `messageId` rows deduplicated in `GetMessages`
- [ ] CH rows survive gateway restart (data durability)

### Retry / reconnect

- [ ] Gateway restart mid-bootstrap → retries succeed
- [ ] Network offline → error shown → network online → re-bootstraps
- [ ] Bootstrap timeout (>10s) → error shown, input enabled

### Embed mode

- [ ] `/embed` (no externalUserId) → anonymous actor, thread created
- [ ] `/embed?externalUserId=u123` → `ext_u123` actor, own thread
- [ ] `/embed?externalUserId=alice` and `/embed?externalUserId=bob` → separate threads
- [ ] `/embed?externalUserId=<xss>` → sanitized, no injection in actor ID

### Non-regression (existing behavior)

- [ ] Non-standalone mode (`standaloneMode` param absent): **zero** thread API calls made
- [ ] Regular chat without threads flag: identical behavior to pre-implementation
- [ ] MongoDB-backed chat history (if configured): unaffected
- [ ] MCP tool calls: work correctly, tool messages optionally persisted
- [ ] OAuth flow: unaffected
- [ ] Zitadel login flow: unaffected
- [ ] Voice mode: unaffected
- [ ] Embed mode without `THREADS_ENABLED`: unaffected
- [ ] Export chat: works (exports in-memory messages)
- [ ] Import chat: works (loads into in-memory store)
- [ ] `npm run lint` → no errors
- [ ] `npx tsc --noEmit` → no errors

---

## Performance Validation

```bash
# Gateway: measure bootstrap endpoint latency
time curl -s -X POST $GW/v1/nitrochat/actor/resolve \
  -H "X-API-Key: $API_KEY" -H "Content-Type: application/json" -d '{}'
# Expected: < 200ms on local ClickHouse

time curl -s -X POST $GW/v1/nitrochat/threads/resolve \
  -H "X-API-Key: $API_KEY" -H "Content-Type: application/json" \
  -d '{"actorId":"anon_xxx","actorType":"anonymous"}'
# Expected: < 300ms (includes FINAL query)

time curl -s $GW/v1/nitrochat/threads/$THREAD_ID/messages \
  -H "X-API-Key: $API_KEY"
# Expected: < 200ms for 50 messages

# Frontend: measure total bootstrap time (DevTools Performance tab)
# Expected: < 1500ms total (3 sequential requests)
```

---

## Final Commit Strategy

```bash
git add internal/handlers/threads.go internal/repository/threads_clickhouse.go internal/services/actor_resolver.go
git commit -m "chore(threads): remove debug logging, keep error logs (M9)"

git add docs/
git commit -m "docs(threads): add Swagger annotations to thread handlers (M9)"

git add lib/threads-api.ts app/page.tsx app/embed/page.tsx
git commit -m "chore(threads): remove frontend debug console calls (M9)"

git add internal/repository/threads_clickhouse.go
git commit -m "fix(threads/repo): deduplicate messages by message_id on GetMessages (M9)"
```

---

## Checkpoint Tags

```bash
# After full regression passes:
git tag checkpoint/m9-stable

# Final merge-ready tag:
git tag release/threads-mvp
```

---

## Rollout Verification (post-merge)

After the branch is merged and deployed:

```bash
# 1. Health check
curl https://<prod-gateway>/health | jq .

# 2. Verify thread routes are registered (when THREADS_ENABLED=true in prod)
curl -s https://<prod-gateway>/v1/nitrochat/actor/resolve \
  -H "X-API-Key: $PROD_API_KEY" -H "Content-Type: application/json" -d '{}' | jq .

# 3. Verify ClickHouse tables exist in prod
curl "https://<ch-host>:8443/?query=SHOW+TABLES" --user "$CH_USER:$CH_PASS" | grep nitrochat

# 4. Smoke test full flow
# (actor → thread → message → reload → verify restored)
```

---

## TODO Checklist

```
[ ] grep and remove all [threads] debug log lines in gateway
[ ] grep and remove all [threads-repo] debug log lines
[ ] grep and remove all [actor-resolver] debug log lines
[ ] grep and remove all [threads-api] console.debug in frontend
[ ] grep and remove all [bootstrap] console.* in page.tsx
[ ] grep and remove all [persist] console.* in page.tsx
[ ] grep and remove all [reconnect] console.* in page.tsx
[ ] grep and remove all [embed-bootstrap] console.debug in embed/page.tsx
[ ] grep and remove all [migration] console.debug in layout/page
[ ] Add Swagger annotations to ResolveActor handler
[ ] Add Swagger annotations to ResolveThread handler
[ ] Add Swagger annotations to GetMessages handler
[ ] Add Swagger annotations to PostMessage handler
[ ] Run swag init to regenerate docs
[ ] Add message_id deduplication to GetMessages query
[ ] go test ./... passes
[ ] go vet ./... passes
[ ] go build ./... passes
[ ] npx tsc --noEmit passes
[ ] npm run lint passes
[ ] All backend regression checks ✓
[ ] All frontend regression checks ✓
[ ] All non-regression checks ✓ (existing behavior unchanged)
[ ] Performance: bootstrap < 1500ms total
[ ] Tag checkpoint/m9-stable
[ ] Tag release/threads-mvp
```
