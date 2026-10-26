# 週次ジャーナル セットアップ手順

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
- （SMTP 設定後）**Authentication → Emails → Magic link or OTP / Confirm sign up** テンプレートを日本語にし、確認コードを足す（スマホでリンクが別のブラウザで開いてしまう場合でも、コード入力でログインできるようにするため）。テンプレートの編集には独自 SMTP の設定が必要
  ```html
  <p>確認コード：<b>{{ .Token }}</b></p>
  ```

## 3. アプリの接続先
接続先（Project URL と Publishable key）は `app/main.py` に組み込み済み。
別の Supabase プロジェクトに切り替えるときだけ、Render → soul-theme-api → **Environment** に追加する
- `SUPABASE_URL` = `https://xxxx.supabase.co`
- `SUPABASE_ANON_KEY` = Publishable key（`sb_publishable_...`）または anon key

※ Secret key / service_role key は絶対に入れないこと。

## 4. 使い始める
1. コーチが `/journal/` を開き、自分のメールアドレスでログイン
2. 「クライアントを追加」で名前とメールアドレスを登録
3. 「案内文をコピー」してクライアントに送る

## 本番運用で検討すること
- Supabase 標準のメール送信は1時間あたりの上限が小さいので、人数が増えたら
  **Authentication → Emails → SMTP Settings** で Resend などをつなぐ
- Render 無料プランは初回表示が遅いことがある（有料プランで解消）
