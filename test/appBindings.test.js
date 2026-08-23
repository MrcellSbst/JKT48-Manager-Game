import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('graduation Save plan action is imported into App', async () => {
  const source = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const engineImport = source.match(/import \{([^}]+)\} from '\.\/engine\/gameEngine\.js';/s)?.[1] ?? '';
  assert.match(engineImport, /\bprepareGraduation\b/);
  assert.match(source, /prepareGraduation\(current, graduation\.id, options\)/);
});
