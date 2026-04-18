-- PlaylistHub Database Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Users table (extends Supabase auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  display_name text,
  avatar_url text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Playlists table
create table public.playlists (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  source_url text not null,
  type text default 'M3U' not null check (type in ('M3U', 'M3U8', 'XTREAM')),
  status text default 'pending' not null check (status in ('pending', 'scanning', 'active', 'error', 'inactive')),
  total_items integer default 0,
  channels_count integer default 0,
  movies_count integer default 0,
  series_count integer default 0,
  categories_count integer default 0,
  last_scan_at timestamptz,
  error_message text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Playlist scans table
create table public.playlist_scans (
  id uuid default uuid_generate_v4() primary key,
  playlist_id uuid references public.playlists(id) on delete cascade not null,
  status text default 'running' not null check (status in ('running', 'completed', 'failed')),
  total_items integer default 0,
  channels_count integer default 0,
  movies_count integer default 0,
  series_count integer default 0,
  categories_count integer default 0,
  error_message text,
  started_at timestamptz default now() not null,
  completed_at timestamptz
);

-- Categories table
create table public.categories (
  id uuid default uuid_generate_v4() primary key,
  playlist_id uuid references public.playlists(id) on delete cascade not null,
  name text not null,
  item_count integer default 0,
  created_at timestamptz default now() not null
);

-- Playlist items table
create table public.playlist_items (
  id uuid default uuid_generate_v4() primary key,
  playlist_id uuid references public.playlists(id) on delete cascade not null,
  scan_id uuid references public.playlist_scans(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  stream_url text not null,
  logo_url text,
  group_title text,
  content_type text default 'uncategorized' not null check (content_type in ('channel', 'movie', 'series', 'uncategorized')),
  tvg_id text,
  tvg_name text,
  tvg_logo text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now() not null
);

-- Indexes
create index idx_playlists_user_id on public.playlists(user_id);
create index idx_playlist_items_playlist_id on public.playlist_items(playlist_id);
create index idx_playlist_items_content_type on public.playlist_items(content_type);
create index idx_playlist_items_category_id on public.playlist_items(category_id);
create index idx_playlist_items_name on public.playlist_items(name);
create index idx_categories_playlist_id on public.categories(playlist_id);
create index idx_playlist_scans_playlist_id on public.playlist_scans(playlist_id);

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.playlists enable row level security;
alter table public.playlist_scans enable row level security;
alter table public.categories enable row level security;
alter table public.playlist_items enable row level security;

-- Profiles policies
create policy "Users can view own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Users can insert own profile" on public.profiles for insert with check (auth.uid() = id);

-- Playlists policies
create policy "Users can view own playlists" on public.playlists for select using (auth.uid() = user_id);
create policy "Users can create playlists" on public.playlists for insert with check (auth.uid() = user_id);
create policy "Users can update own playlists" on public.playlists for update using (auth.uid() = user_id);
create policy "Users can delete own playlists" on public.playlists for delete using (auth.uid() = user_id);

-- Playlist scans policies
create policy "Users can view own scans" on public.playlist_scans for select using (
  playlist_id in (select id from public.playlists where user_id = auth.uid())
);
create policy "Users can create scans" on public.playlist_scans for insert with check (
  playlist_id in (select id from public.playlists where user_id = auth.uid())
);
create policy "Users can update own scans" on public.playlist_scans for update using (
  playlist_id in (select id from public.playlists where user_id = auth.uid())
);

-- Categories policies
create policy "Users can view own categories" on public.categories for select using (
  playlist_id in (select id from public.playlists where user_id = auth.uid())
);
create policy "Users can manage own categories" on public.categories for all using (
  playlist_id in (select id from public.playlists where user_id = auth.uid())
);

-- Playlist items policies
create policy "Users can view own items" on public.playlist_items for select using (
  playlist_id in (select id from public.playlists where user_id = auth.uid())
);
create policy "Users can manage own items" on public.playlist_items for all using (
  playlist_id in (select id from public.playlists where user_id = auth.uid())
);

-- Function to handle new user creation
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$ language plpgsql security definer;

-- Trigger for new user
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Function to update updated_at
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_profiles_updated_at before update on public.profiles
  for each row execute procedure public.update_updated_at();

create trigger update_playlists_updated_at before update on public.playlists
  for each row execute procedure public.update_updated_at();

-- ============================================================
-- Device Binding & Activation System
-- ============================================================

create table public.devices (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete set null,
  device_key text not null unique,
  activation_code text not null unique,
  device_label text,
  platform text not null default 'ios' check (platform in ('ios', 'tvos', 'android', 'web', 'other')),
  app_version text,
  model text,
  os_version text,
  status text not null default 'pending' check (status in ('pending', 'active', 'revoked', 'expired')),
  fingerprint_hash text,
  reinstall_count integer default 0 not null,
  activated_at timestamptz,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table public.device_activations (
  id uuid default uuid_generate_v4() primary key,
  device_id uuid references public.devices(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  activation_type text not null default 'auto' check (activation_type in ('auto', 'code', 'reactivation')),
  ip_address text,
  user_agent text,
  created_at timestamptz default now() not null
);

create table public.device_sessions (
  id uuid default uuid_generate_v4() primary key,
  device_id uuid references public.devices(id) on delete cascade not null,
  started_at timestamptz default now() not null,
  last_heartbeat_at timestamptz default now() not null,
  ip_address text,
  app_version text,
  ended_at timestamptz
);

create table public.playlist_device_links (
  id uuid default uuid_generate_v4() primary key,
  device_id uuid references public.devices(id) on delete cascade not null,
  playlist_id uuid references public.playlists(id) on delete cascade not null,
  linked_at timestamptz default now() not null,
  unique(device_id, playlist_id)
);

create index idx_devices_user_id on public.devices(user_id);
create index idx_devices_status on public.devices(status);
create index idx_devices_activation_code on public.devices(activation_code);
create index idx_devices_device_key on public.devices(device_key);
create index idx_device_activations_device_id on public.device_activations(device_id);
create index idx_device_sessions_device_id on public.device_sessions(device_id);
create index idx_playlist_device_links_device_id on public.playlist_device_links(device_id);
create index idx_playlist_device_links_playlist_id on public.playlist_device_links(playlist_id);

alter table public.devices enable row level security;
alter table public.device_activations enable row level security;
alter table public.device_sessions enable row level security;
alter table public.playlist_device_links enable row level security;

create policy "Users can view own devices" on public.devices for select using (auth.uid() = user_id);
create policy "Users can insert own devices" on public.devices for insert with check (auth.uid() = user_id);
create policy "Users can update own devices" on public.devices for update using (auth.uid() = user_id);
create policy "Users can delete own devices" on public.devices for delete using (auth.uid() = user_id);

create policy "Users can view own activations" on public.device_activations for select using (auth.uid() = user_id);
create policy "Users can insert own activations" on public.device_activations for insert with check (auth.uid() = user_id);

create policy "Users can view own device sessions" on public.device_sessions for select
  using (device_id in (select id from public.devices where user_id = auth.uid()));
create policy "Users can insert own device sessions" on public.device_sessions for insert
  with check (device_id in (select id from public.devices where user_id = auth.uid()));
create policy "Users can update own device sessions" on public.device_sessions for update
  using (device_id in (select id from public.devices where user_id = auth.uid()));

create policy "Users can view own playlist device links" on public.playlist_device_links for select
  using (device_id in (select id from public.devices where user_id = auth.uid()));
create policy "Users can insert own playlist device links" on public.playlist_device_links for insert
  with check (device_id in (select id from public.devices where user_id = auth.uid()));
create policy "Users can delete own playlist device links" on public.playlist_device_links for delete
  using (device_id in (select id from public.devices where user_id = auth.uid()));

create trigger update_devices_updated_at before update on public.devices
  for each row execute procedure public.update_updated_at();

create or replace function public.count_active_devices(p_user_id uuid)
returns integer as $$
  select count(*)::integer from public.devices where user_id = p_user_id and status = 'active';
$$ language sql security definer;
