-- =====================================================================
-- 招待メール・提出のお知らせ・リマインドのための変更
-- Supabase の SQL Editor で1回だけ実行してください（何度実行しても大丈夫です）。
-- =====================================================================

-- お知らせ・リマインドを送ったかの記録（同じメールを二重に送らないため）
alter table public.weekly_entries
  add column if not exists plan_notified_at  timestamptz,
  add column if not exists final_notified_at timestamptz,
  add column if not exists reminder_sent_at  timestamptz;

-- サーバー（app/journal_api.py、Secret key）用。「新しいテーブルを自動的に公開」をオフにしたプロジェクトでは明示的に必要
grant select, insert, update, delete on public.members, public.weekly_entries, public.feedback to service_role;

-- クライアントが書き込める列を絞る（送信の記録はサーバーだけが書く）
revoke insert, update on public.weekly_entries from authenticated;
grant insert (week_no, period_start, content) on public.weekly_entries to authenticated;
grant update (week_no, period_start, content, status) on public.weekly_entries to authenticated;

-- 毎朝 9:00（日本時間）にリマインドを確認する。9:15 にもう一度呼ぶのは、
-- アプリのサーバーが寝ていて1回目に間に合わなかったときのため（二重には送られない）
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname in ('journal-reminders', 'journal-reminders-retry');
select cron.schedule('journal-reminders', '0 0 * * *', $$
  select net.http_post(
    url := 'https://soul-theme-api.onrender.com/journal/api/cron/reminders',
    body := '{}'::jsonb,
    timeout_milliseconds := 120000)
$$);
select cron.schedule('journal-reminders-retry', '15 0 * * *', $$
  select net.http_post(
    url := 'https://soul-theme-api.onrender.com/journal/api/cron/reminders',
    body := '{}'::jsonb,
    timeout_milliseconds := 120000)
$$);
