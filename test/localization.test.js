import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCloudDateTime, formatDate, formatMoney, getLocalizationParity, LOCALIZATION_ALLOWLIST, LOCALIZATION_ID, localizeDocument, setActiveLanguage, translateIndonesian } from '../src/localization.js';

test('English and Indonesian localization dictionaries stay in parity', () => {
  const parity = getLocalizationParity();
  assert.deepEqual(parity.missingEnglish, []);
  assert.deepEqual(parity.missingIndonesian, []);
});

test('compact money uses locale-specific suffixes and decimal separators', () => {
  assert.equal(formatMoney(850_000, 'en'), 'FRL.850K');
  assert.equal(formatMoney(1_250_000, 'en'), 'FRL.1.3M');
  assert.equal(formatMoney(2_500_000_000, 'en'), 'FRL.2.5B');
  assert.equal(formatMoney(850_000, 'id'), 'FRL.850 RB');
  assert.equal(formatMoney(1_250_000, 'id'), 'FRL.1,3 JT');
  assert.equal(formatMoney(2_500_000_000, 'id'), 'FRL.2,5 M');
  assert.equal(formatMoney(1_500_000, 'id', { compact: false }), 'FRL.1.500.000');
  setActiveLanguage('en');
});

test('date formatting follows the selected locale and Jakarta timezone', () => {
  const instant = '2026-01-15T17:30:00.000Z';
  assert.match(formatDate(instant, 'en'), /Jan 16, 2026/);
  assert.match(formatDate(instant, 'id'), /16 Jan 2026/);
});

test('cloud save timestamps treat D1 timezone-less values as UTC before showing WIB', () => {
  const shown = formatCloudDateTime('2026-01-15 17:30:00', 'en');
  assert.match(shown, /Jan 16, 2026/);
  assert.match(shown, /12:30 AM/);
});

test('reported gameplay surfaces translate dynamic Indonesian copy', () => {
  assert.equal(translateIndonesian('Sort by'), 'Urutkan');
  assert.equal(translateIndonesian('Visible stat'), 'Statistik terlihat');
  assert.equal(translateIndonesian('Generation'), 'Generasi');
  assert.equal(translateIndonesian('Team'), 'Tim');
  assert.equal(translateIndonesian('Stat'), 'Stat');
  assert.equal(translateIndonesian('Graduation countdown'), 'Hitung mundur kelulusan');
  assert.equal(translateIndonesian('Graduation this week'), 'Kelulusan minggu ini');
  assert.equal(translateIndonesian('4 weeks until graduation'), '4 minggu menuju kelulusan');
  assert.equal(translateIndonesian('Unselect all'), 'Batalkan semua pilihan');
  assert.equal(translateIndonesian('Empty'), 'Kosongkan');
  assert.equal(translateIndonesian('Festival Invitation'), 'Undangan Festival');
  assert.equal(
    translateIndonesian('New opportunity: Festival Invitation. Respond within two weeks.'),
    'Peluang baru: Undangan Festival. Tanggapi dalam dua minggu.',
  );
  assert.equal(translateIndonesian('+1 from last week'), '+1 dari minggu lalu');
  assert.equal(translateIndonesian('Unassigned day restores energy'), 'Hari tanpa penugasan memulihkan energi');
  assert.equal(translateIndonesian('Intensive Dance training'), 'Latihan tari intensif');
  assert.equal(
    translateIndonesian('Campaign blocked: Video Call already occupies this month.'),
    'Kampanye belum dapat dimulai: Video Call sudah mengisi bulan ini.',
  );
  assert.equal(
    translateIndonesian("Fans argue that Fiony's ability deserves more attention."),
    'Penggemar menilai kemampuan Fiony layak mendapat lebih banyak perhatian.',
  );
  assert.equal(
    translateIndonesian('Festival Invitation completed: FRL24m revenue and 7,000 new fans.'),
    'Undangan Festival selesai: pendapatan FRL.24m dan 7,000 penggemar baru.',
  );
  assert.equal(
    translateIndonesian('Fiony leads a 12-member MV lineup with a medium budget. Production starts Year 1 · Jan · Week 3; release is Year 1 · Feb · Week 4.'),
    'Fiony memimpin susunan anggota MV berisi 12 anggota dengan anggaran menengah. Produksi dimulai Tahun 1 · Jan · Minggu 3; rilis pada Tahun 1 · Feb · Minggu 4.',
  );
  assert.equal(
    translateIndonesian('Spend FRL40m. Sales start now for Year 2 · Oct · Week 1; every active member receives 300 slots at FRL50k.'),
    'Bayar FRL.40 jt. Penjualan dimulai sekarang untuk Tahun 2 · Okt · Minggu 1; setiap anggota aktif mendapat 300 slot seharga FRL.50 rb.',
  );
  assert.equal(
    translateIndonesian("Feni's graduation moves to Year 3 · May · Week 1 to finish an existing campaign commitment."),
    "Feni mendapat jadwal kelulusan baru ke Tahun 3 · Mei · Minggu 1 untuk menyelesaikan komitmen kampanye yang sudah ada.",
  );
  assert.equal(
    translateIndonesian('The final departure is now Year 3 · May · Week 1, one week after the campaign commitment ends.'),
    'Keberangkatan terakhir sekarang Tahun 3 · Mei · Minggu 1, satu minggu setelah komitmen kampanye selesai.',
  );
  assert.equal(
    translateIndonesian("Feni's graduation moves to Year 3 · May · Week 2 so only one member graduates in each month."),
    'Feni mendapat jadwal kelulusan baru ke Tahun 3 · Mei · Minggu 2 agar hanya satu anggota lulus setiap bulan.',
  );
  assert.equal(
    translateIndonesian('The final departure is now Year 3 · May · Week 2; only one member can graduate in each calendar month.'),
    'Keberangkatan terakhir sekarang Tahun 3 · Mei · Minggu 2, hanya satu anggota yang dapat lulus setiap bulan kalender.',
  );
});

test('translator safely handles missing and non-string history fields', () => {
  assert.equal(translateIndonesian(undefined), '');
  assert.equal(translateIndonesian(null), '');
  assert.equal(translateIndonesian(12), '12');
});

test('document localization preserves canonical values for translated options', () => {
  const previous = {
    document: globalThis.document,
    Element: globalThis.Element,
    Node: globalThis.Node,
    MutationObserver: globalThis.MutationObserver,
  };
  class FakeElement {
    constructor(tagName) {
      this.tagName = tagName;
      this.attributes = new Map();
      this.childNodes = [];
      this.parentElement = null;
    }
    closest() { return null; }
    hasAttribute(name) { return this.attributes.has(name); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
  }
  class FakeMutationObserver {
    observe() {}
    disconnect() {}
  }
  const body = new FakeElement('BODY');
  const option = new FakeElement('OPTION');
  const text = { nodeType: 3, nodeValue: 'Wed', parentElement: option };
  option.parentElement = body;
  option.childNodes.push(text);
  body.childNodes.push(option);
  try {
    globalThis.Element = FakeElement;
    globalThis.Node = { TEXT_NODE: 3 };
    globalThis.MutationObserver = FakeMutationObserver;
    globalThis.document = { body };
    const cleanup = localizeDocument('id');
    assert.equal(text.nodeValue, 'Rab');
    assert.equal(option.getAttribute('value'), 'Wed');
    cleanup();
  } finally {
    globalThis.document = previous.document;
    globalThis.Element = previous.Element;
    globalThis.Node = previous.Node;
    globalThis.MutationObserver = previous.MutationObserver;
  }
});

test('Indonesian glossary uses clear fan wording and preserves official terms', () => {
  assert.equal(LOCALIZATION_ID.Fanbase, 'Jumlah Penggemar');
  assert.equal(LOCALIZATION_ID.Roster, 'Daftar Anggota');
  assert.equal(LOCALIZATION_ID.Lineup, 'Susunan Anggota');
  assert.equal(LOCALIZATION_ID.Occupancy, 'Keterisian');
  assert.equal(translateIndonesian('Fan event'), 'Acara Penggemar');
  assert.equal(translateIndonesian('Campaign blocked: Video Call already occupies this month.'), 'Kampanye belum dapat dimulai: Video Call sudah mengisi bulan ini.');
  assert.equal(translateIndonesian('Video Call'), 'Video Call');
  assert.equal(translateIndonesian('Meet & Greet'), 'Meet & Greet');
  assert.ok(LOCALIZATION_ALLOWLIST.includes('Center'));
  assert.equal(Object.values(LOCALIZATION_ID).filter((value) => /kipas/i.test(value)).length, 0);
});
