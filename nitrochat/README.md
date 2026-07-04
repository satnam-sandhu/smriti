# NitroChat

**NitroChat** is a **Next.js 14** web application that provides a production-ready chat UI for **Model Context Protocol (MCP)** servers. Conversations are completed through the **NitroChat Gateway** (OpenAI-compatible API with usage tracking), not by calling provider APIs directly from the browser..

Use it as the full app (`/`), as an **embeddable widget** (`/embed`), or to **preview embed behavior** (`/try-embed`).

---

## Table of contents

- [Architecture overview](#architecture-overview)
- [Data model](#data-model)
- [Request flows](#request-flows)
- [Project structure](#project-structure)
- [Core modules](#core-modules)
- [Configuration](#configuration)
- [Environment variables](#environment-variables)
- [Local development](#local-development)
- [API surface](#api-surface)
- [Security & headers](#security--headers)
- [Release automation](#release-automation)

---

## Architecture overview

At a high level, the browser loads the NitroChat UI, discovers MCP tools/prompts/resources, and sends chat turns to NitroChat’s own API. The API forwards those turns to the **NitroChat Gateway** with tools and optional streaming. Optional **MongoDB** backs **signed-in users** and **chat history** when OAuth and database env vars are set.

*Diagrams in this README use plain text and tables so they show up in any Markdown preview (including Cursor/VS Code). GitHub also renders Mermaid if you prefer that format.*

### System diagram (text)

```
                         ┌─────────────────────────────────────────┐
                         │            External services             │
                         │  ┌─────────────┐    ┌────────────────┐  │
                         │  │ NitroChat   │    │ MCP HTTP server │  │
                         │  │ Gateway     │    │ /mcp/sse,       │  │
                         │  │ /v1/nitro…  │    │ /mcp/message    │  │
                         │  └──────▲──────┘    └────────▲────────┘  │
                         │         │                     │           │
                         │  ┌──────┴──────┐              │  (optional
                         │  │ MongoDB     │              │   same-origin
                         │  │ (optional)  │              │   /api/mcp/*)
                         │  └──────▲──────┘              │           │
                         └─────────┼─────────────────────┼──────────┘
                                   │                     │
┌──────────────────────────────────┼─────────────────────┼──────────────────────┐
│ NitroChat Next.js server          │                     │                       │
│  GET /api/config                  │                     │                       │
│  POST /api/chat ──────────────────┘                     │                       │
│  GET /api/gateway/models                                │                       │
│  /api/chats[*] ─────────► MongoDB (when persistence on) │                       │
│  /api/mcp/sse , /api/mcp/message ───────────────────────┘                       │
└──────────────────────────────────▲────────────────────────────────────────────────┘
                                   │
┌──────────────────────────────────┴────────────────────────────────────────────────┐
│ Browser: / , /embed , /try-embed  ·  Zustand  ·  MCP SDK client (SSE)             │
└───────────────────────────────────────────────────────────────────────────────────┘

OAuth IdP ◄──── web sign-in ────► user  ·  /api/chats uses Bearer JWT from that flow
```

**Design highlights**

| Concern | Implementation |
|--------|----------------|
| **LLM chat** | Server route `POST /api/chat` → gateway `…/v1/nitrochat/chat/completions` with `X-API-Key` |
| **Models list** | `GET /api/gateway/models` → gateway `…/v1/nitrochat/models/available` |
| **MCP** | `@modelcontextprotocol/sdk` `Client` + `SSEClientTransport`; optional same-origin proxy under `/api/mcp/*` |
| **Runtime branding** | `GET /api/config` merges `RUNTIME_CONFIG_PATH` (or `config/runtime-config.json`) with **server** env |
| **Persistence** | Mongoose models `User`, `Chat`; APIs require `Authorization: Bearer <JWT>` |
| **OAuth** | PKCE in browser; token exchange and refresh on server routes under `app/api/auth/*` |

---

## Data model

Persistence is **optional**. If `MONGODB_URI` and `MONGODB_DB_NAME` are unset, chat APIs are effectively unused for production persistence (the config API will report `persistence.enabled: false`).

### Data relationships (ER-style)

Collections: **`users`**, **`chats`**. Each chat embeds **`messages[]`** (not a separate collection).

```
┌────────────────────────────────┐                 ┌────────────────────────────────┐
│ users (User)                   │                 │ chats (Chat)                   │
├────────────────────────────────┤                 ├────────────────────────────────┤
│ _id          ObjectId  PK      │                 │ _id          ObjectId  PK      │
│ email        string    unique  │◄──── 1 : N ────│ userId       ObjectId  FK ─────►│
│ name         string?           │      owns       │ title        string            │
│ picture      string?           │                 │ messages[]   embedded array    │
│ lastLogin    date              │                 │ provider     string (gateway)  │
│ createdAt    date              │                 │ createdAt    date              │
└────────────────────────────────┘                 │ updatedAt    date              │
                                                   └────────────────────────────────┘
```

**`users`**

| Field | Type | Notes |
|-------|------|--------|
| `email` | string | Required, unique |
| `name` | string | Optional |
| `picture` | string | Optional |
| `lastLogin` | date | Updated on sign-in |
| `createdAt` | date | |

**`chats`**

| Field | Type | Notes |
|-------|------|--------|
| `userId` | ObjectId | References `User` |
| `title` | string | e.g. LLM-generated |
| `messages` | array | Embedded subdocuments (see below) |
| `provider` | string | Default `gateway` |
| `createdAt` / `updatedAt` | date | `updatedAt` via pre-save hook |

**Embedded `messages[]` fields (per subdocument)**  
`id`, `role`, `content`, `timestamp`, optional `toolCalls`, `toolCallId`, `toolName`, `result` (see `models/Chat.ts`).

**Notes**

- **`User`**: Upserted from JWT claims (`email`, `name`, `picture`) when APIs authenticate the bearer token.
- **`Chat`**: `updatedAt` is refreshed on save via a Mongoose `pre('save')` hook.

---

## Request flows

### Chat completion (non-streaming and streaming)

| Step | Who | What |
|------|-----|------|
| 1 | Browser | `POST /api/chat` with JSON: `messages`, MCP tool/prompt/resource lists, optional `model`, optional `stream` |
| 2 | `app/api/chat/route.ts` | Rate limit → build system prompt (+ synthetic tools for prompts/resources) |
| 3 | Server → Gateway | `POST …/v1/nitrochat/chat/completions` with `X-API-Key` |
| 4a | If `stream: true` | Gateway returns `text/event-stream` → server forwards SSE to browser |
| 4b | If `stream: false` | Gateway returns JSON (`choices`, `tool_calls`, …) → server returns JSON to browser |

```
Browser ──POST /api/chat──► NitroChat API ──POST /v1/nitrochat/chat/completions──► Gateway
                ▲                                                                              │
                └──────────────── SSE or JSON body ◄────────────────────────────────────────┘
```

Tool execution loops (MCP `tools/call`) happen in the client via `lib/mcp-client.ts` and are fed back into the next `POST /api/chat` round.

### OAuth (PKCE) — simplified

1. User opens app or `/embed`; **`GET /api/config`** includes `mcp.oauth` when **`OAUTH_CLIENT_ID`** is set.
2. **`POST /api/auth/login`** returns authorization URL + `state` + `codeVerifier` (client stores PKCE material).
3. User signs in at the **IdP**.
4. **`GET /api/auth/callback?code=…&state=…`** redirects back into the app with `auth_code` / `auth_state` query params.
5. **`POST /api/auth/token`** exchanges `code` + `codeVerifier` for tokens (server uses client secret).
6. Tokens live in **localStorage**; optional **User** upsert in MongoDB on exchange.
7. **`/api/chats`** calls use `Authorization: Bearer` plus the access token value.

```
Config ─► Login ─► IdP ─► Callback ─► Token ─► storage ─► Bearer on /api/chats
```

### Runtime configuration load

```
RUNTIME_CONFIG_PATH  ──┐
(or config/runtime-config.json)
                       ├──►  GET /api/config  ──► merged JSON + CORS for clients
Server env (MONGODB_*, OAUTH_*, NITROCHAT_*, …)  ──┘
```

---

## Project structure

```
nitrochat/
├── app/
│   ├── layout.tsx              # Theme CSS variables, fonts, toaster
│   ├── page.tsx                # Main chat application
│   ├── embed/page.tsx          # Embeddable chat + sidebar
│   ├── try-embed/page.tsx      # Embed preview / tooling
│   ├── oauth/callback/page.tsx # Client-side OAuth helper route
│   └── api/
│       ├── config/route.ts          # Runtime merged config (dynamic, no cache)
│       ├── chat/route.ts            # Gateway-backed completions + stream passthrough
│       ├── gateway/models/route.ts  # Proxy model list from gateway
│       ├── chats/                   # List / create / delete-all (auth)
│       ├── chats/[id]/              # Get / update / delete one chat (auth)
│       ├── auth/                    # login, callback redirect, token, refresh
│       └── mcp/sse, mcp/message     # Optional MCP SSE/message proxy
├── components/              # UI: chat, navbar, embed, modals, markdown, voice, …
├── config/
│   └── runtime-config.json  # Default runtime JSON (overridden in deploy via ConfigMap)
├── lib/
│   ├── store.ts             # Zustand + persistence slices for chat/MCP/OAuth/voice
│   ├── mcp-client.ts        # MCP SDK wrapper, SSE connection helpers
│   ├── oauth.ts             # PKCE + token storage helpers
│   ├── auth-server.ts       # JWT decode → User lookup/create
│   ├── db.ts                # Mongoose singleton connection
│   ├── gateway-env.ts       # NITROCHAT_GATEWAY_* accessors
│   ├── chat-stream-sse.ts   # Parse OpenAI-style SSE streams
│   ├── chat-api-payload.ts  # Build POST /api/chat bodies
│   ├── generate-chat-title.ts # Title generation via gateway (no tools)
│   ├── theme-runtime.ts     # Theme resolution for embed / runtime
│   └── utils.ts, context-utils.ts, voice-utils.ts, …
├── models/
│   ├── User.ts
│   └── Chat.ts
├── templates/               # Layout templates (sidebar, centered, …) referenced by UI
├── nitrochat.config.ts      # Typed defaults + getConfig() env merges (build-time friendly)
├── middleware.ts            # CORS for /api/*
├── next.config.mjs          # Security headers; CSP frame-ancestors * on /embed
└── tailwind.config.ts
```

---

## Core modules

| Area | File(s) | Role |
|------|-----------|------|
| **App config** | `nitrochat.config.ts` | `NitroChatConfig` type, `defaultConfig`, `getConfig()` reading `NEXT_PUBLIC_*` and related env |
| **Live config** | `app/api/config/route.ts` | Single source for client: file + env merges (gateway diagnostic, persistence, OAuth, focus mode, etc.) |
| **Chat backend** | `app/api/chat/route.ts` | Rate limit; system prompt; synthetic tools for prompts/resources; gateway request; optional `:nitro` model suffix |
| **MCP** | `lib/mcp-client.ts` | Connect, list tools, call tools, prompts, resources; widget/helpers |
| **State** | `lib/store.ts` | Messages, MCP catalog, OAuth fields, voice settings, import/export |
| **Auth** | `lib/auth-server.ts`, `app/api/auth/*` | Bearer JWT from OAuth; token exchange with PKCE verifier |
| **DB** | `lib/db.ts`, `models/*` | Cached mongoose connect; User/Chat CRUD via chats routes |

---

## Configuration

### Runtime JSON

The server reads **`RUNTIME_CONFIG_PATH`** if set; otherwise **`config/runtime-config.json`** (relative to the process cwd) for branding, theme (`theme_version_2`), MCP URL, chat copy, feature flags, optional `systemPrompt`, and `standaloneMode` (embed chrome).

#### `theme_version_2`

The legacy `theme` key is ignored at runtime. The app reads **`theme_version_2`** only. Colors resolve per **active surface** (light vs dark): the matching `light` / `dark` branch wins, then the opposite branch, then optional **legacy** root `brand_color` / `advanced_customization` (handy for one-line env deploys).

```json
"theme_version_2": {
  "mode": "system_default",
  "logo_url_light": "https://example.com/logo-dark-ink.png",
  "logo_url_dark": "https://example.com/logo-light-ink.png",
  "light": {
    "brand_color": "#1E88E5",
    "advanced_customization": {
      "header": { "header_background_color": "#...", "header_text_color": "#...", "header_subtext_color": "#..." },
      "chat_area": { "chat_area_background_color": "#..." },
      "input_area": {
        "input_area_background_color": "#...",
        "input_area_text_color": "#...",
        "input_area_placeholder_color": "#...",
        "input_area_border_color": "#...",
        "input_area_send_button_background_color": "#...",
        "input_area_send_button_icon_color": "#..."
      },
      "message": {
        "ai_bubble_background_color": "#...",
        "ai_bubble_text_color": "#...",
        "user_bubble_background_color": "#...",
        "user_bubble_text_color": "#..."
      },
      "alerts": { "alert_background_color": "#...", "alert_text_color": "#..." },
      "border": { "borders_and_dividers_color": "#..." }
    }
  },
  "dark": {
    "brand_color": "#1D7AF2",
    "advanced_customization": { }
  }
}
```

- `mode` sets the preferred surface; **`resolveEffectiveThemeSurface`** (in `lib/theme-runtime.ts`) drives the `.dark` class on `<html>`, CSS variables, and which `logo_url_*` reads best (`system_default` uses OS preference; a `localStorage` toggle may override when in `system_default`).
- You may omit **`dark`** when you only ship a light palette: if nested **`light`** is present and **`dark`** is omitted, the UI **never** applies `html.dark` even when `mode` is `"dark"` or the OS prefers dark—so Tailwind and custom tokens stay consistent. For full light/dark switching with `system_default`, define **both** `light` and `dark`.
- `NEXT_PUBLIC_THEME_V2_BRAND_COLOR` (and server-only `THEME_V2_BRAND_COLOR`) set the **legacy root** `brand_color`, which applies as a fallback for both surfaces after merge.
- Other env fallbacks: `NEXT_PUBLIC_THEME_V2_MODE`, `NEXT_PUBLIC_THEME_V2_LOGO_URL_LIGHT`, `NEXT_PUBLIC_THEME_V2_LOGO_URL_DARK` (each also accepts the unprefixed server-only variant where applicable).

Deploying on Kubernetes/Knative, mount a ConfigMap to e.g. `/app/config/runtime-config.json` and set `RUNTIME_CONFIG_PATH=/app/config/runtime-config.json`.

### Typed defaults (`nitrochat.config.ts`)

Used for SSR-first paint and fallbacks. Many keys overlap with runtime JSON but **gateway** credential env vars are **not** duplicated in JSON — use env only (`lib/gateway-env.ts`).

---

## Environment variables

Variables below are grouped by concern. Prefix **`NEXT_PUBLIC_*`** is exposed to the browser at build time; **server-only** vars are read in Route Handlers and are preferred for secrets and Knative runtime overrides.

### Required for chat (production)

| Variable | Purpose |
|----------|---------|
| `NITROCHAT_GATEWAY_ENDPOINT` | Base URL of NitroChat Gateway (no trailing slash required in practice) |
| `NITROCHAT_GATEWAY_API_KEY` | API key sent as `X-API-Key` |

Without both, **`POST /api/chat`** returns **503** (`/api/config` sets `gateway.enabled: false`).

### Model behavior

| Variable | Purpose |
|----------|---------|
| `NITROCHAT_MODEL_SELECTION` | `true`: UI may send `model`; `false`: server uses `NITROCHAT_MODEL` only |
| `NITROCHAT_MODEL` | OpenRouter model id when selection is off (default in chat route: `openrouter/auto`) |

### MCP & app URL

| Variable | Purpose |
|----------|---------|
| `MCP_SERVER_URL` / `NEXT_PUBLIC_MCP_SERVER_URL` | MCP server origin |
| `NEXT_PUBLIC_MCP_API_KEY` | Optional MCP key if the server expects it |
| `NEXT_PUBLIC_APP_URL` | Public app URL fallback (OAuth / redirects) |
| `APP_URL` | Preferred runtime public URL |

### OAuth (optional)

| Variable | Purpose |
|----------|---------|
| `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET` | OAuth client |
| `OAUTH_REDIRECT_URI` | Default `http://localhost:3003/api/auth/callback` |
| `OAUTH_AUTHORIZATION_ENDPOINT`, `OAUTH_TOKEN_ENDPOINT` | IdP endpoints |
| `OAUTH_AUDIENCE` | e.g. Auth0 API audience |
| `OAUTH_USERINFO_ENDPOINT` | Optional; used when upserting User after token exchange |

### MongoDB (optional; chat history)

| Variable | Purpose |
|----------|---------|
| `MONGODB_URI` | Connection string |
| `MONGODB_DB_NAME` | Database name |

When both are set, `GET /api/config` sets `persistence.enabled: true` and chat routes can store history.

### Feature toggles (examples)

| Variable | Purpose |
|----------|---------|
| `FOCUS_MODE` / `NEXT_PUBLIC_FOCUS_MODE` | Restrict assistant to MCP/tool scope |
| `CHAT_CONTEXT_MAX_TOKENS` / `NEXT_PUBLIC_CHAT_CONTEXT_MAX_TOKENS` | Soft cap; UI warns to start a new thread |
| `ENABLE_FILE_SHARE` / `NITROCHAT_ENABLE_FILE_SHARE` | Server-toggle for composer attachments (preferred over stale build-time `NEXT_PUBLIC_*` alone) |
| `SYSTEM_PROMPT` | Extra system prompt from env when not in JSON |
| `TERMS_OF_SERVICE_URL`, `PRIVACY_POLICY_URL` | Shown in settings when set |
| `ELEVENLABS_API_KEY` | Voice/TTS when exposed through config |

See also **`.env.example`** for a starter list (you may extend it with the gateway and OAuth blocks above).

---

## Local development

**Requirements:** Node **≥ 18**, npm **≥ 9**.

```bash
cd nitrochat
npm install
cp .env.example .env.local
# Edit .env.local: set at least NITROCHAT_GATEWAY_ENDPOINT and NITROCHAT_GATEWAY_API_KEY
npm run dev
```

The dev server listens on **[http://localhost:3003](http://localhost:3003)** (`package.json` script `next dev -p 3003`).

```bash
npm run build    # Production build
npm run start    # Serve production build
npm run lint     # ESLint
```

**Checks before shipping**

- `POST /api/chat` succeeds against your gateway with tools disabled and enabled.
- `GET /api/config` returns expected `gateway`, `mcp`, and `persistence` flags.
- If using OAuth + DB, confirm a stored token can call `GET /api/chats` with `Authorization: Bearer …`.

---

## API surface

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/config` | No | Merged runtime configuration (+ CORS) |
| `POST` | `/api/chat` | No | Gateway completions; rate-limited by IP |
| `GET` | `/api/gateway/models` | No | Proxies gateway model catalog |
| `GET` / `POST` / `DELETE` | `/api/chats` | Bearer | List/create/delete-all chats |
| `GET` / `PUT` / `DELETE` | `/api/chats/[id]` | Bearer | Single chat CRUD |
| `POST` | `/api/auth/login` | No | Start OAuth (returns URLs + PKCE material) |
| `GET` | `/api/auth/callback` | No | IdP redirect; passes `auth_code` to app URL |
| `POST` | `/api/auth/token` | No | Exchange code + verifier for tokens |
| `POST` | `/api/auth/refresh` | No | Refresh access token |
| `POST` + `GET` | `/api/mcp/sse` | No | Optional MCP session + SSE proxy |
| `POST` | `/api/mcp/message` | No | MCP message proxy |

**Middleware** (`middleware.ts`): adds permissive CORS headers for **`/api/*`** paths.

---

## Security & headers

- **General pages:** `X-Frame-Options: SAMEORIGIN`, HSTS, etc. (`next.config.mjs`).
- **Embed route `/embed`:** `Content-Security-Policy: frame-ancestors *` so the widget can load in iframes on other origins; `Access-Control-Allow-Origin: *`.
- **Chat API JWT:** `lib/auth-server.ts` decodes JWT payload **without cryptographic verification** — intended for tokens **issued by your OAuth flow**; treat as trusted only in that deployment model.

---

## Release automation

Pushes to **`develop`** trigger **`.github/workflows/release.yml`**, which bumps the semver **patch** version in `package.json`, tags **`v*.*.*`**, and creates a GitHub Release (workflow skipped when the commit message contains **`[skip ci]`**).

---

## Contributing & onboarding tips

1. Read **`nitrochat.config.ts`** for the full typed surface area of configuration.
2. Trace a message from **`app/page.tsx`** or **`app/embed/page.tsx`** → **`buildChatApiPayload`** → **`POST /api/chat`**.
3. For MCP behavior, start with **`lib/mcp-client.ts`** and the MCP SDK transport.
4. For persistence, follow **`getUserFromRequest`** in **`lib/auth-server.ts`** and **`app/api/chats`** routes.

---

## Zitadel login (optional)

NitroChat ships an **optional**, fully parallel identity path that lets an operator
expose a "Sign in with Zitadel" button alongside the existing generic OAuth 2.1
flow. The existing flow, routes, storage, modal, `handleLogin`/`handleLogout`,
and the `?accessToken=` standaloneMode deep-link are **completely untouched**;
Zitadel lives in its own directory tree and its own localStorage bucket.

### Enable the flow

Set the following env vars (see **`.env.example`** for the canonical block):

```bash
ZITADEL_ENABLED=true
ZITADEL_ISSUER=https://zitadel.example.com
ZITADEL_CLIENT_ID=220000000000000003@nitrocloud
ZITADEL_CLIENT_SECRET=change-me
# Optional: explicit redirect URI. Defaults to ${APP_URL}/api/auth/zitadel/callback.
ZITADEL_REDIRECT_URI=
# Optional: audience override. Defaults to ZITADEL_CLIENT_ID.
ZITADEL_AUDIENCE=
# Optional: UI label on the Zitadel button.
ZITADEL_LOGIN_LABEL=Sign in with Zitadel
# Optional: pin login/self-registration to a specific Zitadel org.
ZITADEL_ORGANIZATION_ID=

# Flow B — per-instance project-role enforcement (recommended)
# When set, the login route requests project-aud + roles scopes and
# `/api/auth/zitadel/{token,refresh}` reject tokens missing the role.
ZITADEL_PROJECT_ID=
ZITADEL_REQUIRED_ROLE_KEYS=member
# Set to "false" to disable enforcement even with ZITADEL_PROJECT_ID set.
ZITADEL_ENFORCE_PROJECT_ROLES=true
```

### Flow B — per-instance access control

Without `ZITADEL_PROJECT_ID`, any user that can complete OIDC against
`ZITADEL_CLIENT_ID` can use this NitroChat (Flow A — org-level isolation
only). With `ZITADEL_PROJECT_ID` set, NitroChat:

1. Adds `urn:zitadel:iam:org:project:id:{id}:aud` and
   `urn:zitadel:iam:org:projects:roles` to the OIDC `scope`.
2. Decodes the access token in `/api/auth/zitadel/token` and rejects it
   with **403 `ZITADEL_FORBIDDEN`** unless the user holds at least one
   of `ZITADEL_REQUIRED_ROLE_KEYS` (default `member`) on
   `ZITADEL_PROJECT_ID`. The same check runs on `/api/auth/zitadel/refresh`
   so revocations land within the active session.

NitroCloud populates both env vars from
`instance.zitadelConfig.zitadelProjectId` on every deploy. Existing
instances provisioned before Flow B can be backfilled with
`backend/src/scripts/backfill-zitadel-project-id.ts`.

Grants are issued from NitroCloud's directory API:

- `POST /nitrochat-zitadel-directory/.../users/invite` with
  `nitroChatInstanceId` + `roleKeys` → invite + grant in one call.
- `POST .../instances/:instanceId/grants` → grant access for an
  existing directory user (e.g. invited org-wide previously).

When `ZITADEL_ENABLED !== 'true'` or any of the three core values is missing:

- `/api/config` does **not** emit the `mcp.zitadel` block, so the client UI has nothing to render.
- Every `/api/auth/zitadel/*` route returns **503 Service Unavailable**, making the endpoints safe even if env toggles change at runtime.
- The `ZitadelLoginModal` never renders.

### New surfaces (all additive)

- `app/api/auth/zitadel/login/route.ts` — PKCE + authorization URL generator.
- `app/api/auth/zitadel/callback/route.ts` — Zitadel redirects here, we relay to `/?zitadel_code=&zitadel_state=`.
- `app/api/auth/zitadel/token/route.ts` — code → token exchange + optional `User` upsert via `models/User`.
- `app/api/auth/zitadel/refresh/route.ts` — refresh-token grant.
- `app/oauth/zitadel-callback/page.tsx` — client companion that posts `zitadel:success` / `zitadel:error` to `window.opener`.
- `lib/zitadel.ts` — storage helpers, PKCE re-exports from `lib/oauth.ts`, refresh + logout.
- `components/ZitadelLoginModal.tsx` — Zitadel-branded gate modal.

These are mirrors of the existing OAuth pieces; nothing in `lib/oauth.ts`,
`/api/auth/{login,callback,token,refresh}/route.ts`, or `app/oauth/callback/page.tsx` is modified.

### Coexistence with the existing OAuth flow

| Scenario                                  | Gate modal shown                       | Bearer priority (unchanged header order)        |
| ----------------------------------------- | -------------------------------------- | ----------------------------------------------- |
| `?accessToken=…` deep link (standaloneMode) | None — token applied directly          | URL token wins                                  |
| OAuth configured, Zitadel disabled         | Existing `OAuthLoginModal`             | URL token > OAuth > MCP key                     |
| OAuth disabled, Zitadel enabled            | `ZitadelLoginModal`                    | URL token > Zitadel > MCP key                   |
| Both configured                            | OAuth modal gates first (existing UX) | URL token > Zitadel > OAuth > MCP key          |

Zitadel tokens persist under a **separate** localStorage key
(`nitrochat_zitadel_tokens`), so a single browser can hold both sessions at
once without collision. Zitadel logout clears only Zitadel state; the existing
`handleLogout` keeps managing the existing OAuth session verbatim.

### Integration with NitroCloud IPS

These env vars map 1:1 to the output of the NitroCloud Identity Provisioning
Service — see `Nitrocloud/backend/src/zitadel/README.md`. The IPS's
`injectConfig(tenantId)` returns `{ issuer, clientId, redirectUri }`, which you
wire into `ZITADEL_ISSUER`, `ZITADEL_CLIENT_ID`, and (optionally) `ZITADEL_REDIRECT_URI`.
The client secret comes from the initial provisioning response (or a secret
store like OpenBao) and populates `ZITADEL_CLIENT_SECRET`.

---

*README generated to match the codebase architecture; adjust sections when you add new routes or deployment targets.*
