# Monthly Preventive Maintenance Report

Project: NSTC Project Management  
Environment: Production  
Execution Date (UTC): 2026-03-01

## 1) System Health Check

- Production URL: `https://warehouse-ts.vercel.app`
- Custom domain configured in Vercel: `nstcprojectmanagmentapp.com`
- Uptime probe (`/login`): 20/20 successful requests, average TTFB `0.327s`
- SSL certificate (`warehouse-ts.vercel.app`):
  - Issuer: Google Trust Services `WR1`
  - Valid to: `May 27, 2026` (`86` days remaining at check time)
- DNS:
  - `warehouse-ts.vercel.app` resolves correctly
  - `nstcprojectmanagmentapp.com` does not resolve (misconfigured DNS)
- CDN/Edge:
  - Vercel edge cache active (`x-vercel-cache: HIT/PRERENDER`)
- Environment integrity (Vercel Production):
  - `DATABASE_URL` encrypted
  - `NEXTAUTH_SECRET` encrypted
- Exposed secrets in build/runtime logs:
  - No direct secret values detected
  - Historical Prisma query logging was observed and then mitigated in this maintenance run

## 2) Security Audit

### Dependency and package security

- `npm audit` findings:
  - High: `xlsx` (direct dependency, no auto-fix available)
  - High: `minimatch` (transitive)
  - Moderate: `ajv` (transitive)
- Outdated key packages:
  - Prisma client/tooling `5.22.0` vs latest `7.4.2` (major)
  - Next eslint config update available (`16.1.3` -> `16.1.6`)

### Auth/API/platform security

- Authentication:
  - Credentials-based NextAuth verified and active
  - Added production rate limiting for `/api/auth/callback/credentials` (429 after threshold)
- API endpoint security:
  - `/api/test-db`, `/api/debug-db-status`, `/debug-db` now blocked in production (404)
- CORS:
  - No custom CORS policy for app APIs; current behavior is platform-default headering
- Firewall / WAF:
  - Vercel edge network is active
  - No explicit custom WAF rules visible via CLI during this run
- Supabase DB access permissions:
  - **Critical issue found and fixed**:
    - Previously `anon` and `authenticated` had broad public table privileges with RLS disabled
    - Now revoked for app tables/sequences and RLS enabled on all app tables
- Recent login/suspicious activity:
  - Last sampled 500 logs: mostly 200 responses; no 4xx/5xx abuse pattern observed
  - Post-fix tests confirmed 429 throttling behavior for repeated credential callback attempts

### Security risk summary

- Critical:
  - Custom production domain DNS misconfiguration (`nstcprojectmanagmentapp.com` not resolving)
- High:
  - Direct dependency vulnerability in `xlsx`
- Medium:
  - Missing custom WAF rule-set visibility/control
  - Outdated major Prisma version
- Low:
  - No GA/GTM telemetry wired (operational visibility gap)

## 3) Database Maintenance

- DB server: PostgreSQL `17.6`
- DB uptime at check: `32 days`
- DB size: `13 MB` (`13,724,819` bytes)
- Largest app table footprints:
  - `attendance` `480 KB`
  - `daily_report_submissions` `216 KB`
  - `audit_logs` `160 KB`
- Slow query review:
  - Top heavy statements mostly migration/introspection/system operations
  - App-facing query mean times sampled were generally low in current snapshot
- Indexing review:
  - Foreign keys lacking matching indexes detected (notably `users.shift_id`, `workers.shift_id`, `staff_attendance.covered_by`, plus auth/storage internal tables)
- Orphan record checks:
  - Checked major app relations; no orphans detected
- Table optimization:
  - Executed `VACUUM (ANALYZE)` successfully
  - Dead tuples reduced to zero for core app tables

### Backup confirmation

- Full backup created:
  - `maintenance/backups/nstc-prod-20260301T130600Z.dump`
- Integrity verification:
  - `pg_restore -l` manifest entries: `541`
  - SHA-256: `maintenance/backups/nstc-prod-20260301T130600Z.sha256`

## 4) Performance Optimization

- Lighthouse (`/login`) results:
  - Mobile profile:
    - Performance: `97`
    - LCP: `~2198 ms`
    - TTFB: `68 ms`
  - Desktop profile:
    - Performance: `97`
    - LCP: `~532 ms`
    - TTFB: `76 ms`
- API response samples:
  - `/api/auth/providers`: HTTP 200, TTFB `~0.61s`
- Caching/compression:
  - HTML and JS gzip compression present
  - Static chunk cache-control: `public,max-age=31536000,immutable`
  - `x-vercel-cache` HIT/PRERENDER observed
- Image optimization / lazy loading:
  - No Next.js `Image` usage detected in current public page sample
- Unused assets:
  - Removed unused default SVG assets from `public/`

### Performance score

- Overall performance state: **Good**
- Aggregate score reference: **97/100** on tested login route

## 5) Codebase Review

- Dead code/assets:
  - Removed unused `public/*.svg` default template assets
- Error handling/logging:
  - Reduced Prisma logging noise in production (`query` logs disabled)
- Console logs:
  - Runtime `console.error` usage remains for error logging (acceptable)
  - `console.log` remains in scripts/seed tooling only
- Build optimization:
  - Production build validated successfully after fixes
- `.env` usage hardening:
  - Added `.vercelignore` to prevent `.env*` from being uploaded during local `vercel --prod` deploys
- Git branch:
  - Current branch: `main` (working tree contains maintenance changes)

## 6) SEO & Analytics Check

- `robots.txt`: present and valid (200)
- `sitemap.xml`: present and valid (200)
- Meta tags:
  - title, description, robots, OG, and Twitter tags present
- Structured data:
  - No JSON-LD structured data detected
- Analytics:
  - Google Analytics / GTM not detected in codebase
- Broken links:
  - Public route checks passed; authenticated-route crawling is limited without session automation

## 7) Infrastructure Validation

### Vercel

- Project: `warehouse-ts`
- Latest production deployment:
  - `warehouse-ia4rtrz4e-abdulaziz-alhazmis-projects.vercel.app`
  - Aliased to `warehouse-ts.vercel.app`
- Build/deploy logs:
  - Successful deployment in this maintenance window
  - Build succeeded with db schema verification

### Supabase

- Database connectivity verified via direct Postgres access
- API gateway reachable (`rest/auth endpoints return key-required responses`)
- DB hardening actions applied and verified

## 8) Deliverables

### Issues found

1. Custom domain DNS not configured; production domain does not resolve. (Critical)
2. `xlsx` direct dependency vulnerability (high severity advisory). (High)
3. Transitive `minimatch` and `ajv` vulnerabilities. (High/Medium)
4. Public debug endpoints exposed sensitive operational data in production. (High)
5. User mutation server actions lacked explicit authz checks. (High)
6. Supabase `anon/authenticated` role privileges were over-permissive and RLS disabled. (Critical)
7. Local `.env` risk in local Vercel deploy path. (Medium)

### Immediate fixes applied

1. Deployed production guards returning 404 for debug endpoints/pages:
   - `/api/test-db`, `/api/debug-db-status`, `/debug-db`
2. Added auth rate limiting on credential callback endpoint in middleware/proxy.
3. Added explicit server-side authz checks for user management actions.
4. Hardened `updateUserProfile` authorization.
5. Disabled Prisma `query` logging in production.
6. Added and deployed `robots.txt` and `sitemap.xml`.
7. Added metadata/open-graph baseline in layout.
8. Added `.vercelignore` to block `.env*` deployment leakage.
9. Revoked `anon/authenticated` public table/sequence privileges and enabled RLS on app tables.
10. Executed `VACUUM (ANALYZE)` and verified post-maintenance DB health.
11. Performed full DB backup and integrity verification.

### Recommended improvements

1. Fix DNS for `nstcprojectmanagmentapp.com` (`A 76.76.21.21`) and verify SSL issuance.
2. Replace or isolate `xlsx` usage due unresolved high-severity advisories.
3. Plan Prisma major upgrade (5.x -> 7.x) in staged testing.
4. Add explicit index coverage for app FK columns and review auth/storage FK index warnings.
5. Add structured data (JSON-LD) and canonical strategy for SEO depth.
6. Add centralized monitoring/alerts (error rate, auth failures, DB latency).
7. Implement managed/distributed rate limiting (e.g., Redis/Edge KV) for stronger abuse resistance.

### Risk level assessment

- Current operational risk: **Medium**
- Primary drivers:
  - Domain DNS outage for custom domain (critical external availability risk)
  - Dependency vulnerabilities pending (`xlsx`)

### Estimated technical debt level

- **Medium**
- Basis:
  - Major dependency lag, security hardening recently added, and remaining infra/observability enhancements pending

## 9) Automation Suggestions

Sample scripts added:

1. Weekly health check:
   - `scripts/maintenance/weekly-health-check.sh`
2. Daily DB backup:
   - `scripts/maintenance/daily-db-backup.sh`
3. Security scan automation:
   - `scripts/maintenance/security-scan.sh`

Suggested schedule examples (server cron/CI):

1. Weekly health check (Sunday 08:00):
   - `0 8 * * 0 cd /path/to/repo && scripts/maintenance/weekly-health-check.sh`
2. Daily DB backup (01:00 UTC):
   - `0 1 * * * cd /path/to/repo && DATABASE_URL="..." scripts/maintenance/daily-db-backup.sh`
3. Daily security scan (03:00 UTC):
   - `0 3 * * * cd /path/to/repo && scripts/maintenance/security-scan.sh`

