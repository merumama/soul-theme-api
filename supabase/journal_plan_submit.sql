-- =====================================================================
-- 「プラン提出」→「最終提出」の2段階提出に対応する変更
-- journal_setup.sql を実行済みのデータベースで、1回だけ実行してください。
-- （新しく作る場合は journal_setup.sql だけで、この内容も入ります）
-- =====================================================================

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

-- クライアントは最終提出まで編集できる（プラン提出後は 04〜06 だけがトリガーで反映される）
drop policy if exists entries_update on public.weekly_entries;
create policy entries_update on public.weekly_entries for update to authenticated
  using (client_id = auth.uid() and status in ('draft', 'plan_submitted'))
  with check (client_id = auth.uid());
