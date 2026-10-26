# 週次ダイエットプラン セットアップ手順

アプリの場所：`https://soul-theme-api.onrender.com/journal/`
接続先を空にすると「お試しモード」で動きます（データはその端末だけに保存）。

## 1. データベースを作る（Supabase）
1. Supabase ダッシュボード → 左メニュー **SQL Editor** → **New query**
2. `supabase/journal_setup.sql` の中身を全部貼り付ける
3. 最後の行の `coach@example.com` をコーチ本人のメールアドレスに書き換える
4. **Run** を押す（"Success" と出ればOK）

## 2. ログインメールの設定（Supabase）
- **Authentication → URL Configuration**
  - Site URL：`https://soul-theme-api.onrender.com/journal/`
  - Redirect URLs：`https://soul-theme-api.onrender.com/journal/**` を追加
- **Authentication → Emails → SMTP Settings**（Resend）
  - Host `smtp.resend.com` / Port `465` / Username `resend` / Password = Resend の API キー
  - Sender `noreply@be-quem.com`（Resend で be-quem.com を Verified にしておく。DNS はエックスサーバーで設定済み）
- **Authentication → Emails → Templates**：「Magic link or OTP」「Confirm sign up」「Invite user」を日本語にする
  - 件名：`【ソウルダイエット】週次ダイエットプランログインのご案内`
  - 本文に `{{ .ConfirmationURL }}`（ログインボタン）と `{{ .Token }}`（確認コード）を入れる

## 3. アプリの接続先
接続先（Project URL と Publishable key）は `app/main.py` に組み込み済み。
別の Supabase プロジェクトに切り替えるときだけ、Render → soul-theme-api → **Environment** に追加する
- `SUPABASE_URL` = `https://xxxx.supabase.co`
- `SUPABASE_ANON_KEY` = Publishable key（`sb_publishable_...`）または anon key

※ Secret key / service_role key は絶対に入れないこと。

## 4. 使い始める
1. コーチが `/journal/` を開き、自分のメールアドレスでログイン
2. 「クライアントを追加」で名前とメールアドレスを登録
3. 追加すると招待メールが届く（届かないときは「招待メールを送る」ボタンか、案内文をコピーして送る）

## 本番運用で検討すること
- Supabase 標準のメール送信は1時間あたりの上限が小さいので、人数が増えたら
  **Authentication → Emails → SMTP Settings** で Resend などをつなぐ
- Render 無料プランは初回表示が遅いことがある（有料プランで解消）

## 5. 招待・提出のお知らせ・リマインドのメール
サーバー（`app/journal_api.py`）から送る。
- 招待：コーチがクライアントを追加したとき（Supabase の「Invite user」テンプレート）
- 提出のお知らせ：プラン提出・最終提出のたびに、コーチ全員へ（Resend から直接）
- リマインド：週の最終日（開始日 + 6日）の朝9時に、まだ最終提出していない人へ（Resend から直接）

設定すること
1. SQL Editor で `supabase/journal_notify.sql` を実行する（送信記録の列と、毎朝9時の pg_cron 予約）
2. Render → soul-theme-api → **Environment** に追加する（チャットやコードには書かないこと）
   - `SUPABASE_SECRET_KEY`：Supabase → Project Settings → API Keys → Secret key（`sb_secret_...`）
   - `RESEND_API_KEY`：Resend → API Keys で作ったキー（`re_...`、Sending access）

