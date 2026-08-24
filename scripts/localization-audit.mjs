import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceFiles = [];
const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute);
    else if (/\.(jsx?|tsx?|json)$/.test(entry.name) && !absolute.includes(`${path.sep}test${path.sep}`)) sourceFiles.push(absolute);
  }
};
walk(path.join(root, 'src'));

const localizationSource = fs.readFileSync(path.join(root, 'src', 'localization.js'), 'utf8');
const localizedKeys = new Set([...localizationSource.matchAll(/(?:['"]([^'"\n]{3,})['"]|([A-Za-z_$][\w$]{2,}))\s*:/g)].map((match) => match[1] ?? match[2]));
const allowlist = new Set(['JKT48', 'JKT48V', 'MV', 'VC', 'M&G', 'Video Call', 'Meet & Greet', 'Center', 'Trainee', 'Setlist', 'Senbatsu', 'Sousenkyo', 'Request Hour', 'Janken', 'FouReality', 'FouReality JKT48 Gacha Photocard Oshi']);
const visibleStrings = new Map();
const add = (value, file) => {
  const text = value.replaceAll('&amp;', '&').replace(/\s+/g, ' ').trim();
  if (!/[A-Za-z]{3}/.test(text) || text.length < 4 || text.length > 240 || text === 'JKT48' || text.includes("browser's active run")) return;
  if (text.includes('${')) return;
  if (/^[a-z][A-Za-z0-9_.-]*$/.test(text) || /^https?:/.test(text)) return;
  if (allowlist.has(text) || text.startsWith('data:')) return;
  if (!visibleStrings.has(text)) visibleStrings.set(text, file);
};

for (const file of sourceFiles) {
  const relative = path.relative(root, file).replaceAll('\\', '/');
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/>([A-Za-z][^<>\n{}]{3,})</g)) add(match[1], relative);
  if (relative.endsWith('.jsx')) {
    for (const match of source.matchAll(/(?:placeholder|title|aria-label)\s*=\s*["']([^"']{3,})["']/g)) add(match[1], relative);
  }
  // Dynamic notifications and modal copy commonly enter through t('...').
  for (const match of source.matchAll(/(?:\bt|\btranslate(?:Indonesian)?|\blocalize)\(\s*['"`]([^'"`\n]{3,})['"`]\s*\)/g)) add(match[1], relative);
}

const missing = [...visibleStrings.entries()]
  .filter(([text]) => !localizedKeys.has(text))
  .map(([text, file]) => ({ text, file }));
const glossaryViolations = [...localizationSource.matchAll(/:\s*['"]([^'"\n]*kipas[^'"\n]*)['"]/gi)].map((match) => match[1]);
const report = { sourceFiles: sourceFiles.length, dictionaryKeys: localizedKeys.size, visibleStrings: visibleStrings.size, missingDirectKeys: missing.length, missing, allowlist: [...allowlist], glossaryViolations };
if (report.glossaryViolations.length || report.missingDirectKeys) process.exitCode = 1;
console.log(JSON.stringify(report, null, 2));
