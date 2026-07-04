# Zitadel IdP Flow — 404 Error Analysis & Solutions

## The Error

```
This sso.dev.nitrocloud.ai page can't be found
HTTP ERROR 404
```

On URL:
```
https://sso.dev.nitrocloud.ai/oauth/v2/authorize
  ?client_id=379187529330496069
  &redirect_uri=https://nitrochat-jjj-6a3eeef9-zitadels-org-09bd2f09.dev.nitrocloud.ai/api/auth/zitadel/callback
  &response_type=code
  &scope=openid profile email offline_access
         urn:zitadel:iam:org:id:378994934407008837
         urn:zitadel:iam:org:project:id:379187528810402373:aud
         urn:zitadel:iam:org:projects:roles
  &state=sIaEZaXWx_JubNx5698Tuw
  &code_challenge=G0p4VzJon27FLY8qDJp2paiKXEME43xndUpzCxFafw0
  &code_challenge_method=S256
  &prompt=login
  &audience=379187529330496069
  &idp_hint=379170470659920453
```

---

## Decoded Parameter Comparison

| Parameter | Value in Error URL | Value in dev `.env` | Match? |
|-----------|-------------------|---------------------|--------|
| `ZITADEL_ISSUER` (host) | `sso.dev.nitrocloud.ai` | `sso.dev.nitrocloud.ai` | ✅ |
| `client_id` | `379187529330496069` | `379165731683603013` | ❌ Different instance |
| `ZITADEL_ORGANIZATION_ID` | `378994934407008837` | `378994934407008837` | ✅ Same org |
| `ZITADEL_PROJECT_ID` | `379187528810402373` | *(not in dev .env)* | — New project |
| `idp_hint` | `379170470659920453` | `379170470659920453` | ⚠️ Same — but this was from dev env |
| `prompt` | `login` | *(not set locally)* | — Injected by NitroCloud |

> [!IMPORTANT]
> The `client_id` and `project_id` differ from the dev `.env`, meaning this is a **deployed NitroChat instance** (`nitrochat-jjj-6a3eeef9`) provisioned by NitroCloud with its own Zitadel OIDC app. But the `idp_hint` is the **same Google IdP UUID** from the dev environment.

---

## Root Cause Analysis

### 🔴 Cause 1: Zitadel Instance Not Serving (Infrastructure)

The browser shows "This page can't be found" with HTTP 404. This means the server at `sso.dev.nitrocloud.ai` **responded** (DNS resolved, TCP connected, TLS handshook) but returned a 404 for `/oauth/v2/authorize`.

This happens when:
- **Zitadel is down** or restarting — the K8s pod is running but Zitadel's OIDC handler hasn't started
- **ExternalDomain mismatch** — Zitadel is configured with a different external domain than `sso.dev.nitrocloud.ai`, so it returns "Instance not found" as a 404
- **Reverse proxy misconfiguration** — Nginx/Caddy/Traefik in front of Zitadel drops or misroutes `/oauth/v2/*` requests

**Diagnostic:**
```bash
# 1. Check if Zitadel's OIDC discovery is reachable
curl -s https://sso.dev.nitrocloud.ai/.well-known/openid-configuration | jq .

# 2. Check the authorize endpoint directly (should return HTML login page, not 404)
curl -sI "https://sso.dev.nitrocloud.ai/oauth/v2/authorize?client_id=test&response_type=code&redirect_uri=https://example.com&scope=openid"

# 3. Check Zitadel health
curl -s https://sso.dev.nitrocloud.ai/debug/healthz
```

If discovery returns 404 too → Zitadel is down or domain is wrong. If discovery works but authorize returns 404 → proxy routing issue.

---

### 🔴 Cause 2: Wrong `idp_hint` for This Instance's Organization

The `idp_hint=379170470659920453` was the Google IdP UUID discovered for the **dev environment** org (`nc-bd2f0f`). This deployed instance (`nitrochat-jjj-6a3eeef9`) might be in a **different Zitadel organization** that has its own Google IdP with a **different UUID**.

Looking at the NitroCloud provisioning code in [nitrochat-instance.service.ts](file:///Users/admin/Desktop/imp/zitadel/nitrocloud/backend/src/nitrochat/nitrochat-instance.service.ts#L1758-L1812):

```typescript
// Lines 1758-1805: Auto-discovers IdP IDs per-organization
if (instance.zitadelConfig?.enabled && (!idpGoogleId || !idpGithubId)) {
  const response = await this.zitadelDirectoryService.listIdentityProviders(organizationId);
  for (const provider of response.providers) {
    if (provider.state === 'IDP_STATE_ACTIVE') {
      if (providerName.includes('google') && !idpGoogleId) {
        idpGoogleId = providerId;  // ← Should be org-specific
      }
    }
  }
}
```

**BUT** — if the organization for instance `nitrochat-jjj-6a3eeef9` **doesn't have a Google IdP configured**, the auto-discovery returns nothing. The `idpGoogleId` stays as whatever was stored in the DB (possibly the hardcoded dev value `379170470659920453`).

When Zitadel receives an `idp_hint` pointing to an IdP that **doesn't exist in the requesting application's org**, it may return a 404 instead of a proper OIDC error redirect.

---

### 🟡 Cause 3: `prompt=login` + `idp_hint` Conflict

NitroCloud injects `ZITADEL_PROMPT=login` ([line 1606](file:///Users/admin/Desktop/imp/zitadel/nitrocloud/backend/src/nitrochat/nitrochat-instance.service.ts#L1606)) to prevent EVENT-adk13 (stale cookie errors). The login route then adds both `prompt=login` and `idp_hint` to the same authorize URL ([login/route.ts lines 176-188](file:///Users/admin/Desktop/imp/zitadel/nitrochat/app/api/auth/zitadel/login/route.ts#L176-L188)).

Per OIDC spec, `prompt=login` forces the Authorization Server to show its own login UI. Combined with `idp_hint` (which tells Zitadel to skip its UI and go directly to Google), this creates a **contradictory instruction**. Some Zitadel versions may handle this by erroring out.

---

### 🟡 Cause 4: `client_id` Not Registered or Disabled

If the OIDC application `379187529330496069` was deleted, disabled, or never fully provisioned in Zitadel, the authorize endpoint returns 404 because there's no valid application to start an auth flow for.

---

## Solutions

### Solution 1: Verify Zitadel Instance Health (Quick Diagnostic)

Before any code changes, confirm the Zitadel instance is actually alive:

```bash
# Check OIDC discovery
curl -v https://sso.dev.nitrocloud.ai/.well-known/openid-configuration

# If this 404s too → Zitadel is down / ExternalDomain wrong / proxy broken
# If this works → the problem is parameter-specific
```

---

### Solution 2: Strip `idp_hint` When IdP Not Verified (Code Fix in NitroChat)

The login route should **not send `idp_hint` at all** if it can't verify the IdP actually exists for the current org. The safest fix is to make the login route gracefully omit `idp_hint` when the resolved value is still the abstract name (`'google'` / `'github'`) — meaning no real UUID was configured.

#### File: [login/route.ts](file:///Users/admin/Desktop/imp/zitadel/nitrochat/app/api/auth/zitadel/login/route.ts#L128-L133)

```diff
     // Resolve human-readable provider names to their configured Zitadel IdP IDs
     if (effectiveIdpHint === 'google') {
-      effectiveIdpHint = process.env.ZITADEL_IDP_GOOGLE_ID?.trim() || 'google';
+      const googleId = process.env.ZITADEL_IDP_GOOGLE_ID?.trim();
+      // If no real UUID is configured, drop the hint entirely so Zitadel
+      // falls back to its hosted login page instead of 404-ing.
+      effectiveIdpHint = googleId || '';
     } else if (effectiveIdpHint === 'github') {
-      effectiveIdpHint = process.env.ZITADEL_IDP_GITHUB_ID?.trim() || 'github';
+      const githubId = process.env.ZITADEL_IDP_GITHUB_ID?.trim();
+      effectiveIdpHint = githubId || '';
     }
```

**Why:** Currently, if `ZITADEL_IDP_GOOGLE_ID` is empty, the code falls back to sending the literal string `'google'` as the `idp_hint`. Zitadel expects a UUID, not a human name — this guarantees a failure. Omitting the hint lets Zitadel show its own provider selection, which at least works.

---

### Solution 3: Don't Combine `prompt=login` with `idp_hint` (Code Fix in NitroChat)

When `idp_hint` is present, `prompt=login` is contradictory. The login route should skip `prompt` when redirecting to an external IdP.

#### File: [login/route.ts](file:///Users/admin/Desktop/imp/zitadel/nitrochat/app/api/auth/zitadel/login/route.ts#L174-L188)

```diff
-    // `prompt=` is optional; exposed via env for operators who want
-    // to force the Zitadel login screen (e.g. prompt=login).
-    if (process.env.ZITADEL_PROMPT) {
-      authUrl.searchParams.set('prompt', process.env.ZITADEL_PROMPT);
-    }
-
     if (effectiveAudience) {
       authUrl.searchParams.set('audience', effectiveAudience);
     }
 
     // When an IdP hint is configured, Zitadel skips its own hosted login
     // page and redirects directly to the specified external provider.
     if (effectiveIdpHint) {
       authUrl.searchParams.set('idp_hint', effectiveIdpHint);
-    }
+      // Don't add prompt=login when using idp_hint — the two are
+      // contradictory. prompt=login forces Zitadel to show its own
+      // login screen, while idp_hint tells it to skip directly to
+      // the external provider.
+    } else if (process.env.ZITADEL_PROMPT) {
+      // Only apply prompt when there's no IdP hint redirect.
+      authUrl.searchParams.set('prompt', process.env.ZITADEL_PROMPT);
+    }
```

---

### Solution 4: Validate IdP Exists Before Redirect (NitroCloud Provisioning Fix)

The NitroCloud auto-discovery in [nitrochat-instance.service.ts](file:///Users/admin/Desktop/imp/zitadel/nitrocloud/backend/src/nitrochat/nitrochat-instance.service.ts#L1762) should explicitly **clear** the IdP hint env vars when no matching provider is found, rather than silently passing through a stale value from the database.

#### File: [nitrochat-instance.service.ts](file:///Users/admin/Desktop/imp/zitadel/nitrocloud/backend/src/nitrochat/nitrochat-instance.service.ts#L1807-L1812)

```diff
     if (idpGoogleId) {
       envVars['ZITADEL_IDP_GOOGLE_ID'] = idpGoogleId;
+    } else {
+      // Explicitly clear so a stale DB value doesn't trigger a 404
+      delete envVars['ZITADEL_IDP_GOOGLE_ID'];
     }
     if (idpGithubId) {
       envVars['ZITADEL_IDP_GITHUB_ID'] = idpGithubId;
+    } else {
+      delete envVars['ZITADEL_IDP_GITHUB_ID'];
     }
```

---

### Solution 5: Add Health Check Before Redirect (Frontend Resilience)

The frontend `handleSocialZitadelLogin` in [page.tsx](file:///Users/admin/Desktop/imp/zitadel/nitrochat/app/page.tsx#L2554-L2581) should probe the Zitadel host before blindly redirecting:

```typescript
const handleSocialZitadelLogin = useCallback(async (provider: 'google' | 'github') => {
  // ... existing code ...
  const data = await resp.json();
  if (data.authorizationUrl && data.codeVerifier && data.state) {
    saveZitadelCodeVerifier(data.codeVerifier);
    saveZitadelState(data.state);

    // Probe Zitadel health before redirect to avoid silent 404
    try {
      const authUrlObj = new URL(data.authorizationUrl);
      const probe = await fetch(
        `${authUrlObj.origin}/.well-known/openid-configuration`,
        { mode: 'no-cors', signal: AbortSignal.timeout(3000) }
      );
    } catch {
      setZitadelSignInError(
        'SSO service is unreachable. Please try again or contact your admin.'
      );
      return;
    }

    window.location.href = data.authorizationUrl;
  }
}, [zitadelAuthorizationEndpoint, zitadelAudience]);
```

---

## Recommended Fix Order

| Priority | Solution | Impact | Where |
|----------|----------|--------|-------|
| 🔴 **P0** | **Solution 1** — Check if `sso.dev.nitrocloud.ai` is alive | Confirms whether this is infra vs code | Manual/DevOps |
| 🔴 **P0** | **Solution 2** — Don't send abstract strings as `idp_hint` | Prevents guaranteed 404 from bad hint | NitroChat |
| 🟠 **P1** | **Solution 3** — Don't combine `prompt=login` + `idp_hint` | Removes contradictory OIDC params | NitroChat |
| 🟠 **P1** | **Solution 4** — Clear stale IdP IDs in provisioning | Prevents wrong org's IdP UUID leaking | NitroCloud |
| 🟡 **P2** | **Solution 5** — Frontend health probe | Better UX on infra failures | NitroChat |

## Quick Test

After applying Solutions 2+3, test by removing `idp_hint` and `prompt` from the URL manually:

```
https://sso.dev.nitrocloud.ai/oauth/v2/authorize
  ?client_id=379187529330496069
  &redirect_uri=https://nitrochat-jjj-6a3eeef9-zitadels-org-09bd2f09.dev.nitrocloud.ai/api/auth/zitadel/callback
  &response_type=code
  &scope=openid+profile+email+offline_access
  &state=test123
  &code_challenge=test
  &code_challenge_method=S256
```

If this **still 404s** → the problem is infrastructure (Cause 1) and no code fix will help.
If this **works** → the problem is the parameter combination, and Solutions 2+3 fix it.
