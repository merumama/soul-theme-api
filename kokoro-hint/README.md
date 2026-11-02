# 今日のココロのヒント（SOUL DIET）

公式LINEのリッチメニューから開く、1日1つのメッセージを表示するWebアプリです。

## 構成

```
ブラウザ（LINE内ブラウザ / スマホ / PC）
   │  GET /api/today                    ← 今日の日付と本文だけを受け取る
   ▼
Netlify Function（netlify/functions/today.mjs）
   │  GAS_URL + 合言葉（GAS_TOKEN）     ← Netlify の環境変数にだけ保存
   ▼
Google Apps Script（gas/Code.gs）       ← スプレッドシートに紐づくスクリプト
   ▼
Googleスプレッドシート「メッセージ一覧」
```

| ファイル | 役割 |
| --- | --- |
| `public/` | 画面（HTML / CSS / JavaScript）。フレームワークなし |
| `netlify/functions/today.mjs` | GASからデータを取り、今日の1件だけを返す |
| `lib/selector.mjs` | 日替わりの選択ロジック |
| `lib/phrases.mjs` | 文章を文節に区切る（[BudouX](https://github.com/google/budoux)）。iPhoneでも単語の途中で改行されないようにするため |
| `gas/Code.gs` | スプレッドシートを読むGAS（合言葉が一致したときだけ応答） |
| `test/` | 自動テスト（`npm test`） |
| `scripts/` | ローカル確認用サーバー、表示順の一覧表示 |

ブラウザに渡るのは「日付」と「今日のメッセージ本文」だけです。GASのURL・合言葉・テーマ名・通し番号・他の日のメッセージはブラウザに出ません。

## 日替わりの仕組み

1. 全メッセージをテーマごとに分け、テーマ内番号（C列）の順に並べます。
2. 各テーマから1つずつ取り出して6日分を1ラウンドとし、ラウンドごとにテーマの順番を入れ替えます（固定の乱数で決まるため、何度計算しても同じ順番）。
   - 6日ごとに6テーマが必ず1回ずつ出ます
   - 同じテーマは2日続きません（60日目→61日目の境目も含む）
3. 「開始日からの経過日数 ÷ 件数 の余り」で今日のメッセージを決めます。60件なら60日で一巡し、61日目から同じ順番で繰り返します。
4. 日付は日本時間（Asia/Tokyo）で判定し、午前0時に切り替わります。サーバー側で計算するため、見る人の端末の時計がずれていても全員同じメッセージになります。

開始日（`START_DATE`）は未設定でも動きます（その場合は 2026-11-01 を起点に計算）。公開日が決まり「公開初日に表示順の1番目を出したい」ときだけ、Netlify の環境変数に設定して再デプロイしてください。

60日分の表示順は次のコマンドで確認できます。

```bash
node scripts/preview-schedule.mjs 2026-11-01
```

## 初期設定

### 1. GAS（スプレッドシート側）

1. スプレッドシートを開き、**拡張機能 → Apps Script**
2. `Code.gs` の中身を全部消し、このリポジトリの `gas/Code.gs` を貼り付けて保存
3. 関数 `setupToken` を選んで **実行**（初回は権限の承認画面が出ます）
   → 実行ログに表示された合言葉（長い英数字）を控える
4. 関数 `checkMessages` を実行し、ログに「件数: 60」とテーマ別に10件ずつ出ることを確認
5. **デプロイ → 新しいデプロイ → 種類：ウェブアプリ**
   - 次のユーザーとして実行：**自分**
   - アクセスできるユーザー：**全員**
   - デプロイ → 表示された「ウェブアプリのURL」（`.../exec`）を控える

> 「全員」にしても、合言葉なしでアクセスすると `unauthorized` しか返らず、メッセージは読めません。スプレッドシート自体の共有設定は変わりません。

### 2. Netlify

1. Netlify で **Add new site → Import an existing project → GitHub** から `soul-theme-api` を選択
2. ビルド設定
   - Branch：公開するブランチ（通常 `main`）
   - **Base directory：`kokoro-hint`**
   - Build command：空欄 ／ Publish directory：`kokoro-hint/public`（`netlify.toml` で自動設定）
3. **Site configuration → Environment variables** に登録

   | 名前 | 値 |
   | --- | --- |
   | `GAS_URL` | GASのウェブアプリURL（`https://script.google.com/macros/s/…/exec`） |
   | `GAS_TOKEN` | `setupToken` で表示された合言葉 |
   | `START_DATE` | （任意）開始日（例 `2026-11-10`）。この日に表示順の1番目が出ます。未設定でも動きます |

4. **Deploys → Trigger deploy** で再デプロイ（環境変数は再デプロイ後に反映）
5. `https://（サイト名）.netlify.app/` を開いて表示を確認し、`/api/today` を開くと `{"ok":true,"date":"…","message":"…"}` が出ることを確認
6. LINE公式アカウントのリッチメニューのリンク先にこのURLを設定

## スプレッドシートの更新方法

| やりたいこと | 方法 | 反映 |
| --- | --- | --- |
| 文章の修正・誤字直し | D列を書き換えるだけ | 最大約5分後 |
| セル内で改行したい | セル内改行（Mac: ⌘+Enter / Win: Alt+Enter） | そのまま画面でも改行 |
| メッセージを追加・削除 | 行を追加／削除（A〜D列をすべて記入） | 最大約5分後。**表示順が組み直される**ため、以後の並びが変わります |

- 文章はシートに書いたとおりに表示します（「」などは付けません）。
- シート名「メッセージ一覧」と列の並び（A:通し番号 / B:テーマ / C:テーマ内番号 / D:メッセージ）は変えないでください。
- **GASのコード（Code.gs）を書き換えた場合だけ**、デプロイ → デプロイを管理 → 編集 → バージョン「新バージョン」で更新してください（URLは変わりません）。文章の修正だけなら不要です。
- 表示順をまるごと変えたいときは、Netlify の環境変数 `SCHEDULE_SEED` に好きな数字を入れて再デプロイします。

## 開発・テスト

```bash
cd kokoro-hint
npm install                      # 初回のみ（BudouX を取得。Netlify では自動）
npm test                         # 自動テスト
node scripts/dev-server.mjs      # http://localhost:8888 でダミーデータ表示
MOCK=long  node scripts/dev-server.mjs   # 長文の表示確認
MOCK=error node scripts/dev-server.mjs   # エラー表示の確認
```

## トラブル時

| 症状 | 確認すること |
| --- | --- |
| 「読み込めませんでした」が出る | Netlify の Functions ログ（`[today]` から始まる行）を確認 |
| ログに「JSONではありません」 | GASのアクセス権が「全員」になっているか、URLが `/exec` で終わっているか |
| ログに「unauthorized」 | `GAS_TOKEN` とスクリプトプロパティ `API_TOKEN` が同じ値か |
| 環境変数を変えたのに変わらない | Netlify で再デプロイしたか |
