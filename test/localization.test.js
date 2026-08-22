import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDate, formatMoney, getLocalizationParity, setActiveLanguage, translateIndonesian } from '../src/localization.js';

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

test('reported gameplay surfaces translate dynamic Indonesian copy', () => {
  assert.equal(translateIndonesian('Sort by'), 'Urutkan Berdasarkan');
  assert.equal(translateIndonesian('Visible stat'), 'Statistik terlihat');
  assert.equal(translateIndonesian('Generation'), 'Generasi');
  assert.equal(translateIndonesian('Team'), 'Tim');
  assert.equal(translateIndonesian('Stat'), 'Stat');
  assert.equal(translateIndonesian('Festival Invitation'), 'Undangan Festival');
  assert.equal(
    translateIndonesian('New opportunity: Festival Invitation. Respond within two weeks.'),
    'Peluang baru: Undangan Festival. Tanggapi dalam dua minggu.',
  );
  assert.equal(translateIndonesian('+1 from last week'), '+1 dari minggu lalu');
  assert.equal(translateIndonesian('Unassigned day restores energy'), 'Hari tanpa penugasan memulihkan energi');
  assert.equal(translateIndonesian('Intensive Dance training'), 'Latihan tari intensif');
  assert.equal(
    translateIndonesian("Fans argue that Fiony's ability deserves more attention."),
    'Penggemar menilai kemampuan Fiony layak mendapat lebih banyak perhatian.',
  );
  assert.equal(
    translateIndonesian('Festival Invitation completed: Rp 24m revenue and 7,000 new fans.'),
    'Undangan Festival selesai: pendapatan Rp 24m dan 7,000 penggemar baru.',
  );
  assert.equal(
    translateIndonesian('Fiony leads a 12-member MV lineup with a medium budget. Production starts Year 1 · Jan · Week 3; release is Year 1 · Feb · Week 4.'),
    'Fiony memimpin lineup MV berisi 12 anggota dengan anggaran menengah. Produksi dimulai Tahun 1 · Jan · Minggu 3; rilis pada Tahun 1 · Feb · Minggu 4.',
  );
  assert.equal(
    translateIndonesian('Spend Rp 40m. Sales start now for Year 2 · Oct · Week 1; every active member receives 300 slots at Rp 50k.'),
    'Bayar Rp 40 jt. Penjualan dimulai sekarang untuk Tahun 2 · Okt · Minggu 1; setiap anggota aktif mendapat 300 slot seharga Rp 50 rb.',
  );
});
