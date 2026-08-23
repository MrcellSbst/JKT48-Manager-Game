import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const CSS_FILES = ['src/styles.css', 'src/voucherAdmin.css'];
const PIXEL_VALUE = /(?:^|[^\w.-])\d*\.?\d+px(?:$|[^\w-])/i;

function fontDeclarations(source) {
  const declarations = [];
  let blockDepth = 0;
  let segmentStart = 0;
  let quote = null;
  let escaped = false;
  let comment = false;
  let parentheses = 0;
  const inspect = (end) => {
    const segment = source.slice(segmentStart, end).trim();
    const colon = segment.indexOf(':');
    if (colon < 0) return;
    const property = segment.slice(0, colon).trim().toLowerCase();
    if (property !== 'font' && property !== 'font-size') return;
    declarations.push({ property, value: segment.slice(colon + 1).trim() });
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (comment) {
      if (character === '*' && next === '/') { comment = false; index += 1; }
      continue;
    }
    if (!quote && character === '/' && next === '*') { comment = true; index += 1; continue; }
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") { quote = character; continue; }
    if (character === '(') { parentheses += 1; continue; }
    if (character === ')') { parentheses = Math.max(0, parentheses - 1); continue; }
    if (parentheses > 0) continue;
    if (character === '{') { blockDepth += 1; segmentStart = index + 1; continue; }
    if (character === ';' && blockDepth > 0) { inspect(index); segmentStart = index + 1; continue; }
    if (character === '}' && blockDepth > 0) { inspect(index); blockDepth -= 1; segmentStart = index + 1; }
  }
  return declarations;
}

test('font declarations use scalable units instead of pixels', async () => {
  for (const file of CSS_FILES) {
    const source = await readFile(file, 'utf8');
    const offenders = fontDeclarations(source).filter(({ value }) => PIXEL_VALUE.test(value));
    assert.deepEqual(offenders, [], `${file} contains pixel-based font declarations`);
  }
});

test('root font size follows the browser text-size preference', async () => {
  const source = await readFile('src/styles.css', 'utf8');
  assert.match(source, /:root\s*\{[^}]*font-size\s*:\s*100%/i);
});
