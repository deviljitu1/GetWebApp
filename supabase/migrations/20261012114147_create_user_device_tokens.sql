create table public.user_device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('android', 'ios', 'web')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index user_device_tokens_user_id_idx
  on public.user_device_tokens (user_id);

alter table public.user_device_tokens enable row level security;

grant select, insert, update, delete on public.user_device_tokens to authenticated;
grant all on public.user_device_tokens to service_role;

create policy "Users manage own device tokens"
  on public.user_device_tokens
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create trigger user_device_tokens_updated_at
  before update on public.user_device_tokens
  for each row execute function public.update_updated_at_column();
