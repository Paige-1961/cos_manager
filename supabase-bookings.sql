-- V2 booking migration. Run this once in Supabase Dashboard > SQL Editor.

create table if not exists public.bookings (
  id text primary key,
  customer_user_id uuid not null references auth.users(id) on delete cascade,
  provider_user_id uuid references auth.users(id) on delete set null,
  provider_id text not null,
  service_id text not null,
  saved_plan_id text,
  plan_title text not null default '',
  customer_label text not null default 'Customer',
  preferred_date date not null,
  note text not null default '',
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bookings add column if not exists plan_title text not null default '';
alter table public.bookings add column if not exists customer_label text not null default 'Customer';
alter table public.bookings enable row level security;

drop policy if exists "Customers can create their own bookings" on public.bookings;
create policy "Customers can create their own bookings"
  on public.bookings for insert
  with check (auth.uid() = customer_user_id);

drop policy if exists "Booking participants can read bookings" on public.bookings;
create policy "Booking participants can read bookings"
  on public.bookings for select
  using (auth.uid() = customer_user_id or auth.uid() = provider_user_id);

drop policy if exists "Providers can update received bookings" on public.bookings;
create policy "Providers can update received bookings"
  on public.bookings for update
  using (auth.uid() = provider_user_id)
  with check (auth.uid() = provider_user_id);
