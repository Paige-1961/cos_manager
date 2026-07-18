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


-- V2 booking workflow
create table if not exists public.bookings (
  id text primary key,
  customer_user_id uuid not null references auth.users(id) on delete cascade,
  provider_user_id uuid references auth.users(id) on delete set null,
  provider_id text not null,
  service_id text not null,
  saved_plan_id text,
  plan_title text not null default '',
  customer_label text not null default '客户',
  preferred_date date not null,
  note text not null default '',
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bookings enable row level security;

create policy "Customers can create their own bookings"
  on public.bookings for insert
  with check (auth.uid() = customer_user_id);

create policy "Booking participants can read bookings"
  on public.bookings for select
  using (auth.uid() = customer_user_id or auth.uid() = provider_user_id);

create policy "Providers can update received bookings"
  on public.bookings for update
  using (auth.uid() = provider_user_id)
  with check (auth.uid() = provider_user_id);


alter table public.bookings add column if not exists plan_title text not null default '';
alter table public.bookings add column if not exists customer_label text not null default '客户';
