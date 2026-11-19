import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('docs/easy-p0-p1-migrations.json', 'utf8'));
const paths = manifest.migrations.map(entry => entry.path);
const diff = execFileSync('git', ['diff', '--name-status', manifest.base, '--', 'supabase/migrations'], { encoding: 'utf8' }).trim().split(/\r?\n/);
assert.equal(paths.length, 7);
assert.deepEqual(diff, paths.map(path => 'A\t' + path));
const generated = readFileSync('lib/backup/schema-files.generated.ts', 'utf8');
const snapshot = JSON.parse(generated.slice(generated.indexOf('= ') + 2));
for (const { path, sha256 } of manifest.migrations) {
  const content = readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
  assert.equal(createHash('sha256').update(content).digest('hex'), sha256, path);
  assert.equal(snapshot.find(row => row.name === path.replace('supabase/', 'schema/'))?.content, content, path);
}
console.log('Sete migrations conferidas por ordem, diff, SHA-256 e conteúdo do snapshot.');
