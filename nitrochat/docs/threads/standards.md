# Documentation Standards — NitroChat Threads

> This file governs how milestone documents in this directory are written, named, and maintained.
> Follow these standards when adding future milestones or updating existing ones.

---

## Status Labels

Use exactly these labels in the `Status` line at the top of each milestone file.

| Label | When to use |
|---|---|
| `NOT_STARTED` | Work has not begun |
| `IN_PROGRESS` | Actively being developed |
| `BLOCKED` | Cannot proceed — document the blocker in the file |
| `COMPLETED` | Implementation done, validation checklist not yet signed off |
| `VERIFIED` | All checklist items ticked, smoke tests passed |

Update the status line whenever the state changes:

```markdown
> **Status:** `IN_PROGRESS`
```

---

## Naming Convention

Files follow this pattern:

```
NN-kebab-case-title.md
```

- `NN` — zero-padded two-digit sequence number (00, 01, 02, ..., 09, 10, ...)
- Title in kebab-case: short, descriptive, verb-first when possible
- Always use the `.md` extension

### Examples

```
00-environment-and-config.md
01-clickhouse-schema-and-repository.md
02-actor-resolution-service.md
03-gateway-thread-handlers.md
04-frontend-api-client-and-store.md
05-standalone-thread-bootstrap.md
06-message-persistence.md
07-storage-cleanup-and-embed.md
08-recovery-and-resilience.md
09-stabilization-and-regression.md
```

### Inserting milestones between existing ones

If a milestone needs to be inserted between 05 and 06, use `05a-description.md`. Update `README.md` to reflect the new order.

---

## Milestone File Structure

Every milestone file must contain all of these sections in this order:

```markdown
# MN — Title

> **Status:** `NOT_STARTED`
> **Branch:** single implementation branch
> **Repos affected:** list repos
> **Estimated effort:** Xh
> **Risk level:** None / Low / Medium / High

---

## Objective
## Scope
## Dependencies
## Impacted Areas
## Environment Changes
## [Diagrams where applicable]
## Step-by-Step Implementation Tasks
## Validation Checklist
## Smoke Tests
## Edge Cases
## Temporary Debugging Instructions
## Rollback Strategy
## Known Risks
## Safe Incremental Rollout Notes
## Suggested Commit Checkpoints
## TODO Checklist
```

All sections are required. If a section has nothing to say, write `None.` — do not omit it.

---

## Diagram Standards

Use Mermaid for all diagrams. Refer to the main `README.md` for syntax rules.

### When to include diagrams

| Situation | Diagram type |
|---|---|
| Data flows between services | `flowchart TD` |
| Timing / request sequences | `sequenceDiagram` |
| State transitions | `stateDiagram-v2` |
| Dependency relationships | `flowchart LR` |
| Timeline of operations | `timeline` |

### Diagram rules

- Node IDs must not contain spaces — use camelCase or underscores
- Edge labels with parentheses must be quoted: `-->|"O(n) scan"| B`
- Do not use `style`, `classDef`, or `click` — they break in dark mode
- Keep diagrams focused — one diagram per concept, not one mega-diagram

---

## Code Snippets

- Use the correct language tag: ` ```go `, ` ```typescript `, ` ```sql `, ` ```bash `
- Show realistic, complete code — not pseudocode unless clearly labeled `// pseudocode`
- Do not include line numbers
- Snippets in milestone files are **reference implementations** — the actual code may differ slightly

---

## Checklist Format

All TODO checklists use unchecked markdown checkboxes:

```markdown
## TODO Checklist

```
[ ] Task one
[ ] Task two
[ ] Task three — add ✓ marker when verified
```
```

When a task is done, mark it:

```
[x] Task one
[ ] Task two
[x] Task three ✓
```

Do not use `- [x]` (GitHub-flavored) — use the plain `[x]` text format for compatibility.

---

## Temporary Debug Instructions

Every milestone that introduces new code must include a "Temporary Debugging Instructions" section. Format:

```markdown
## Temporary Debugging Instructions

```go
// Add temporarily to HandlerName:
log.Printf("[scope] key=%s value=%v", key, value)

// Remove [scope] debug logs in M9.
```
```

Naming convention for debug log prefixes:

| Scope | Prefix |
|---|---|
| Thread handlers | `[threads]` |
| Repository methods | `[threads-repo]` |
| Actor resolver | `[actor-resolver]` |
| Frontend API client | `[threads-api]` |
| Bootstrap lifecycle | `[bootstrap]` |
| Message persistence | `[persist]` |
| Reconnect handler | `[reconnect]` |
| Embed bootstrap | `[embed-bootstrap]` |

All `[scope]`-prefixed debug logs must be removed in M9. Production code keeps only error-level logs in catch blocks.

---

## Rollback Documentation Standard

Every milestone must have a Rollback Strategy section with:

1. **Step-by-step instructions** to undo the milestone
2. **Data impact** — does rollback lose any user data?
3. **Which commits to revert** (if applicable)

Rollbacks should be achievable without dropping the entire branch. Prefer additive strategies over destructive ones.

---

## Safe Incremental Rollout Notes Standard

Every milestone must include a "Safe Incremental Rollout Notes" section explaining:

- Why this milestone is safe to merge with feature flag off
- What happens if this code is deployed to staging before completion
- Whether prior milestone must be VERIFIED before this one starts

---

## Commit Message Convention

```
<type>(threads/<scope>): <description> (M<N>)
```

Types: `feat`, `fix`, `refactor`, `chore`, `test`, `docs`

Scopes: `schema`, `repo`, `actor`, `handler`, `wire`, `api-client`, `store`, `bootstrap`, `persist`, `embed`, `clean`, `resilience`

Examples:
```
feat(threads/schema): extend initSchema with thread tables (M1)
feat(threads/handler): implement ThreadsHandler with 4 endpoints (M3)
refactor(threads/store): remove messagesByUrlPrompt localStorage persistence (M7)
chore(threads): remove debug logging, keep error logs (M9)
```

---

## Checkpoint Tag Convention

```
checkpoint/m<N>-<slug>
```

Examples:
```
checkpoint/m0-env-ready
checkpoint/m1-schema-ready
checkpoint/m2-actor-resolver
checkpoint/m3-gateway-routes
checkpoint/m4-fe-client
checkpoint/m5-standalone-bootstrap
checkpoint/m6-message-persist
checkpoint/m7-storage-cleanup
checkpoint/m8-recovery
checkpoint/m9-stable
release/threads-mvp
```

Tags are annotated (not lightweight) so they carry a message:

```bash
git tag -a checkpoint/m1-schema-ready -m "M1 validated: both CH tables created, smoke tests passed"
```

---

## README.md Update Protocol

After completing a milestone:

1. Update the `Status` column in `README.md > Milestone Index`
2. Update the `Current Status Tracking` section at the bottom
3. Commit the README update in the same commit as the checkpoint tag

---

## Adding Future Milestones

When adding a new milestone beyond M9:

1. Create a new file: `10-milestone-title.md`
2. Use this template header:

```markdown
# M10 — Title

> **Status:** `NOT_STARTED`
> **Branch:** single implementation branch
> **Repos affected:** TBD
> **Estimated effort:** Xh
> **Risk level:** Low

---

## Objective

[One paragraph describing what this milestone achieves and its success criteria.]
```

3. Update `README.md`:
   - Add row to Milestone Index table
   - Update dependency diagram
   - Update Current Status Tracking section

4. Update the plan file at `.cursor/plans/nitrochat_threads_mvp_*.plan.md` if the milestone changes the original scope.

---

## Folder Structure Reference

```
nitrochat/docs/threads/
├── README.md                                ← master index + status tracking
├── standards.md                             ← this file
├── 00-environment-and-config.md             M0
├── 01-clickhouse-schema-and-repository.md   M1
├── 02-actor-resolution-service.md           M2
├── 03-gateway-thread-handlers.md            M3
├── 04-frontend-api-client-and-store.md      M4
├── 05-standalone-thread-bootstrap.md        M5
├── 06-message-persistence.md               M6
├── 07-storage-cleanup-and-embed.md          M7
├── 08-recovery-and-resilience.md            M8
└── 09-stabilization-and-regression.md       M9
```

> Keep this folder flat. Do not create subdirectories for milestones.
