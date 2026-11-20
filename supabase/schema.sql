-- Menu+ Supabase Schema
-- Run this in your Supabase SQL Editor if the tables do not exist yet.

create table if not exists public.menuplus_kv (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_menuplus_kv_updated_at on public.menuplus_kv (updated_at desc);

create table if not exists public.telegram_users (
  normalized_phone text primary key,
  phone text not null,
  chat_id text not null,
  username text,
  first_name text,
  linked_at bigint not null,
  last_sent_at bigint
);

create index if not exists idx_telegram_users_chat_id on public.telegram_users (chat_id);

-- Lock down direct public/anon access; the Express backend uses SUPABASE_SECRET_KEY.
alter table public.menuplus_kv enable row level security;
alter table public.telegram_users enable row level security;
