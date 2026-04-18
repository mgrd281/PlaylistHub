-- ============================================================
-- PlaylistHub Device Binding & Activation System
-- Run this migration in Supabase SQL Editor
-- ============================================================

-- ============================================================
-- 1. DEVICES TABLE — Core device registry
-- ============================================================
CREATE TABLE public.devices (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  device_key text NOT NULL UNIQUE,              -- server-generated secret (64-char hex)
  activation_code text NOT NULL UNIQUE,         -- 8-char human-readable code (XXXX-XXXX)
  device_label text,                            -- user-friendly name ("iPhone 15 Pro")
  platform text NOT NULL DEFAULT 'ios'
    CHECK (platform IN ('ios', 'tvos', 'android', 'web', 'other')),
  app_version text,
  model text,                                   -- "iPhone 15 Pro", "Apple TV 4K"
  os_version text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'revoked', 'expired')),
  fingerprint_hash text,                        -- optional client-side fingerprint
  reinstall_count integer DEFAULT 0 NOT NULL,
  activated_at timestamptz,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- ============================================================
-- 2. DEVICE ACTIVATIONS — Audit log of activation events
-- ============================================================
CREATE TABLE public.device_activations (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  device_id uuid REFERENCES public.devices(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  activation_type text NOT NULL DEFAULT 'auto'
    CHECK (activation_type IN ('auto', 'code', 'reactivation')),
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- ============================================================
-- 3. DEVICE SESSIONS — Heartbeat / session tracking
-- ============================================================
CREATE TABLE public.device_sessions (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  device_id uuid REFERENCES public.devices(id) ON DELETE CASCADE NOT NULL,
  started_at timestamptz DEFAULT now() NOT NULL,
  last_heartbeat_at timestamptz DEFAULT now() NOT NULL,
  ip_address text,
  app_version text,
  ended_at timestamptz
);

-- ============================================================
-- 4. PLAYLIST-DEVICE LINKS — Which playlists are on which devices
-- ============================================================
CREATE TABLE public.playlist_device_links (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  device_id uuid REFERENCES public.devices(id) ON DELETE CASCADE NOT NULL,
  playlist_id uuid REFERENCES public.playlists(id) ON DELETE CASCADE NOT NULL,
  linked_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(device_id, playlist_id)
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_devices_user_id ON public.devices(user_id);
CREATE INDEX idx_devices_status ON public.devices(status);
CREATE INDEX idx_devices_activation_code ON public.devices(activation_code);
CREATE INDEX idx_devices_device_key ON public.devices(device_key);
CREATE INDEX idx_device_activations_device_id ON public.device_activations(device_id);
CREATE INDEX idx_device_activations_user_id ON public.device_activations(user_id);
CREATE INDEX idx_device_sessions_device_id ON public.device_sessions(device_id);
CREATE INDEX idx_playlist_device_links_device_id ON public.playlist_device_links(device_id);
CREATE INDEX idx_playlist_device_links_playlist_id ON public.playlist_device_links(playlist_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_activations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlist_device_links ENABLE ROW LEVEL SECURITY;

-- Devices: users can view/manage their own devices
CREATE POLICY "Users can view own devices"
  ON public.devices FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own devices"
  ON public.devices FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own devices"
  ON public.devices FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own devices"
  ON public.devices FOR DELETE
  USING (auth.uid() = user_id);

-- Device activations: users can view their own activation history
CREATE POLICY "Users can view own activations"
  ON public.device_activations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own activations"
  ON public.device_activations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Device sessions: users can manage sessions of their own devices
CREATE POLICY "Users can view own device sessions"
  ON public.device_sessions FOR SELECT
  USING (device_id IN (SELECT id FROM public.devices WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own device sessions"
  ON public.device_sessions FOR INSERT
  WITH CHECK (device_id IN (SELECT id FROM public.devices WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own device sessions"
  ON public.device_sessions FOR UPDATE
  USING (device_id IN (SELECT id FROM public.devices WHERE user_id = auth.uid()));

-- Playlist-device links: users can manage links for their own devices
CREATE POLICY "Users can view own playlist device links"
  ON public.playlist_device_links FOR SELECT
  USING (device_id IN (SELECT id FROM public.devices WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own playlist device links"
  ON public.playlist_device_links FOR INSERT
  WITH CHECK (device_id IN (SELECT id FROM public.devices WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete own playlist device links"
  ON public.playlist_device_links FOR DELETE
  USING (device_id IN (SELECT id FROM public.devices WHERE user_id = auth.uid()));

-- ============================================================
-- TRIGGERS
-- ============================================================
CREATE TRIGGER update_devices_updated_at
  BEFORE UPDATE ON public.devices
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at();

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Count active devices for a user (for enforcing max devices)
CREATE OR REPLACE FUNCTION public.count_active_devices(p_user_id uuid)
RETURNS integer AS $$
  SELECT count(*)::integer
  FROM public.devices
  WHERE user_id = p_user_id
    AND status = 'active';
$$ LANGUAGE sql SECURITY DEFINER;
