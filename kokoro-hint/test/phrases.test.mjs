import test from 'node:test';
import assert from 'node:assert/strict';
import { splitPhrases } from '../lib/phrases.mjs';

test('文節に区切り、つなげると元の文に戻る', () => {
  for (const t of ['誰かの普通が、あなたの普通とは限らない。', '「これ好き！」に、理由はいらない。', 'ゆっくり息を吐く。それだけでも、自分に戻る時間になる。']) {
    const p = splitPhrases(t);
    assert.equal(p.join(''), t);
    assert.ok(p.length >= 2);
  }
  assert.deepEqual(splitPhrases('誰かの普通が、あなたの普通とは限らない。'), ['誰かの', '普通が、', 'あなたの', '普通とは', '限らない。']);
});

test('セル内改行は "\\n" の要素として残る', () => {
  const p = splitPhrases('一行目です。\n二行目です。');
  assert.ok(p.includes('\n'));
  assert.equal(p.join(''), '一行目です。\n二行目です。');
});
