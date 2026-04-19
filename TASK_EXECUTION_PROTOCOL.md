# Task Execution Protocol

## Workflow for Every Task

```
1. LOAD    → Read minimal governance docs relevant to the task
2. LOCATE  → Identify exact impacted layer/files
3. INSPECT → Read only the relevant code sections
4. IMPLEMENT → Make the smallest correct change
5. VERIFY  → Build check, lint, or curl test as appropriate
6. UPDATE  → Update governance docs if contracts/schema/behavior changed
7. REPORT  → Brief summary of what changed
```

## Layer Identification

| Task involves... | Read first | Then inspect |
|-----------------|------------|--------------|
| Playback/streaming | SYSTEM_ARCHITECTURE.md | stream/route.ts, worker.js, server.js |
| API endpoints | API_CONTRACTS.md | relevant route.ts |
| Database | DATABASE_SCHEMA.md | schema.sql, types/database.ts |
| Auth/security | SECURITY_RULES.md | proxy.ts, middleware.ts |
| UI/components | UI_UX_GUIDELINES.md | relevant component |
| iOS | SYSTEM_ARCHITECTURE.md | AppConfig.swift, relevant Feature/ |
| Deployment | DEPLOYMENT.md | — |
| New feature | PRODUCT_REQUIREMENTS.md | nearest existing feature |

## Verification by Type

| Change type | Verification |
|-------------|-------------|
| API route | `curl` test against localhost or production |
| Stream proxy | Test with real provider URL through `/api/stream` |
| UI component | `npm run build` passes |
| Schema | Run migration in Supabase SQL Editor |
| CF Worker | `npx wrangler deploy` + curl test |
| iOS | Xcode build succeeds |

## Commit Convention
```
<type>: <concise description>

Types: fix, feat, refactor, docs, chore
```
