#!/usr/bin/env node

const args = new Set(process.argv.slice(2));
const baseUrl = process.env.MANAGER_API_URL || process.env.API_URL;
const token = process.env.MANAGER_SESSION_TOKEN || process.env.SESSION_TOKEN;
if (!baseUrl) {
  console.error('Set MANAGER_API_URL to the deployed Manager API base URL.');
  process.exit(1);
}
if (!token) {
  console.error('Set MANAGER_SESSION_TOKEN to an administrator session token.');
  process.exit(1);
}

const limit = Number(process.env.MIGRATION_BATCH_SIZE || 25);
const commit = args.has('--commit');
let cursor = process.env.MIGRATION_CURSOR || '';
let totalMigrated = 0;
let totalVerified = 0;
let totalAlreadyMigrated = 0;
let totalFailed = 0;

async function call(path, options = {}) {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
    ...options,
    headers: { Cookie: `session_token=${encodeURIComponent(token)}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status}: ${body.error || 'Migration request failed.'}`);
  return body;
}

const status = await call('/api/admin/save-migration');
console.log(`Legacy: ${status.legacy}; v2: ${status.migrated}; remaining: ${status.remaining}; mode: ${commit ? 'COMMIT' : 'DRY RUN'}`);
do {
  const result = await call('/api/admin/save-migration', {
    method: 'POST',
    body: JSON.stringify({ cursor, limit, commit }),
  });
  totalMigrated += result.migrated?.length || 0;
  totalVerified += result.verified?.length || 0;
  totalAlreadyMigrated += result.alreadyMigrated?.length || 0;
  totalFailed += result.failed?.length || 0;
  if (result.migrated?.length) console.log(`${commit ? 'Migrated' : 'Validated'}: ${result.migrated.join(', ')}`);
  if (result.alreadyMigrated?.length) console.log(`Already migrated: ${result.alreadyMigrated.join(', ')}`);
  for (const failure of result.failed || []) console.error(`Failed ${failure.userId}: ${failure.error}`);
  cursor = result.nextCursor || '';
  if (!result.hasMore) break;
} while (true);

console.log(`${commit ? 'Migrated' : 'Validated'} ${totalMigrated} save(s); verified ${totalVerified}; already migrated ${totalAlreadyMigrated}; ${totalFailed} failure(s).`);
if (totalFailed) process.exitCode = 2;
