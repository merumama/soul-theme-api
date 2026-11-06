
# Soul Theme Diagnosis API (Skeleton)

**状況復旧用の最短ルート**として、外部APIの雛形を用意しました。ユキちゃんの「最新マスタJSON」を `data/dragon_head_ranges.json` に置き換えれば即稼働します。

## 仕様（確定事項に合わせて実装）
- 入力: `{ "birthdate": "YYYY-MM-DD" }` または `YYYY/MM/DD`
- 出力: 
```
{
  "dragon_head_zodiac": "○○座",
  "dragon_tail_zodiac": "○○座",
  "soul_theme": "●-●",
  "reverse_theme": "●-●"
}
```
- 対応範囲: 1936-09-15 ～ 2048-04-11（公式マスタ必須）
- エンドポイント:
  - `GET /health`
  - `POST /diagnose`

## 必要ファイル
- `data/dragon_head_ranges.json` : 公式マスタ（date→Dragon Head星座）。**ユキちゃんの最新版で上書き**してください。
  - 期待スキーマ: `[ { "start":"YYYY-MM-DD", "end":"YYYY-MM-DD", "dragon_head_zodiac":"牡牛座" }, ... ]`
- `data/zodiac_theme_map.json` : 星座→(Tail星座 / 魂テーマ / 逆魂テーマ)。現在は **5つの検証用星座のみ事前登録**。残り7星座は追記してください。

## ローカル実行
```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
# 確認
curl -s http://127.0.0.1:8000/health
curl -s -X POST http://127.0.0.1:8000/diagnose -H "Content-Type: application/json" -d '{"birthdate":"1970-07-24"}'
```

## テスト（5件の検証データ）
```bash
pytest -q
```
> マスタ未投入の間は 422/500 を返します。マスタ投入後は **5件が200 & 期待JSON** で通ります。

## デプロイのヒント
- Render, Railway, HuggingFace Spaces, Fly.io などどこでも FastAPI を動かせます。
- 例: Render (無料枠)
  1) GitHubへ本ディレクトリをpush
  2) Renderで New Web Service → Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
  3) Auto deploy ON
- 例: HuggingFace Spaces (Gradioでなく**Docker**/FastAPI)
  - Space SDK = Docker を選び、Dockerfile で `uvicorn` 起動。

## GPTs Actions 設定（例）
- **OpenAPI**: ランタイムの `https://<your-app-domain>/openapi.json` を指定
- **Operation**: `POST /diagnose`
- **Request schema**:
```json
{ "type": "object", "properties": { "birthdate": { "type": "string" } }, "required": ["birthdate"] }
```
- **Response schema** は本APIのOpenAPIから自動読込可能。

## ファイル配置
```
soul_theme_api/
  app/
    main.py
  data/
    dragon_head_ranges.json      # ここをあなたの公式マスタで置換
    zodiac_theme_map.json        # 5星座済み。残りを追記
  tests/
    test_cases.py
  requirements.txt
  README.md
```

--
この雛形は**占星ロジックの“推測”を一切せず**、**公式マスタのみを参照**する構造です。
不具合時は `500/422` で明示的に知らせます（黙って誤判定しません）。

## デプロイ手順（Render）
1. このフォルダをGitHubにpush
2. Render → New → Web Service
3. リポジトリを選択し、以下を設定
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Deploy → 完了後 `https://<your-service>.onrender.com/openapi.json` を GPTs Actions に設定

## デプロイ手順（HuggingFace Spaces / Docker）
1. New Space → SDK: **Docker**
2. このフォルダをアップロード（`Dockerfile` 同梱済み）
3. Space起動後のURL `https://huggingface.co/spaces/<user>/<space>` を開き、
   実際のAPIは `https://<random-subdomain>.hf.space` の方（OpenAPI: `/openapi.json`）
4. その `/openapi.json` を GPTs Actions に設定

## GPTs Actions 設定ヒント
- OpenAPI URL: `<デプロイURL>/openapi.json`
- Operation: `POST /diagnose`
- Request Body: `{ "birthdate": "YYYY-MM-DD" }`
- Response: `{"dragon_head_zodiac":"○○座","dragon_tail_zodiac":"○○座","soul_theme":"●-●","reverse_theme":"●-●"}`

## 週次ジャーナル（ソウルダイエット）
- 画面：`/journal/`（スマホ対応。クライアントが毎週記入・提出、コーチが閲覧・コメント）
- データ保存：Supabase。環境変数 `SUPABASE_URL` / `SUPABASE_ANON_KEY` が無い間は端末内だけの「お試しモード」
- セットアップ手順：`supabase/JOURNAL_SETUP.md`

## 意識学 用語集（`/glossary`）
Excel の用語集を、スマホでも見やすく・検索できる Web ページにしたもの。
- 「あ行」「か行」…のタブで絞り込み、ことば・読み方・意味のどれでも検索（カタカナ／ひらがな・濁点の違いは無視）
- 関連ワードをタップすると、そのことばで検索
- **合言葉（固定パスワード）を知っている人だけが見られる**。用語データはパスワードで暗号化（AES-256-GCM）して HTML に埋め込んでいるので、公開リポジトリでも中身は読めない
- 「この端末で記憶する」にチェックすると次回から入力不要

### Netlify に置く（おすすめ・速い）
`glossary-netlify/` フォルダの中身は `index.html` だけ。Netlify で「Add new site → Deploy manually」を開き、
`glossary-netlify` フォルダをそのままドラッグ＆ドロップすれば公開される（無料・待ち時間なし）。
更新のときは、同じサイトの「Deploys」画面に新しいフォルダをドロップし直す。

### 用語を追加・修正したとき／パスワードを変えたいとき
```bash
pip install openpyxl cryptography
python tools/build_glossary.py 用語集.xlsx   # パスワードを聞かれる（Render用・Netlify用の両方を作る）
git add static/glossary.html glossary-netlify && git commit -m "用語集を更新" && git push
```
元の Excel はリポジトリに入れないこと（中身が丸見えになるため）。
