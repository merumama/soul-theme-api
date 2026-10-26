-- =====================================================================
-- ソウルダイエット 週次ジャーナル：Supabase 初期設定
-- Supabase ダッシュボード → SQL Editor に全文を貼り付けて「Run」してください。
-- 何度実行しても壊れないように書いてあります。
-- 最後の「コーチ登録」の行だけ、ご自分のメールアドレスに書き換えてください。
-- =====================================================================

-- ---------- テーブル ----------

-- 利用できる人の名簿（ここに登録されたメールアドレスだけがログインできる）
create table if not exists public.members (
  email        text primary key check (email = lower(email)),
  user_id      uuid unique references auth.users(id) on delete set null,
  display_name text not null default '',
  role         text not null default 'client' check (role in ('client', 'coach')),
  created_at   timestamptz not null default now()
);

-- 1週間分のシート
create table if not exists public.weekly_entries (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  week_no      int  not null default 1,
  period_start date,
  content      jsonb not null default '{}'::jsonb,
  status       text not null default 'draft',
  plan_submitted_at timestamptz,
  submitted_at timestamptz,
  plan_notified_at  timestamptz,
  final_notified_at timestamptz,
  reminder_sent_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists weekly_entries_client_idx on public.weekly_entries (client_id, week_no);

-- コーチからのフィードバック（項目ごとに1つ + 全体)
create table if not exists public.feedback (
  id         uuid primary key default gen_random_uuid(),
  entry_id   uuid not null references public.weekly_entries(id) on delete cascade,
  section    text not null check (section in ('s01','s02','s03','s04','s05','s06','overall')),
  body       text not null,
  coach_id   uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entry_id, section)
);

-- ---------- 関数・トリガー ----------

create or replace function public.is_coach()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.members where user_id = auth.uid() and role = 'coach');
$$;

-- 名簿に無いメールアドレスでは新規ログインできないようにする
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  update public.members set user_id = new.id where email = lower(new.email);
  if not found then
    raise exception 'not_a_member';
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 名簿に追加した時点で、すでにログイン済みの人なら紐付ける
create or replace function public.members_before_write()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  new.email := lower(trim(new.email));
  if new.user_id is null then
    select id into new.user_id from auth.users where lower(email) = new.email;
  end if;
  return new;
end;
$$;

drop trigger if exists members_before_write on public.members;
create trigger members_before_write
  before insert or update on public.members
  for each row execute function public.members_before_write();

-- 2段階提出（プラン提出 → 最終提出）。ステータスと、プラン提出後の 01〜03 の固定
alter table public.weekly_entries add column if not exists plan_submitted_at timestamptz;

alter table public.weekly_entries drop constraint if exists weekly_entries_status_check;
alter table public.weekly_entries add constraint weekly_entries_status_check
  check (status in ('draft', 'plan_submitted', 'submitted'));

-- 提出日時を自動で入れる。プラン提出後は 01〜03 と週・期間を変えられないようにする
create or replace function public.entries_before_write()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.client_id  := old.client_id;
    new.created_at := old.created_at;
    if old.status = 'plan_submitted' then
      new.week_no      := old.week_no;
      new.period_start := old.period_start;
      new.content := new.content || jsonb_build_object(
        's01', coalesce(old.content -> 's01', '{}'::jsonb),
        's02', coalesce(old.content -> 's02', '{}'::jsonb),
        's03', coalesce(old.content -> 's03', '{}'::jsonb));
      if new.status = 'draft' then
        new.status := 'plan_submitted';
      end if;
      new.plan_submitted_at := old.plan_submitted_at;
    end if;
  end if;
  if new.status in ('plan_submitted', 'submitted') and new.plan_submitted_at is null then
    new.plan_submitted_at := now();
  end if;
  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status <> 'submitted') then
    new.submitted_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists entries_before_write on public.weekly_entries;
create trigger entries_before_write
  before insert or update on public.weekly_entries
  for each row execute function public.entries_before_write();

create or replace function public.feedback_before_write()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists feedback_before_write on public.feedback;
create trigger feedback_before_write
  before update on public.feedback
  for each row execute function public.feedback_before_write();

-- ---------- アクセス権（RLS） ----------

alter table public.members        enable row level security;
alter table public.weekly_entries enable row level security;
alter table public.feedback       enable row level security;

revoke all on public.members, public.weekly_entries, public.feedback from anon;
grant select, insert, update, delete on public.members, public.weekly_entries, public.feedback to authenticated;
grant execute on function public.is_coach() to authenticated;
-- 送信の記録（*_notified_at, reminder_sent_at）はサーバーだけが書く
revoke insert, update on public.weekly_entries from authenticated;
grant insert (week_no, period_start, content) on public.weekly_entries to authenticated;
grant update (week_no, period_start, content, status) on public.weekly_entries to authenticated;

-- members：本人は自分の行だけ見られる。コーチは全員を見て、追加・編集できる
drop policy if exists members_select on public.members;
create policy members_select on public.members for select to authenticated
  using (user_id = auth.uid() or public.is_coach());
drop policy if exists members_coach_write on public.members;
create policy members_coach_write on public.members for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

-- weekly_entries：クライアントは自分のシートだけ。最終提出後は編集不可、プラン提出後は削除不可。コーチは閲覧のみ
drop policy if exists entries_select on public.weekly_entries;
create policy entries_select on public.weekly_entries for select to authenticated
  using (client_id = auth.uid() or public.is_coach());
drop policy if exists entries_insert on public.weekly_entries;
create policy entries_insert on public.weekly_entries for insert to authenticated
  with check (client_id = auth.uid() and status = 'draft');
drop policy if exists entries_update on public.weekly_entries;
create policy entries_update on public.weekly_entries for update to authenticated
  using (client_id = auth.uid() and status in ('draft', 'plan_submitted'))
  with check (client_id = auth.uid());
drop policy if exists entries_delete on public.weekly_entries;
create policy entries_delete on public.weekly_entries for delete to authenticated
  using (client_id = auth.uid() and status = 'draft');

-- feedback：コーチが書く。クライアントは自分の提出済みシートへのものだけ読める
drop policy if exists feedback_select on public.feedback;
create policy feedback_select on public.feedback for select to authenticated
  using (
    public.is_coach()
    or exists (
      select 1 from public.weekly_entries e
      where e.id = entry_id and e.client_id = auth.uid() and e.status = 'submitted'
    )
  );
drop policy if exists feedback_coach_write on public.feedback;
create policy feedback_coach_write on public.feedback for all to authenticated
  using (public.is_coach())
  with check (
    public.is_coach()
    and exists (select 1 from public.weekly_entries e where e.id = entry_id and e.status = 'submitted')
  );

-- ※ 招待・お知らせ・リマインドのメールを使うときは、journal_notify.sql も実行する（毎朝のリマインド予約）

-- ---------- コーチ登録 ----------
-- ↓ 'coach@example.com' をご自分のメールアドレスに書き換えてから実行してください
insert into public.members (email, display_name, role)
values ('coach@example.com', 'コーチ', 'coach')
on conflict (email) do update set role = 'coach';
