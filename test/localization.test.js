import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDate, formatMoney, getLocalizationParity, setActiveLanguage } from '../src/localization.js';

test('English and Indonesian localization dictionaries stay in parity', () => {
  const parity = getLocalizationParity();
  assert.deepEqual(parity.missingEnglish, []);
  assert.deepEqual(parity.missingIndonesian, []);
});

test('compact money uses locale-specific suffixes and decimal separators', () => {
  assert.equal(formatMoney(850_000, 'en'), 'Rp 850K');
  assert.equal(formatMoney(1_250_000, 'en'), 'Rp 1.3M');
  assert.equal(formatMoney(2_500_000_000, 'en'), 'Rp 2.5B');
  assert.equal(formatMoney(850_000, 'id'), 'Rp 850 RB');
  assert.equal(formatMoney(1_250_000, 'id'), 'Rp 1,3 JT');
  assert.equal(formatMoney(2_500_000_000, 'id'), 'Rp 2,5 M');
  assert.equal(formatMoney(1_500_000, 'id', { compact: false }), 'Rp 1.500.000');
  setActiveLanguage('en');
});

test('date formatting follows the selected locale and Jakarta timezone', () => {
  const instant = '2026-01-15T17:30:00.000Z';
  assert.match(formatDate(instant, 'en'), /Jan 16, 2026/);
  assert.match(formatDate(instant, 'id'), /16 Jan 2026/);
});
