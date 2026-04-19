# UI/UX Guidelines

## Design System
- **Framework**: Tailwind CSS 4 + shadcn/ui components
- **Theme**: Dark mode default (next-themes), supports light mode toggle
- **Icons**: Lucide React
- **Toasts**: Sonner

## Layout
- **Sidebar** (`src/components/layout/sidebar.tsx`): collapsible nav for dashboard sections
- **Header** (`src/components/layout/header.tsx`): user menu, theme toggle
- **Dashboard layout** (`src/app/(dashboard)/layout.tsx`): sidebar + header + content area

## Component Patterns
- All UI primitives in `src/components/ui/` (shadcn)
- Feature components in `src/components/{feature}/`
- Dialog pattern: shadcn Dialog with controlled open state
- Table pattern: shadcn Table with manual pagination
- Player: custom `video-player-dialog.tsx` with hls.js integration

## Pages
| Route | Component | Purpose |
|-------|-----------|---------|
| `/login` | LoginPage | Email/password + OAuth |
| `/signup` | SignupPage | Registration |
| `/dashboard` | MediaHome | Content hub |
| `/playlists` | PlaylistTable + PlaylistDetail | Manage playlists |
| `/live-tv` | LiveTvBrowser | Channel grid |
| `/movies` | ContentBrowser (type=movie) | Movie grid |
| `/series` | ContentBrowser (type=series) | Series grid |
| `/devices` | DeviceList | Device management |
| `/activate` | ActivateForm | Enter activation code |
| `/customers` | CustomersView (admin) | Customer management |
| `/tv` | TvShell | TV/10-foot UI with spatial nav |

## Style Rules
- Minimal, clean, dark-first aesthetic
- Mobile-responsive (sidebar collapses on mobile)
- Skeleton loading states for async content
- Error states with actionable messages
- No excessive animations
