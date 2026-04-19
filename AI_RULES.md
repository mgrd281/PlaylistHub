# AI Rules

## Operating Principles
1. **Governance-first**: Always load relevant governance docs before touching code
2. **Minimal context**: Read only the files needed for the current task
3. **Smallest correct change**: No over-engineering, no drive-by refactors
4. **Update memory**: If behavior/contracts/schema change, update the relevant governance doc
5. **Preserve architecture**: Follow existing patterns (proxy cascade, RLS, auth flow)

## Code Style
- TypeScript strict mode, no `any` unless unavoidable
- Edge runtime for stream/proxy routes
- Server components by default, `'use client'` only when needed
- shadcn/ui primitives for all UI components
- Tailwind utility classes, no custom CSS unless necessary
- Supabase client: `createClient()` for server, `createBrowserClient()` for client

## File Conventions
- API routes: `src/app/api/{resource}/route.ts`
- Components: `src/components/{feature}/{component}.tsx`
- UI primitives: `src/components/ui/{component}.tsx`
- Types: `src/types/database.ts`
- Lib: `src/lib/{module}.ts`

## Don'ts
- Don't add comments to unchanged code
- Don't add error handling for impossible scenarios
- Don't create abstractions for one-time operations
- Don't modify proxy pipeline without testing all 3 layers
- Don't bypass RLS — use service-role client only for admin ops
- Don't hardcode secrets — use env vars
- Don't patch UI to hide backend failures — fix the root cause

## Testing Playback Changes
After any stream/proxy change, verify:
1. Scanner tunnel is up and returns video content
2. `/api/stream` returns 206 with valid media type for movie + series URLs
3. HLS manifests are properly rewritten
4. iOS cascade falls through correctly
