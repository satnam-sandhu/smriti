import { decodeJwtPayload, hasRequiredProjectRoles } from './zitadel-auth';
import { verifyZitadelToken } from './zitadel-jwks';

async function runVerification() {
  console.log('Running Zitadel auth verification tests...');

  // 1. Test decodeJwtPayload
  const mockPayload = { sub: 'user-789', email: 'test-user@nitrostack.ai' };
  const mockToken = `header.${Buffer.from(JSON.stringify(mockPayload)).toString('base64url')}.signature`;
  const decoded = decodeJwtPayload(mockToken);
  if (decoded.sub !== 'user-789' || decoded.email !== 'test-user@nitrostack.ai') {
    throw new Error('decodeJwtPayload validation failed');
  }
  console.log('✓ decodeJwtPayload passed');

  // 2. Test hasRequiredProjectRoles (Per-Project Claim)
  const claimsPerProject = {
    'urn:zitadel:iam:org:project:proj-123:roles': { admin: { 'org-1': 'Nitrostack' } }
  };
  if (!hasRequiredProjectRoles(claimsPerProject, 'proj-123', ['admin'])) {
    throw new Error('hasRequiredProjectRoles (per-project) failed to validate matching role');
  }
  if (hasRequiredProjectRoles(claimsPerProject, 'proj-123', ['member'])) {
    throw new Error('hasRequiredProjectRoles (per-project) validated non-matching role');
  }

  // 3. Test hasRequiredProjectRoles (Aggregate Claim)
  const claimsAggregate = {
    'urn:zitadel:iam:org:project:roles': { member: { 'org-1': 'Nitrostack' } }
  };
  if (!hasRequiredProjectRoles(claimsAggregate, 'proj-123', ['member'])) {
    throw new Error('hasRequiredProjectRoles (aggregate) failed to validate matching role');
  }
  console.log('✓ hasRequiredProjectRoles passed');

  // 4. Test verifyZitadelToken throws on invalid signature format
  try {
    process.env.ZITADEL_ISSUER = 'https://dummy.zitadel.cloud';
    await verifyZitadelToken('invalid-token-string');
    throw new Error('verifyZitadelToken did not throw on malformed token');
  } catch (err: any) {
    if (err.message.includes('did not throw')) {
      throw err;
    }
    console.log('✓ verifyZitadelToken throws on malformed signature correctly');
  }

  console.log('All Zitadel auth verification tests passed successfully!');
}

runVerification().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
