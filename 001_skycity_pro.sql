-- SKYCITY PRO schema. Run in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  display_name text not null default '',
  role text not null default 'player' check (role in ('player','admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.premium_entitlements (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  is_active boolean not null default true,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  granted_by uuid references public.profiles(id),
  note text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.premium_audit (
  id bigint generated always as identity primary key,
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  admin_user_id uuid not null references public.profiles(id),
  action text not null check (action in ('grant','revoke')),
  expires_at timestamptz,
  note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.game_rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  name text not null,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  is_private boolean not null default true,
  max_players int not null default 4 check (max_players between 2 and 4),
  created_at timestamptz not null default now()
);

create table if not exists public.match_results (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  room_id uuid references public.game_rooms(id) on delete set null,
  score int not null default 0,
  duration_ms int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists match_results_score_idx on public.match_results(score desc);
create index if not exists premium_audit_target_idx on public.premium_audit(target_user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.premium_entitlements enable row level security;
alter table public.premium_audit enable row level security;
alter table public.game_rooms enable row level security;
alter table public.match_results enable row level security;

drop policy if exists "profiles visible to signed-in users" on public.profiles;
create policy "profiles visible to signed-in users" on public.profiles for select to authenticated using (true);
drop policy if exists "users update own display name" on public.profiles;
create policy "users update own display name" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id and role = 'player');

drop policy if exists "users read own premium" on public.premium_entitlements;
create policy "users read own premium" on public.premium_entitlements for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "rooms visible to signed-in users" on public.game_rooms;
create policy "rooms visible to signed-in users" on public.game_rooms for select to authenticated using (true);

drop policy if exists "users read own results" on public.match_results;
create policy "users read own results" on public.match_results for select to authenticated using ((select auth.uid()) = user_id);

-- Profile is created automatically from auth signup metadata.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare uname text;
begin
  uname := coalesce(new.raw_user_meta_data ->> 'username', 'pilot_' || substr(new.id::text,1,8));
  insert into public.profiles(id, username, display_name)
  values(new.id, uname, coalesce(new.raw_user_meta_data ->> 'display_name',''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_skycity on auth.users;
create trigger on_auth_user_created_skycity after insert on auth.users
for each row execute procedure public.handle_new_user();

-- The trigger runs on auth signup; prevent direct API invocation of its privileged function.
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Admin role is deliberately not derived from editable user metadata.
-- Set the first admin manually in SQL Editor after registering the account.
