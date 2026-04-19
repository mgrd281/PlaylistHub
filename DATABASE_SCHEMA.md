# Database Schema

Supabase PostgreSQL at `zeesajjtlkkwpruzsdnq.supabase.co`

## Tables

### profiles
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | FK → auth.users |
| email | text | |
| display_name | text | |
| avatar_url | text | |
| role | text | 'user' \| 'admin' |
| created_at | timestamptz | |
| updated_at | timestamptz | auto-trigger |

### playlists
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid FK → profiles | |
| name | text | |
| source_url | text | M3U URL or Xtream base |
| type | text | 'M3U' \| 'M3U8' \| 'XTREAM' |
| status | text | 'pending' \| 'scanning' \| 'active' \| 'error' \| 'inactive' |
| total_items | int | |
| channels_count | int | |
| movies_count | int | |
| series_count | int | |
| categories_count | int | |
| last_scan_at | timestamptz | |
| error_message | text | |

### playlist_items
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| playlist_id | uuid FK → playlists | |
| scan_id | uuid FK → playlist_scans | |
| category_id | uuid FK → categories | |
| name | text | |
| stream_url | text | |
| logo_url | text | |
| group_title | text | |
| content_type | text | 'channel' \| 'movie' \| 'series' \| 'uncategorized' |
| tvg_id, tvg_name, tvg_logo | text | EPG metadata |
| metadata | jsonb | |

### playlist_scans
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| playlist_id | uuid FK → playlists | |
| status | text | 'running' \| 'completed' \| 'failed' |
| counts | int fields | channels, movies, series, categories, total |
| error_message | text | |

### categories
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| playlist_id | uuid FK → playlists | |
| name | text | |
| item_count | int | |

### devices
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid FK → profiles | nullable until activated |
| device_key | text UNIQUE | server-generated 64-char hex |
| activation_code | text UNIQUE | 8-char XXXX-XXXX |
| platform | text | 'ios' \| 'tvos' \| 'android' \| 'web' \| 'other' |
| status | text | 'pending' \| 'active' \| 'revoked' \| 'expired' |
| model, os_version, app_version | text | |
| fingerprint_hash | text | |
| reinstall_count | int | |

### device_activations
Audit log of activation events. FK → devices, profiles.

### device_sessions
Active sessions per device.

## RLS Policy Pattern
All user-facing tables enforce `auth.uid() = user_id` (or subquery via playlists).
Admin queries use service-role client (bypasses RLS).

## Migrations
- `supabase/schema.sql` — base schema
- `supabase/migration_devices.sql` — device binding system
