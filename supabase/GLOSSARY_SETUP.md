# 意識学 用語集：Supabase の設定手順

用語集は **用語集専用の新しい Supabase プロジェクト** を使います。
ジャーナル（ソウルダイエット）のプロジェクトは名簿にない人の登録を止める設定になっていて、
ログインメールもソウルダイエット用なので、混ぜずに分けています。

## しくみ
- メンバーは用語集のページでメールアドレスを入れる → 届いた確認コードを入れる → 名前を登録
- 登録しただけでは見られない（「承認待ち」と表示される）
- 管理者が `glossary_members` 表の `approved` にチェックを入れた人だけが用語を読める
- やめた人は `approved` のチェックを外す（または行を削除）だけで、次から見られなくなる
- 用語は Supabase の中だけに置く（GitHub にも Netlify にも中身は置かない）

## 最初の設定（1回だけ）

### 1. プロジェクトを作る
Supabase → **New project**
- Name：`ishikigaku-glossary` など
- Region：**Northeast Asia (Tokyo)**
- Database Password：自動生成でOK（どこかに控えておく）

### 2. 表と権限を作る
**SQL Editor** → `supabase/glossary_setup.sql` を全文貼り付けて **Run**

### 3. 用語を取り込む
**SQL Editor** → `glossary_terms.sql`（Excel から作ったもの）を全文貼り付けて **Run**
（作り方は下の「用語を更新するとき」）

### 4. メールの送り先を設定する（必須）
Supabase 標準のメールは **プロジェクトのメンバー宛てにしか届かず、1時間に数通まで** なので、
ジャーナルと同じ Resend をつなぐ。

**Authentication → Emails → SMTP Settings** → Enable custom SMTP
- Sender email：`noreply@be-quem.com`
- Sender name：`意識学 用語集`
- Host：`smtp.resend.com` / Port：`465`
- Username：`resend`
- Password：Resend → API Keys で新しく作ったキー（`re_...`、Sending access）

### 5. メールの文面を日本語にする
**Authentication → Emails → Templates** の **Confirm sign up** と **Magic link** の2つを、同じ内容にする
（初めての人には Confirm sign up、2回目からの人には Magic link のメールが届く）

件名：
```
【意識学 用語集】確認コード
```
本文：
```html
<p>意識学 用語集のログイン用の確認コードです。</p>
<p style="font-size:28px; font-weight:bold; letter-spacing:4px;">{{ .Token }}</p>
<p>用語集のページに戻って、このコードを入力してください。<br>
（このメールに心当たりがない場合は、何もせずに削除してください）</p>
```

### 6. ページの URL を登録する
**Authentication → URL Configuration**
- Site URL：`https://ishikigaku-yougo-2026.netlify.app`

### 7. 一度にたくさん登録が来るとき
**Authentication → Rate Limits** の「Rate limit for sending emails」を 100 くらいにしておくと、
案内した直後に登録が集中しても止まりにくい。（Resend の無料枠は1日100通・月3,000通で、ジャーナルと共有）

### 8. ページに接続先を入れる
**Project Settings → API（Data API）** の **Project URL** と **Publishable key（`sb_publishable_...`）** を
`glossary-netlify/index.html` の `SUPABASE_URL` / `SUPABASE_KEY` に入れて、Netlify の Deploys にドロップする。
（どちらも公開して大丈夫な値。Secret key は絶対に入れない）

## ふだんの運用

### 承認する
**Table Editor → glossary_members**
- 新しく登録した人は `approved` が `FALSE` で並ぶ
- 受講生と確認できたら、その行の `approved` を `TRUE` にして **Save**
- `memo` 欄には「13期」など自由にメモできる

### やめた人
同じ表で `approved` を `FALSE` に戻す（または行を削除）。次にページを開いたときから見られなくなる。
`FALSE` にしておけば、もう一度登録されても勝手に見られるようにはならない。

### 用語を更新するとき
- 1語だけ直す：**Table Editor → glossary_terms** で直接書き換えて Save（すぐ反映）
- Excel からまとめて入れ替える：
  ```bash
  pip install openpyxl
  python tools/glossary_to_sql.py 用語集.xlsx > glossary_terms.sql
  ```
  できた `glossary_terms.sql` を SQL Editor で Run（いったん全部消してから入れ直す）。
  このファイルには用語集の中身が入るので、リポジトリには入れないこと。

### 管理者を増やす・引き継ぐ
Supabase の **Organization → Team** から招待する。

### 注意
- 無料プランは **1週間だれもアクセスしないとプロジェクトが一時停止** する。
  止まったら Supabase の管理画面で **Restore** を押せば戻る。
- 画面のスクリーンショットやコピーは仕組みでは止められないので、「受講生限定」の案内は運用で。
