/**
 * Local smoke test for lib/zitadel-auth.ts (Flow B JWT/claim logic).
 *
 *   npx tsx scripts/test-zitadel-auth.ts
 *
 * Pure-function tests — no Zitadel, no network. Covers the parser's two
 * claim shapes, env toggles, and edge cases that would cause silent
 * allow/deny in production.
 */

import assert from 'node:assert/strict';
import {
  decodeJwtPayload,
  hasRequiredProjectRoles,
  parseRequiredRoleKeys,
  resolveProjectRoleEnforcement,
  checkAccessTokenProjectRoles,
} from '../lib/zitadel-auth';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ok  ${name}`);
    passed += 1;
  } catch (err) {
    console.log(`  FAIL ${name}`);
    console.log(`       ${(err as Error).message}`);
    failed += 1;
  }
}

function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function makeJwt(payload: Record<string, unknown>): string {
  // Signature segment is opaque to the decoder; fixed string is fine.
  return `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url(payload)}.fakesig`;
}

const PROJECT_ID = '220000000000000002';
const OTHER_PROJECT_ID = '999999999999999999';
const ORG_ID = '370000000000000018';

console.log('decodeJwtPayload');
test('decodes a well-formed token', () => {
  const tok = makeJwt({ sub: 'user-1', foo: 'bar' });
  const payload = decodeJwtPayload(tok);
  assert.equal(payload.sub, 'user-1');
  assert.equal(payload.foo, 'bar');
});
test('throws on malformed token', () => {
  assert.throws(() => decodeJwtPayload('not-a-jwt'));
});
test('handles unpadded base64url payload', () => {
  const tok = makeJwt({ a: 1 });
  assert.doesNotThrow(() => decodeJwtPayload(tok));
});

console.log('\nhasRequiredProjectRoles');
test('per-project claim, role match -> true', () => {
  const payload = {
    [`urn:zitadel:iam:org:project:${PROJECT_ID}:roles`]: {
      member: { [ORG_ID]: 'acme' },
    },
  };
  assert.equal(hasRequiredProjectRoles(payload, PROJECT_ID, ['member']), true);
});
test('per-project claim, role mismatch -> false', () => {
  const payload = {
    [`urn:zitadel:iam:org:project:${PROJECT_ID}:roles`]: {
      viewer: { [ORG_ID]: 'acme' },
    },
  };
  assert.equal(hasRequiredProjectRoles(payload, PROJECT_ID, ['member']), false);
});
test('aggregate claim shape -> true when role present', () => {
  const payload = {
    'urn:zitadel:iam:org:project:roles': {
      admin: { [ORG_ID]: 'acme' },
    },
  };
  assert.equal(hasRequiredProjectRoles(payload, PROJECT_ID, ['admin']), true);
});
test('claim for a different project is ignored', () => {
  const payload = {
    [`urn:zitadel:iam:org:project:${OTHER_PROJECT_ID}:roles`]: {
      member: { [ORG_ID]: 'acme' },
    },
  };
  assert.equal(hasRequiredProjectRoles(payload, PROJECT_ID, ['member']), false);
});
test('multiple required roles, ANY match -> true', () => {
  const payload = {
    [`urn:zitadel:iam:org:project:${PROJECT_ID}:roles`]: {
      viewer: { [ORG_ID]: 'acme' },
    },
  };
  assert.equal(
    hasRequiredProjectRoles(payload, PROJECT_ID, ['admin', 'viewer']),
    true,
  );
});
test('empty required list -> false (defensive)', () => {
  const payload = {
    [`urn:zitadel:iam:org:project:${PROJECT_ID}:roles`]: { member: {} },
  };
  assert.equal(hasRequiredProjectRoles(payload, PROJECT_ID, []), false);
});
test('missing claim entirely -> false', () => {
  assert.equal(hasRequiredProjectRoles({}, PROJECT_ID, ['member']), false);
});
test('array-shaped claim (unsupported) -> false, no crash', () => {
  const payload = {
    [`urn:zitadel:iam:org:project:${PROJECT_ID}:roles`]: ['member'],
  };
  assert.equal(hasRequiredProjectRoles(payload, PROJECT_ID, ['member']), false);
});

console.log('\nparseRequiredRoleKeys');
test('defaults to ["member"] when unset', () => {
  assert.deepEqual(parseRequiredRoleKeys(undefined), ['member']);
});
test('defaults when empty string', () => {
  assert.deepEqual(parseRequiredRoleKeys(''), ['member']);
});
test('splits + trims comma list', () => {
  assert.deepEqual(parseRequiredRoleKeys(' admin , member '), [
    'admin',
    'member',
  ]);
});
test('ignores empty entries', () => {
  assert.deepEqual(parseRequiredRoleKeys('admin,,member,'), ['admin', 'member']);
});

console.log('\nresolveProjectRoleEnforcement (env-driven)');
function withEnv(
  overrides: Record<string, string | undefined>,
  fn: () => void,
): void {
  const prev = { ...process.env };
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    fn();
  } finally {
    process.env = prev;
  }
}
test('returns null when ZITADEL_PROJECT_ID is unset (Flow A)', () => {
  withEnv({ ZITADEL_PROJECT_ID: undefined }, () => {
    assert.equal(resolveProjectRoleEnforcement(), null);
  });
});
test('returns null when explicitly disabled', () => {
  withEnv(
    { ZITADEL_PROJECT_ID: PROJECT_ID, ZITADEL_ENFORCE_PROJECT_ROLES: 'false' },
    () => {
      assert.equal(resolveProjectRoleEnforcement(), null);
    },
  );
});
test('enforced + defaults to ["member"]', () => {
  withEnv(
    {
      ZITADEL_PROJECT_ID: PROJECT_ID,
      ZITADEL_ENFORCE_PROJECT_ROLES: undefined,
      ZITADEL_REQUIRED_ROLE_KEYS: undefined,
    },
    () => {
      const r = resolveProjectRoleEnforcement();
      assert.deepEqual(r, {
        projectId: PROJECT_ID,
        requiredRoleKeys: ['member'],
      });
    },
  );
});
test('honors custom required role list', () => {
  withEnv(
    {
      ZITADEL_PROJECT_ID: PROJECT_ID,
      ZITADEL_REQUIRED_ROLE_KEYS: 'admin,member',
    },
    () => {
      const r = resolveProjectRoleEnforcement();
      assert.deepEqual(r?.requiredRoleKeys, ['admin', 'member']);
    },
  );
});

console.log('\ncheckAccessTokenProjectRoles (end-to-end)');
test('enforced=false when project id missing (Flow A)', () => {
  withEnv({ ZITADEL_PROJECT_ID: undefined }, () => {
    const tok = makeJwt({});
    const r = checkAccessTokenProjectRoles(tok);
    assert.equal(r.enforced, false);
  });
});
test('enforced + ok=true on matching role', () => {
  withEnv({ ZITADEL_PROJECT_ID: PROJECT_ID }, () => {
    const tok = makeJwt({
      [`urn:zitadel:iam:org:project:${PROJECT_ID}:roles`]: {
        member: { [ORG_ID]: 'acme' },
      },
    });
    const r = checkAccessTokenProjectRoles(tok);
    assert.equal(r.enforced, true);
    assert.equal((r as { ok: boolean }).ok, true);
  });
});
test('enforced + ok=false when role missing', () => {
  withEnv({ ZITADEL_PROJECT_ID: PROJECT_ID }, () => {
    const tok = makeJwt({
      [`urn:zitadel:iam:org:project:${PROJECT_ID}:roles`]: {
        viewer: { [ORG_ID]: 'acme' },
      },
    });
    const r = checkAccessTokenProjectRoles(tok) as {
      ok: boolean;
      reason?: string;
    };
    assert.equal(r.ok, false);
    assert.match(r.reason ?? '', /missing required project role/);
  });
});
test('enforced + ok=false on malformed token (does not throw)', () => {
  withEnv({ ZITADEL_PROJECT_ID: PROJECT_ID }, () => {
    const r = checkAccessTokenProjectRoles('not-a-jwt') as {
      ok: boolean;
      reason?: string;
    };
    assert.equal(r.ok, false);
    assert.match(r.reason ?? '', /could not be decoded/);
  });
});
test('enforced + ok=false when claim is for a different project', () => {
  withEnv({ ZITADEL_PROJECT_ID: PROJECT_ID }, () => {
    const tok = makeJwt({
      [`urn:zitadel:iam:org:project:${OTHER_PROJECT_ID}:roles`]: {
        member: { [ORG_ID]: 'acme' },
      },
    });
    const r = checkAccessTokenProjectRoles(tok) as { ok: boolean };
    assert.equal(r.ok, false);
  });
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
