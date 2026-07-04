#!/usr/bin/env node
/**
 * Deploy Smriti MCP to NitroCloud — bundles mcp/ + parser/ + samples/.
 *
 * Required env:
 *   NITROSTACK_API_KEY, NITROSTACK_PROJECT_ID, NITROSTACK_ORG_ID
 *
 * Optional:
 *   NITROSTACK_API_BASE (default: https://api.dev.nitrostack.ai/api/v1)
 */
import fs from 'node:fs';
import https from 'node:https';
import { execSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const MCP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
const SMRITI_ROOT = resolve(MCP_ROOT, '..');

const API_KEY = process.env.NITROSTACK_API_KEY;
const PROJECT_ID = process.env.NITROSTACK_PROJECT_ID;
const ORG_ID = process.env.NITROSTACK_ORG_ID;
const API_BASE = process.env.NITROSTACK_API_BASE ?? 'https://api.dev.nitrostack.ai/api/v1';

if (!API_KEY || !PROJECT_ID || !ORG_ID) {
  console.error(
    'Missing env: NITROSTACK_API_KEY, NITROSTACK_PROJECT_ID, NITROSTACK_ORG_ID',
  );
  process.exit(1);
}

function request(url, options, body = null) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, headers: res.headers, data });
      });
    });

    req.on('error', reject);
    if (body) req.write(Buffer.isBuffer(body) ? body : JSON.stringify(body));
    req.end();
  });
}

function uploadToS3(url, fileBuffer) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const req = https.request(
      {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 443,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'PUT',
        headers: {
          'Content-Type': 'application/zip',
          'Content-Length': fileBuffer.length,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve();
          else reject(new Error(`S3 upload failed ${res.statusCode}: ${data}`));
        });
      },
    );
    req.on('error', reject);
    req.write(fileBuffer);
    req.end();
  });
}

function copyDeployTree(staging) {
  const skip = new Set(['node_modules', '.git', '.env', 'data']);
  for (const name of fs.readdirSync(MCP_ROOT)) {
    if (skip.has(name)) continue;
    cpSync(join(MCP_ROOT, name), join(staging, name), { recursive: true });
  }

  cpSync(join(SMRITI_ROOT, 'parser'), join(staging, 'parser'), { recursive: true });
  if (fs.existsSync(join(SMRITI_ROOT, 'samples'))) {
    cpSync(join(SMRITI_ROOT, 'samples'), join(staging, 'samples'), { recursive: true });
  }

  // Pre-built artifacts (cloud may skip compile step)
  for (const artifact of ['dist', join('src', 'widgets', 'out')]) {
    const src = join(MCP_ROOT, artifact);
    if (fs.existsSync(src)) {
      cpSync(src, join(staging, artifact), { recursive: true });
    }
  }

  fs.mkdirSync(join(staging, 'data'), { recursive: true });

  fs.writeFileSync(
    join(staging, '.env.production'),
    [
      'NITRO_LOG_LEVEL=info',
      'NITROSTACK_APP_MODE=openai',
      'MCP_TRANSPORT_TYPE=dual',
      'NODE_ENV=production',
      'SMRITI_ROOT=.',
      'SMRITI_WORKSPACE=./data',
      'PORT=3000',
    ].join('\n') + '\n',
  );
}

async function main() {
  console.log('🚀 Deploying smriti-mcp to NitroCloud...');

  console.log('📦 Building MCP...');
  execSync('node scripts/export-templates.mjs', { cwd: MCP_ROOT, stdio: 'inherit' });
  execSync('npm run build', { cwd: MCP_ROOT, stdio: 'inherit' });

  const staging = mkdtempSync(join(tmpdir(), 'smriti-deploy-'));
  const zipPath = join(tmpdir(), 'smriti-mcp-deploy.zip');

  try {
    console.log('📁 Staging deploy bundle (mcp + parser + samples)...');
    copyDeployTree(staging);

    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    execSync(
      `zip -r "${zipPath}" . -x "node_modules/*" -x "out/*" -x ".next/*" -x "src/widgets/node_modules/*" -x "src/widgets/.next/*" -x ".turbo/*" -x ".git/*" -x ".env" -x "parser/.venv/*" -x "**/__pycache__/*" -x "*.DS_Store" -x "deploy-project.mjs"`,
      { cwd: staging, stdio: 'inherit' },
    );

    console.log('🔑 Authenticating...');
    const authRes = await request(`${API_BASE}/api-keys/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, { apiKey: API_KEY });
    const authData = JSON.parse(authRes.data);
    if (authRes.statusCode !== 200 || !authData.success) {
      throw new Error(authData.message || 'Auth failed');
    }
    const token = authData.data.accessToken;
    const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    console.log('📡 Requesting presigned URL...');
    let presignRes = await request(`${API_BASE}/studio/deployments/presign`, {
      method: 'POST',
      headers: authHeaders,
    }, {
      projectId: PROJECT_ID,
      organizationId: ORG_ID,
      environmentVariables: {
        NITRO_LOG_LEVEL: 'info',
        NITROSTACK_APP_MODE: 'openai',
        MCP_TRANSPORT_TYPE: 'dual',
        NODE_ENV: 'production',
        SMRITI_ROOT: '.',
        SMRITI_WORKSPACE: './data',
        PORT: '3000',
      },
    });

    let presignData = JSON.parse(presignRes.data);
    if (presignRes.statusCode === 400 && presignData.message?.includes('pending')) {
      const currentRes = await request(`${API_BASE}/studio/deployments/current`, {
        method: 'GET',
        headers: authHeaders,
      });
      const currentData = JSON.parse(currentRes.data);
      if (currentData.success && currentData.data) {
        const pendingId = currentData.data.studioDeploymentId || currentData.data._id;
        await request(`${API_BASE}/studio/deployments/${pendingId}/reject`, {
          method: 'POST',
          headers: authHeaders,
        });
        presignRes = await request(`${API_BASE}/studio/deployments/presign`, {
          method: 'POST',
          headers: authHeaders,
        }, {
          projectId: PROJECT_ID,
          organizationId: ORG_ID,
          environmentVariables: {
            NITRO_LOG_LEVEL: 'info',
            NITROSTACK_APP_MODE: 'openai',
            MCP_TRANSPORT_TYPE: 'dual',
            NODE_ENV: 'production',
            SMRITI_ROOT: '.',
            SMRITI_WORKSPACE: './data',
            PORT: '3000',
          },
        });
        presignData = JSON.parse(presignRes.data);
      }
    }

    if (presignRes.statusCode !== 201 || !presignData.success) {
      throw new Error(presignData.message || 'Presign failed');
    }

    const { studioDeploymentId: deploymentId, presignedUrl } = presignData.data;

    console.log('⬆️ Uploading archive...');
    await uploadToS3(presignedUrl, fs.readFileSync(zipPath));

    await request(`${API_BASE}/studio/deployments/${deploymentId}/upload-complete`, {
      method: 'POST',
      headers: authHeaders,
    });

    await request(`${API_BASE}/studio/deployments/${deploymentId}/confirm`, {
      method: 'POST',
      headers: authHeaders,
    });

    console.log('⏳ Polling deployment status...');
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const statusRes = await request(`${API_BASE}/studio/deployments/${deploymentId}/status`, {
        method: 'GET',
        headers: authHeaders,
      });
      const statusData = JSON.parse(statusRes.data);
      if (!statusData.success) continue;
      const info = statusData.data;
      console.log(`[Status] ${info.status} | ${info.deploymentStatus || 'N/A'}`);
      if (info.isTerminal) {
        if (info.status === 'completed') {
          console.log('\n🎉 Deployed:', info.serviceUrl);
          process.exit(0);
        }
        console.error('\nDeployment logs:', info.buildLogs || info.errorMessage || info.deploymentStatus);
        throw new Error(info.errorMessage || `Deployment failed: ${info.status}`);
      }
    }
    throw new Error('Deployment timed out');
  } finally {
    rmSync(staging, { recursive: true, force: true });
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  }
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
