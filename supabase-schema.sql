-- Run this in Supabase Dashboard > SQL Editor before enabling src/supabase-config.js.
-- The browser only uses the anon key. Row Level Security keeps each account's private profile private.

create table if not exists public.customer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  profile jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.provider_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider_id text not null unique,
  profile jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.customer_profiles enable row level security;
alter table public.provider_profiles enable row level security;

create policy "Customer profiles are private to their owner"
  on public.customer_profiles for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Provider owners can manage their profile"
  on public.provider_profiles for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Published provider profiles are publicly readable"
  on public.provider_profiles for select
  using (coalesce((profile ->> 'isPublished')::boolean, false));
