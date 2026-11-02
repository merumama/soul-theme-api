// ローカル確認用サーバー（本番では使いません）
//   node scripts/dev-server.mjs            … ダミーデータで表示
//   MOCK=long  node scripts/dev-server.mjs … 長い文章で表示
//   MOCK=error node scripts/dev-server.mjs … 取得エラー時の表示
//   GAS_URL=... GAS_TOKEN=... MOCK=off node scripts/dev-server.mjs … 実際のGASにつないで表示
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import handler from '../netlify/functions/today.mjs';

const root = fileURLToPath(new URL('../public/', import.meta.url));
const port = Number(process.env.PORT) || 8888;
const mock = process.env.MOCK || 'short';
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };

const LONG = 'うまくいかない日があってもいい。\n思うように進めなかった自分を責める前に、ここまで歩いてきた道のりを少しだけ振り返ってみませんか。あなたが大切にしてきたものは、今日もちゃんとあなたの中にあります。';

if (mock !== 'off') {
  process.env.GAS_URL ||= 'https://example.invalid/exec';
  process.env.GAS_TOKEN ||= 'dev';
  process.env.START_DATE ||= '2026-11-01';
  globalThis.fetch = async () => {
    if (mock === 'error') throw new Error('mock error');
    const messages = Array.from({ length: 60 }, (_, i) => ({
      no: i + 1, theme: `テーマ${Math.floor(i / 10) + 1}`, themeNo: (i % 10) + 1,
      text: mock === 'long' ? LONG : '誰かの普通が、あなたの普通とは限らない。',
    }));
    return new Response(JSON.stringify({ ok: true, messages }));
  };
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname === '/api/today') {
    const r = await handler(new Request(url), {});
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(await r.text());
    return;
  }
  const path = normalize(join(root, url.pathname === '/' ? 'index.html' : url.pathname));
  if (!path.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(path);
    res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(port, () => console.log(`http://localhost:${port}  (MOCK=${mock})`));
