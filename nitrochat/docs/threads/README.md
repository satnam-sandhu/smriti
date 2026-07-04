# NitroChat Threads — Implementation Index

> **Branch policy:** All work happens inside a **single implementation branch**. No multi-branch workflows.
> **Engine:** ClickHouse-only persistence. No traditional database for thread data.

---

## Status Legend

| Label | Meaning |
|---|---|
| `NOT_STARTED` | Work has not begun |
| `IN_PROGRESS` | Actively being developed |
| `BLOCKED` | Waiting on a dependency or decision |
| `COMPLETED` | Implementation done, not yet verified |
| `VERIFIED` | Smoke tested and validation checklist passed |

---

## Milestone Index

| # | File | Title | Repo(s) | Status |
|---|---|---|---|---|
| M0 | [00-environment-and-config.md](./00-environment-and-config.md) | Environment & Feature Flag Foundation | gateway + frontend | `VERIFIED` |
| M1 | [01-clickhouse-schema-and-repository.md](./01-clickhouse-schema-and-repository.md) | ClickHouse Schema + Repository Layer | gateway | `VERIFIED` |
| M2 | [02-actor-resolution-service.md](./02-actor-resolution-service.md) | Actor Resolution Service | gateway | `VERIFIED` |
| M3 | [03-gateway-thread-handlers.md](./03-gateway-thread-handlers.md) | Gateway Thread HTTP Handlers | gateway | `VERIFIED` |
| M3b | [03b-resolve-thread-race-fix.md](./03b-resolve-thread-race-fix.md) | ResolveThread Concurrent Race Fix | gateway | `VERIFIED` |
| M4 | [04-frontend-api-client-and-store.md](./04-frontend-api-client-and-store.md) | Frontend API Client + Store Identity Slice | frontend | `VERIFIED` |
| M5 | [05-standalone-thread-bootstrap.md](./05-standalone-thread-bootstrap.md) | Standalone Mode Thread Bootstrap | frontend | `VERIFIED` |
| M5b | [05b-userid-param-standalone.md](./05b-userid-param-standalone.md) | `?userId=` Param for Cross-Device Thread Identity | frontend | `VERIFIED` |
| M6 | [06-message-persistence.md](./06-message-persistence.md) | Message Persistence During Chat | frontend | `VERIFIED` |
| M7 | [07-storage-cleanup-and-embed.md](./07-storage-cleanup-and-embed.md) | localStorage Cleanup + Embed ExternalUserId | frontend | `VERIFIED` |
| M8 | [08-recovery-and-resilience.md](./08-recovery-and-resilience.md) | Recovery, Retry & Reconnect Resilience | frontend | `VERIFIED` |
| M9 | [09-stabilization-and-regression.md](./09-stabilization-and-regression.md) | Stabilization, Cleanup & Regression | gateway + frontend | `VERIFIED` |

---

## Dependency Order

```mermaid
flowchart LR
    M0["M0\nEnv & Config"]
    M1["M1\nCH Schema"]
    M2["M2\nActor Resolver"]
    M3["M3\nGW Handlers"]
    M4["M4\nFE Client"]
    M5["M5\nBootstrap"]
    M6["M6\nPersistence"]
    M7["M7\nCleanup"]
    M8["M8\nRecovery"]
    M9["M9\nStabilization"]

    M0 --> M1
    M0 --> M4
    M1 --> M2
    M2 --> M3
    M3 --> M5
    M4 --> M5
    M5 --> M6
    M6 --> M7
    M6 --> M8
    M7 --> M9
    M8 --> M9
```

### Parallelizable tracks (after M0)

```
Gateway track:  M1 → M2 → M3   (pure Go — no frontend dependency)
Frontend track: M4              (pure TypeScript — client written but not yet invoked)
```

Both tracks converge at **M5**.

---

## Implementation Flow

```mermaid
flowchart TD
    subgraph setup [Setup Phase]
        M0["M0: Env + Feature Flags"]
    end

    subgraph gateway [Gateway Phase — nitrostack-gateway]
        M1["M1: ClickHouse Schema + Repo"]
        M2["M2: Actor Resolver Service"]
        M3["M3: HTTP Handlers + Route Wiring"]
    end

    subgraph frontend [Frontend Phase — nitrochat]
        M4["M4: API Client + Store Slice"]
        M5["M5: Standalone Bootstrap"]
        M6["M6: Message Persistence"]
        M7["M7: Storage Cleanup + Embed"]
        M8["M8: Recovery + Resilience"]
    end

    subgraph final [Stabilization Phase]
        M9["M9: Regression + Cleanup"]
    end

    setup --> gateway
    setup --> M4
    gateway --> M5
    M4 --> M5
    M5 --> M6
    M6 --> M7
    M6 --> M8
    M7 --> final
    M8 --> final
```

---

## End-to-End Thread Lifecycle

```mermaid
sequenceDiagram
    participant FE as NitroChat Frontend
    participant GW as NitroStack Gateway
    participant CH as ClickHouse

    FE->>FE: Mount (?standaloneMode=true)
    FE->>FE: Read actorId, threadId from localStorage

    FE->>GW: POST /v1/nitrochat/actor/resolve
    GW-->>FE: { actorId, actorType }
    FE->>FE: Persist actorId to localStorage

    FE->>GW: POST /v1/nitrochat/threads/resolve
    GW->>CH: SELECT FINAL active thread for actor
    alt No active thread exists
        GW->>CH: INSERT new thread row
    end
    GW-->>FE: { threadId, actorId, actorType }
    FE->>FE: Persist threadId to localStorage

    FE->>GW: GET /v1/nitrochat/threads/:id/messages
    GW->>CH: SELECT messages ORDER BY created_at
    GW-->>FE: { messages[] }
    FE->>FE: Hydrate Zustand (memory only), isBootstrapped=true

    Note over FE,CH: Chat turn
    FE->>GW: POST /threads/:id/messages { role: user }
    FE->>GW: POST /api/chat (streaming)
    GW-->>FE: SSE stream
    FE->>GW: POST /threads/:id/messages { role: assistant }
```

---

## System Architecture

```mermaid
flowchart TD
    subgraph fe [NitroChat — Next.js]
        LS["localStorage\n{ actorId, threadId }"]
        ZS["Zustand in-memory\n{ messages[] }"]
        API["lib/threads-api.ts"]
        SP["app/page.tsx\n(?standaloneMode=true)"]
        EP["app/embed/page.tsx\n(?externalUserId=xxx)"]
    end

    subgraph gw [NitroStack Gateway — Go/Fiber]
        AR["POST /actor/resolve"]
        TR["POST /threads/resolve"]
        GM["GET /threads/:id/messages"]
        PM["POST /threads/:id/messages"]
        Svc["services/actor_resolver.go"]
        Repo["repository/threads_clickhouse.go"]
    end

    subgraph ch [ClickHouse]
        T["nitrochat_threads\nReplacingMergeTree"]
        TM["nitrochat_thread_messages\nMergeTree"]
    end

    SP --> API
    EP --> API
    API --> AR & TR & GM & PM
    AR --> Svc
    TR & GM & PM --> Repo
    Repo --> T & TM
    LS --> SP
    ZS --> SP
```

---

## Actor Model

```mermaid
flowchart LR
    Input["Incoming Request"]
    A1{"JWT sub\nclaim present?"}
    A2{"externalUserId\npresent?"}
    A3{"actorId\nanon_ prefix valid?"}
    A4["Generate\nanon_uuid"]

    Auth["actor_type: authenticated\nactor_id: auth_userId"]
    Ext["actor_type: external\nactor_id: ext_sanitizedId"]
    AnonRestore["actor_type: anonymous\nactor_id: anon_existingUuid"]
    AnonNew["actor_type: anonymous\nactor_id: anon_newUuid"]

    Input --> A1
    A1 -->|Yes| Auth
    A1 -->|No| A2
    A2 -->|Yes| Ext
    A2 -->|No| A3
    A3 -->|Valid| AnonRestore
    A3 -->|Invalid| A4
    A4 --> AnonNew
```

---

## Testing Flow

### Backend (nitrostack-gateway)
1. Unit test `actor_resolver.go` in isolation (M2)
2. `curl` smoke tests against running gateway (M3)
3. ClickHouse row verification after each operation (M3)
4. Idempotency tests: call `/threads/resolve` 5x → same threadId (M3)
5. Concurrent actor resolution test (M8)

### Frontend (nitrochat)
1. TypeScript compile check after each store change (M4)
2. Manual browser test: localStorage inspection (M5)
3. Network tab verification: 3 bootstrap requests fire in order (M5)
4. Hard refresh: messages restored from backend (M6)
5. Offline/online reconnect simulation (M8)
6. Embed mode with/without `externalUserId` (M7)

### Integration
1. Full end-to-end: send message → reload → verify restored (M6)
2. Embed flow: `/embed?externalUserId=u123` → own thread (M7)
3. Regression: all existing chat features work with `THREADS_ENABLED=false` (M9)

---

## Rollback Strategy Overview

Every milestone uses additive patterns before destructive ones:

| Milestone | Rollback Method | Data Impact |
|---|---|---|
| M0 | Remove env vars | None |
| M1 | `DROP TABLE` 2 tables; revert `initSchema` | None (tables empty) |
| M2 | Delete `actor_resolver.go` | None (no routes wired) |
| M3 | Set `THREADS_ENABLED=false` | None (routes not registered) |
| M4 | Delete `threads-api.ts`; revert 4 store fields | None (not called yet) |
| M5 | Set `NEXT_PUBLIC_THREADS_ENABLED=false` | None (existing chat unaffected) |
| M6 | Remove 2 `postThreadMessage` calls | Rows stay in CH (harmless) |
| M7 | Revert `store.ts` LRU removal | Users see backend-restored history |
| M8 | Remove retry wrappers | Less resilient, still functional |
| M9 | N/A — cleanup only | None |

---

## Checkpoint Tags

| Milestone | Tag |
|---|---|
| M0 | `checkpoint/m0-env-ready` |
| M1 | `checkpoint/m1-schema-ready` |
| M2 | `checkpoint/m2-actor-resolver` |
| M3 | `checkpoint/m3-gateway-routes` |
| M4 | `checkpoint/m4-fe-client` |
| M5 | `checkpoint/m5-standalone-bootstrap` |
| M6 | `checkpoint/m6-message-persist` |
| M7 | `checkpoint/m7-storage-cleanup` |
| M8 | `checkpoint/m8-recovery` |
| M9 | `checkpoint/m9-stable` |
| Final | `release/threads-mvp` |

---

## Current Status Tracking

> Update this section as milestones progress.

```
M0  Environment & Config         [x] VERIFIED
M1  ClickHouse Schema + Repo     [x] VERIFIED
M2  Actor Resolution Service     [x] VERIFIED
M3  Gateway Thread Handlers      [x] VERIFIED
M3b ResolveThread Race Fix       [x] VERIFIED
M4  Frontend Client + Store      [x] VERIFIED
M5  Standalone Bootstrap         [x] VERIFIED
M5b ?userId= Param               [x] VERIFIED
M6  Message Persistence          [x] VERIFIED
M7  Storage Cleanup + Embed      [x] VERIFIED
M8  Recovery & Resilience        [x] VERIFIED
M9  Stabilization & Regression   [x] VERIFIED
```

---

## Folder Structure

```
nitrochat/docs/threads/
├── README.md                               ← this file (master index)
├── standards.md                            ← documentation standards + naming conventions
├── 00-environment-and-config.md
├── 01-clickhouse-schema-and-repository.md
├── 02-actor-resolution-service.md
├── 03-gateway-thread-handlers.md
├── 04-frontend-api-client-and-store.md
├── 05-standalone-thread-bootstrap.md
├── 06-message-persistence.md
├── 07-storage-cleanup-and-embed.md
├── 08-recovery-and-resilience.md
└── 09-stabilization-and-regression.md
```

---

*See [standards.md](./standards.md) for documentation conventions, status labels, and guidance on adding future milestones.*
