import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../netlify/functions/today.mjs';
import { sampleMessages } from './fixtures.mjs';

const realFetch = globalThis.fetch;
const env = { GAS_URL: 'https://script.google.com/macros/s/TEST/exec', GAS_TOKEN: 'secret-token', START_DATE: '2026-11-01' };

function setup(fetchImpl, overrides = {}) {
  Object.assign(process.env, env, overrides);
  globalThis.fetch = fetchImpl;
}
test.afterEach(() => {
  globalThis.fetch = realFetch;
  for (const k of Object.keys(env)) delete process.env[k];
});

const okResponse = (messages) => async () =>
  new Response(JSON.stringify({ ok: true, messages }), { headers: { 'Content-Type': 'application/json' } });
const call = (now) => handler(new Request('http://localhost/api/today'), {}, { now: new Date(now) });

test('今日のメッセージだけを返し、テーマや番号・トークンは返さない', async () => {
  let calledUrl;
  setup(async (url) => { calledUrl = String(url); return okResponse(sampleMessages())(); });
  const res = await call('2026-11-02T03:00:00Z');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(Object.keys(body).sort(), ['date', 'message', 'ok', 'phrases']);
  assert.equal(body.date, '2026-11-02');
  assert.match(calledUrl, /token=secret-token/);
  assert.ok(!JSON.stringify(body).includes('secret-token'));
  // CDN キャッシュは日付をまたがない
  assert.equal(res.headers.get('Netlify-CDN-Cache-Control'), 'public, s-maxage=300');
});

test('午前0時直前はキャッシュ時間が短くなる', async () => {
  setup(okResponse(sampleMessages()));
  const res = await call('2026-11-02T14:59:30Z');
  assert.equal(res.headers.get('Netlify-CDN-Cache-Control'), 'public, s-maxage=30');
});

test('スプレッドシートの文章修正がそのまま反映される', async () => {
  const msgs = sampleMessages();
  setup(okResponse(msgs));
  const first = await (await call('2026-11-02T03:00:00Z')).json();
  const edited = msgs.map((m) => (m.text === first.message ? { ...m, text: '修正後の文章です。' } : m));
  globalThis.fetch = okResponse(edited);
  const second = await (await call('2026-11-02T03:00:00Z')).json();
  assert.equal(second.message, '修正後の文章です。');
});

for (const [name, impl] of [
  ['ネットワークエラー', async () => { throw new TypeError('fetch failed'); }],
  ['HTTP 500', async () => new Response('error', { status: 500 })],
  ['HTML が返る（公開設定ミス）', async () => new Response('<html>ログイン</html>')],
  ['トークン不一致', async () => new Response(JSON.stringify({ ok: false, error: 'unauthorized' }))],
  ['0件', okResponse([])],
  ['タイムアウト', async () => { throw new DOMException('timeout', 'TimeoutError'); }],
]) {
  test(`取得失敗時は 502 と簡潔なエラー（${name}）`, async () => {
    setup(impl);
    const res = await call('2026-11-02T03:00:00Z');
    assert.equal(res.status, 502);
    assert.deepEqual(await res.json(), { ok: false, error: 'fetch_failed' });
    assert.equal(res.headers.get('Cache-Control'), 'no-store');
  });
}

test('環境変数が不足していれば 500', async () => {
  setup(okResponse(sampleMessages()), { GAS_TOKEN: '' });
  const res = await call('2026-11-02T03:00:00Z');
  assert.equal(res.status, 500);
});

test('文節（phrases）をつなげると本文と一致する', async () => {
  setup(okResponse(sampleMessages()));
  const body = await (await call('2026-11-02T03:00:00Z')).json();
  assert.ok(Array.isArray(body.phrases) && body.phrases.length > 1);
  assert.equal(body.phrases.join(''), body.message);
});
