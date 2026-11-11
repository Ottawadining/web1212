-- My Sphere: the plates each signed-in visitor has saved.
-- Run once in Supabase -> SQL Editor. Safe to run again.
create table if not exists public.saved_plates (
  user_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  dish_id  uuid not null references public.dishes (id) on delete cascade,
  saved_at timestamptz not null default now(),
  primary key (user_id, dish_id)
);
create index if not exists saved_plates_user_recent on public.saved_plates (user_id, saved_at desc);

alter table public.saved_plates enable row level security;

-- each visitor sees, adds and removes only their own saves (and can only save published plates)
drop policy if exists "own saves: read" on public.saved_plates;
drop policy if exists "own saves: add" on public.saved_plates;
drop policy if exists "own saves: remove" on public.saved_plates;
create policy "own saves: read" on public.saved_plates for select to authenticated
  using (user_id = (select auth.uid()));
create policy "own saves: add" on public.saved_plates for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.dishes d where d.id = dish_id and d.published));
create policy "own saves: remove" on public.saved_plates for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.saved_plates from anon;
grant select, insert, delete on public.saved_plates to authenticated;
