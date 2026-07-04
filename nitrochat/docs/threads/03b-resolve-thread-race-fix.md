# M3b — ResolveThread Concurrent Race Condition Fix

> **Status:** `VERIFIED`
> **Branch:** single implementation branch
> **Repos affected:** `nitrostack-gateway`
> **Estimated effort:** 0.5h
> **Risk level:** Low — additive hardening inside a single function; zero schema changes; zero API surface changes

---

## Context

This is a patch to M3 (`03-gateway-thread-handlers.md`). After M3 was verified, a race condition was identified in the `ResolveThread` handler when 5 concurrent requests arrive for the same `actorId`.

The M3 doc incorrectly stated that `ReplacingMergeTree + FINAL` would handle concurrent creates (lines 414, 453 of `03-gateway-thread-handlers.md`). That assumption is **wrong** — see below.

---

## Root Cause

The `ResolveThread` handler performs a classic **check-then-act** sequence without coordination:

```
1. FindActiveThreadByActor(actorId) → nil   (all 5 concurrent callers read nil simultaneously)
2. Generate thread_id = "thr_" + uuid.NewString()  ← different UUID per goroutine
3. UpsertThread(thread)                           ← 5 different (actor_id, thread_id) pairs
```

**Why ReplacingMergeTree did NOT help:**
ClickHouse `ReplacingMergeTree` deduplicates rows based on the `ORDER BY` key, which is `(actor_id, thread_id)`. Because each goroutine generated a **different** `thread_id`, ClickHouse saw 5 completely distinct sort-key values and kept all 5 rows — all with `status = 'active'`. The FINAL modifier only deduplicates rows with **identical** sort keys.

```
actor_id    | thread_id                                    | status
anon_abc... | thr_11111111-...  ← goroutine 1 UUID        | active
anon_abc... | thr_22222222-...  ← goroutine 2 UUID        | active
anon_abc... | thr_33333333-...  ← goroutine 3 UUID        | active
anon_abc... | thr_44444444-...  ← goroutine 4 UUID        | active
anon_abc... | thr_55555555-...  ← goroutine 5 UUID        | active
```

`FindActiveThreadByActor` returns `LIMIT 1 ORDER BY created_at DESC` so subsequent reads are consistent, but 4 orphan active-thread rows accumulate in ClickHouse indefinitely.

---

## Fix — Deterministic thread ID

Replace `uuid.NewString()` with a UUID v5 (SHA-1) derived from the `actorId`:

```go
// Fixed namespace — must never change after deployment.
var nitroChatThreadNS = uuid.MustParse("e9b9f8c0-5a4d-4b1e-8a2c-1d3f5e7a9b0c")

func deterministicThreadID(actorID string) string {
    return "thr_" + uuid.NewSHA1(nitroChatThreadNS, []byte(actorID)).String()
}
```

All concurrent requests for the same `actorId` now produce **the same thread ID**. ClickHouse `ReplacingMergeTree ORDER BY (actor_id, thread_id)` deduplicates identical `(actor_id, thread_id)` pairs — exactly as intended. This works correctly across multiple gateway instances with no schema change and no new dependencies.

The worst case under high concurrency is N redundant `UpsertThread` writes, all inserting the same row — ClickHouse discards duplicates silently. For the current MVP load, this is entirely acceptable.

---

## Fix Flow (after patch)

```
5 concurrent requests for actorX arrive:

All 5 call FindActiveThreadByActor(actorX) → nil
All 5 call deterministicThreadID(actorX)  → "thr_<sha1_of_actorX>"  (identical for all)
All 5 call UpsertThread("thr_<sha1_of_actorX>")

ClickHouse: 5 inserts with the same (actor_id, thread_id) sort key.
ReplacingMergeTree deduplicates → 1 row retained.
All 5 callers return the same threadId. ✓
```

---

## Files Changed

| File | Change |
|---|---|
| `internal/handlers/threads.go` | Add `nitroChatThreadNS` + `deterministicThreadID`; replace `uuid.NewString()` with `deterministicThreadID(req.ActorID)` in `ResolveThread` |

No schema changes. No API surface changes. No frontend changes. **No `go.mod` or `go.sum` changes** — no new dependencies.

---

## Important: Existing Threads After This Fix

Existing threads created before this patch have **random UUIDs** as their `thread_id`. They continue to work correctly:

- `FindActiveThreadByActor` returns the existing thread → `sfGroup.Do` returns it immediately without creating a new one
- The deterministic ID logic only runs when no active thread exists
- Old random-UUID threads are unaffected

---

## Important: Future "New Thread" Scenarios

The deterministic ID encodes only `actorId`. This means:
- While an actor has **one active thread**, the ID is always the same — correct MVP behavior
- If we implement thread archiving (close active → create new), the new thread ID must incorporate a discriminator (e.g., a generation counter or start timestamp) to differ from the closed thread's ID
- This is a future concern — the current MVP has no thread close/reopen flow

---

## Validation

```bash
# 1. Concurrent smoke test — all 5 threadIds must be identical
for i in {1..5}; do
  curl -s -X POST http://localhost:8080/v1/nitrochat/threads/resolve \
    -H "X-API-Key: $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"actorId":"anon_f47ac10b-58cc-4372-a567-0e02b2c3d479","actorType":"anonymous"}' | jq -r .threadId &
done
wait
# All 5 lines must be identical

# 2. ClickHouse verification — must be exactly 1 active row for the actor
curl -s "http://127.0.0.1:8123/?user=default&password=password&query=SELECT+count()+FROM+nitrochat_threads+FINAL+WHERE+actor_id%3D%27anon_f47ac10b-58cc-4372-a567-0e02b2c3d479%27+AND+status%3D%27active%27"
# Expected: 1

# 3. Determinism check — same actorId always produces the same threadId
ACTOR="anon_f47ac10b-58cc-4372-a567-0e02b2c3d479"
T1=$(curl -s -X POST http://localhost:8080/v1/nitrochat/threads/resolve \
  -H "X-API-Key: $API_KEY" -H "Content-Type: application/json" \
  -d "{\"actorId\":\"$ACTOR\",\"actorType\":\"anonymous\"}" | jq -r .threadId)
T2=$(curl -s -X POST http://localhost:8080/v1/nitrochat/threads/resolve \
  -H "X-API-Key: $API_KEY" -H "Content-Type: application/json" \
  -d "{\"actorId\":\"$ACTOR\",\"actorType\":\"anonymous\"}" | jq -r .threadId)
[ "$T1" = "$T2" ] && echo "PASS: deterministic" || echo "FAIL: different IDs"
```

---

## Rollback

Revert `internal/handlers/threads.go` to the M3 version (restore `uuid.NewString()`, remove `singleflight`). The race condition returns, but all existing functionality is unaffected. ClickHouse data is unchanged.

---

## Dependencies

None. The fix uses only `github.com/google/uuid` (already a direct dependency) for UUID v5 generation. No new packages, no `go.mod` changes.
