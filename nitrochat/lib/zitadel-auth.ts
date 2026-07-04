/**
 * Zitadel access-token role-check helpers (Flow B).
 *
 * Decodes a Zitadel JWT *payload* (no signature verify — the token was
 * just minted by Zitadel over TLS in the same request lifecycle) and
 * checks that the user holds at least one of the required project
 * roles on `ZITADEL_PROJECT_ID`.
 *
 * Per Zitadel docs (https://zitadel.com/docs/apis/openidoauth/scopes):
 *   - scope `urn:zitadel:iam:org:project:id:{projectId}:aud` pins
 *     audience to that project so the token carries roles for it.
 *   - scope `urn:zitadel:iam:org:projects:roles` adds a per-project
 *     roles claim of shape:
 *       "urn:zitadel:iam:org:project:{projectId}:roles": {
 *         "<roleKey>": { "<orgId>": "<orgName>", ... },
 *         ...
 *       }
 *
 * Older / single-project configurations may emit a flatter
 *   "urn:zitadel:iam:org:project:roles" claim instead — we accept both.
 *
 * Enforcement is opt-in: when `ZITADEL_PROJECT_ID` is unset (legacy
 * Flow A instances, or instances not yet backfilled) the check is
 * skipped entirely so existing deployments keep working.
 */

/** Decode the payload of a JWT (no signature verify). Throws on malformed input. */
export function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length < 2) {
    throw new Error('Malformed JWT: expected three dot-separated segments');
  }
  const payload = parts[1];
  const padded = payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), '=');
  const normalized = padded.replace(/-/g, '+').replace(/_/g, '/');
  const json = Buffer.from(normalized, 'base64').toString('utf8');
  return JSON.parse(json) as Record<string, unknown>;
}

/**
 * Whether the access token's payload contains any of the required
 * role keys on the configured project.
 *
 * Accepts both Zitadel claim shapes:
 *   - per-project: `urn:zitadel:iam:org:project:{projectId}:roles`
 *   - aggregate:   `urn:zitadel:iam:org:project:roles`
 *
 * In both cases the claim value is an object whose keys are role keys
 * the user holds; values describe which organization(s) granted them.
 */
export function hasRequiredProjectRoles(
  payload: Record<string, unknown>,
  projectId: string,
  requiredRoleKeys: string[],
): boolean {
  if (!projectId || requiredRoleKeys.length === 0) return false;

  const perProjectClaim =
    payload[`urn:zitadel:iam:org:project:${projectId}:roles`];
  const aggregateClaim = payload['urn:zitadel:iam:org:project:roles'];

  const heldRoleKeys = new Set<string>();
  for (const claim of [perProjectClaim, aggregateClaim]) {
    if (claim && typeof claim === 'object' && !Array.isArray(claim)) {
      for (const key of Object.keys(claim as Record<string, unknown>)) {
        heldRoleKeys.add(key);
      }
    }
  }

  return requiredRoleKeys.some((key) => heldRoleKeys.has(key));
}

/** Parse env-configured required roles. Defaults to `['member']`. */
export function parseRequiredRoleKeys(raw?: string | null): string[] {
  const list = String(raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length > 0 ? list : ['member'];
}

/**
 * Resolve enforcement status from env:
 *   - returns `null` when enforcement is OFF (no `ZITADEL_PROJECT_ID`
 *     or explicit `ZITADEL_ENFORCE_PROJECT_ROLES=false`).
 *   - returns `{ projectId, requiredRoleKeys }` otherwise.
 */
export function resolveProjectRoleEnforcement():
  | { projectId: string; requiredRoleKeys: string[] }
  | null {
  const projectId = String(process.env.ZITADEL_PROJECT_ID ?? '').trim();
  if (!projectId) return null;
  const enforceFlag = String(
    process.env.ZITADEL_ENFORCE_PROJECT_ROLES ?? 'true',
  ).toLowerCase();
  if (enforceFlag === 'false' || enforceFlag === '0') return null;
  return {
    projectId,
    requiredRoleKeys: parseRequiredRoleKeys(
      process.env.ZITADEL_REQUIRED_ROLE_KEYS,
    ),
  };
}

/**
 * Convenience: check a Zitadel access token end-to-end. Returns a
 * structured outcome so the caller can pick its own response shape.
 *
 * `{ enforced: false }` → skip check (legacy / not configured).
 * `{ enforced: true, ok: true }` → user has at least one required role.
 * `{ enforced: true, ok: false, reason }` → reject.
 */
export function checkAccessTokenProjectRoles(accessToken: string):
  | { enforced: false }
  | { enforced: true; ok: true; projectId: string; requiredRoleKeys: string[] }
  | {
      enforced: true;
      ok: false;
      projectId: string;
      requiredRoleKeys: string[];
      reason: string;
    } {
  const enforcement = resolveProjectRoleEnforcement();
  if (!enforcement) return { enforced: false };

  let payload: Record<string, unknown>;
  try {
    payload = decodeJwtPayload(accessToken);
  } catch (error) {
    return {
      enforced: true,
      ok: false,
      projectId: enforcement.projectId,
      requiredRoleKeys: enforcement.requiredRoleKeys,
      reason: `Access token could not be decoded: ${(error as Error).message}`,
    };
  }

  const ok = hasRequiredProjectRoles(
    payload,
    enforcement.projectId,
    enforcement.requiredRoleKeys,
  );
  if (ok) {
    return {
      enforced: true,
      ok: true,
      projectId: enforcement.projectId,
      requiredRoleKeys: enforcement.requiredRoleKeys,
    };
  }
  return {
    enforced: true,
    ok: false,
    projectId: enforcement.projectId,
    requiredRoleKeys: enforcement.requiredRoleKeys,
    reason: `User is missing required project role(s) on ${enforcement.projectId}`,
  };
}
