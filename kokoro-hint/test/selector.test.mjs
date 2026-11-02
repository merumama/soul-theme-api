import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSchedule, pickMessage, jstDateString, secondsUntilJstMidnight, daysBetween, isValidDateString,
} from '../lib/selector.mjs';
import { sampleMessages, THEMES } from './fixtures.mjs';

const START = '2026-11-01';
const addDays = (ymd, n) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

test('同じ日は何度呼んでも同じメッセージ', () => {
  const msgs = sampleMessages();
  const a = pickMessage(msgs, '2026-12-24', START).message;
  for (let i = 0; i < 20; i++) {
    // 取得順がバラバラでも結果は同じ
    const shuffled = msgs.slice().sort(() => Math.random() - 0.5);
    assert.deepEqual(pickMessage(shuffled, '2026-12-24', START).message, a);
  }
});

test('日付が変わるとメッセージが切り替わる', () => {
  const msgs = sampleMessages();
  for (let d = 0; d < 120; d++) {
    const today = pickMessage(msgs, addDays(START, d), START).message;
    const tomorrow = pickMessage(msgs, addDays(START, d + 1), START).message;
    assert.notEqual(today.no, tomorrow.no);
  }
});

test('開始日に表示順の1番目、60日間で重複なし、61日目に最初へ戻る', () => {
  const msgs = sampleMessages();
  const schedule = buildSchedule(msgs);
  assert.equal(pickMessage(msgs, START, START).message, schedule[0]);
  const seen = new Set();
  for (let d = 0; d < 60; d++) seen.add(pickMessage(msgs, addDays(START, d), START).message.no);
  assert.equal(seen.size, 60);
  assert.equal(pickMessage(msgs, addDays(START, 60), START).message, schedule[0]);
  assert.equal(pickMessage(msgs, addDays(START, 125), START).message, schedule[5]);
});

test('テーマが偏らない：6日ごとに6テーマが1回ずつ・同じテーマが連続しない', () => {
  const schedule = buildSchedule(sampleMessages());
  for (let r = 0; r < 10; r++) {
    const block = schedule.slice(r * 6, r * 6 + 6).map((m) => m.theme);
    assert.equal(new Set(block).size, 6, `ラウンド${r + 1}`);
  }
  // 一巡の境目（60日目→61日目）も含めて連続なし
  for (let i = 0; i < 60; i++) {
    assert.notEqual(schedule[i].theme, schedule[(i + 1) % 60].theme, `index ${i}`);
  }
  // 各テーマはテーマ内番号の順に出る
  for (const t of THEMES) {
    const nums = schedule.filter((m) => m.theme === t).map((m) => m.themeNo);
    assert.deepEqual(nums, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  }
  // 単純な固定順の繰り返しではなく、ラウンドごとに順番が入れ替わる
  const orders = new Set();
  for (let r = 0; r < 10; r++) orders.add(schedule.slice(r * 6, r * 6 + 6).map((m) => m.theme).join(','));
  assert.ok(orders.size >= 8, `テーマ順のバリエーション: ${orders.size}`);
});

test('同じテーマの間隔は最大でも11日以内', () => {
  const schedule = buildSchedule(sampleMessages());
  for (const t of THEMES) {
    const idx = schedule.map((m, i) => (m.theme === t ? i : -1)).filter((i) => i >= 0);
    for (let k = 1; k < idx.length; k++) assert.ok(idx[k] - idx[k - 1] <= 11);
  }
});

test('件数がテーマごとに不揃いでも全件を重複なく使う', () => {
  const msgs = sampleMessages().filter((m) => !(m.theme === THEMES[0] && m.themeNo > 7));
  msgs.push({ no: 61, theme: THEMES[2], themeNo: 11, text: '追加' });
  const schedule = buildSchedule(msgs);
  assert.equal(schedule.length, msgs.length);
  assert.equal(new Set(schedule.map((m) => m.no)).size, msgs.length);
});

test('日本時間の午前0時で日付が切り替わる', () => {
  assert.equal(jstDateString(new Date('2026-11-01T14:59:59.999Z')), '2026-11-01'); // JST 23:59:59
  assert.equal(jstDateString(new Date('2026-11-01T15:00:00.000Z')), '2026-11-02'); // JST 00:00
  assert.equal(jstDateString(new Date('2026-12-31T15:00:00Z')), '2027-01-01');
  assert.equal(secondsUntilJstMidnight(new Date('2026-11-01T14:55:00Z')), 300);
  assert.equal(secondsUntilJstMidnight(new Date('2026-11-01T15:00:00Z')), 86400);

  const msgs = sampleMessages();
  const before = pickMessage(msgs, jstDateString(new Date('2026-11-01T14:59:59Z')), START).message;
  const after = pickMessage(msgs, jstDateString(new Date('2026-11-01T15:00:00Z')), START).message;
  assert.notEqual(before.no, after.no);
});

test('日付ユーティリティ', () => {
  assert.equal(daysBetween('2026-11-01', '2027-11-01'), 365);
  assert.equal(daysBetween('2027-03-01', '2027-03-31'), 30);
  assert.ok(isValidDateString('2026-11-01'));
  assert.ok(!isValidDateString('2026-02-30'));
  assert.ok(!isValidDateString('2026/11/01'));
  // 開始日より前の日付でもエラーにならない
  assert.ok(pickMessage(sampleMessages(), '2026-10-01', START).message);
});
