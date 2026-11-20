import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(process.argv[2] ?? 'docs/easy-p0-p1-migrations.json', 'utf8'));
const paths = manifest.migrations.map(entry => entry.path);
const diff = execFileSync('git', ['diff', '--name-status', manifest.base, ...(manifest.released ? [manifest.released] : []), '--', 'supabase/migrations'], { encoding: 'utf8' }).trim().split(/\r?\n/);
assert.ok(paths.length > 0);
assert.deepEqual(paths, [...new Set(paths)].sort());
assert.deepEqual(diff, paths.map(path => 'A\t' + path));
const generated = readFileSync('lib/backup/schema-files.generated.ts', 'utf8');
const snapshot = JSON.parse(generated.slice(generated.indexOf('= ') + 2));
for (const { path, sha256 } of manifest.migrations) {
  const content = readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
  assert.equal(createHash('sha256').update(content).digest('hex'), sha256, path);
  assert.equal(snapshot.find(row => row.name === path.replace('supabase/', 'schema/'))?.content, content, path);
}
console.log(`${paths.length} migration(s) conferida(s) por ordem, diff, SHA-256 e conteúdo do snapshot.`);
