export type PlaylistType = 'M3U' | 'M3U8' | 'XTREAM';
export type PlaylistStatus = 'pending' | 'scanning' | 'active' | 'error' | 'inactive';
export type ScanStatus = 'running' | 'completed' | 'failed';
export type ContentType = 'channel' | 'movie' | 'series' | 'uncategorized';

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Playlist {
  id: string;
  user_id: string;
  name: string;
  source_url: string;
  type: PlaylistType;
  status: PlaylistStatus;
  total_items: number;
  channels_count: number;
  movies_count: number;
  series_count: number;
  categories_count: number;
  last_scan_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlaylistScan {
  id: string;
  playlist_id: string;
  status: ScanStatus;
  total_items: number;
  channels_count: number;
  movies_count: number;
  series_count: number;
  categories_count: number;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface Category {
  id: string;
  playlist_id: string;
  name: string;
  item_count: number;
  created_at: string;
}

export interface PlaylistItem {
  id: string;
  playlist_id: string;
  scan_id: string | null;
  category_id: string | null;
  name: string;
  stream_url: string;
  logo_url: string | null;
  group_title: string | null;
  content_type: ContentType;
  tvg_id: string | null;
  tvg_name: string | null;
  tvg_logo: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}
