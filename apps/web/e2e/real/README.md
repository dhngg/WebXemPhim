# FE-11 REAL HTTP smoke

This suite is separate from `e2e/smoke.spec.ts` and never enables the mock adapter.

## Modes

- `REAL_SMOKE_MODE=read` (default): health, public listings/detail and login/register route shells. It performs no business mutation. Desktop and mobile projects run.
- `REAL_SMOKE_MODE=write`: adds the serial desktop onboarding smoke. It requires `REAL_SMOKE_WRITE_APPROVAL=I_APPROVE_NEON_DEVELOPMENT_APARTMENT_WRITES`, `REAL_SMOKE_ADMIN_EMAIL` and `REAL_SMOKE_ADMIN_PASSWORD`.
- Account lock/unlock is not implemented. Its separate future gate is `REAL_SMOKE_ACCOUNT_LOCK_APPROVAL=I_APPROVE_TEST_ACCOUNT_LOCK_UNLOCK`.

The global setup fails closed unless:

1. mock mode is not enabled;
2. API health through the Vite proxy reports `database=up`;
3. API environment is development with database and auth enabled;
4. `support/neon-tls-probe.cjs` confirms the approved Apartment database identity and an authorized TLS 1.2/1.3 client socket (`pg_stat_ssl` is not usable: Neon terminates TLS at its proxy, so the compute-side view always says `false`);
5. the local baseline contains 27 migrations and Prisma reports the remote schema up to date;
6. write mode has explicit approval and Platform Admin credentials.

No command output containing connection configuration is printed. Playwright trace, video and screenshots are disabled. The fixture manifest contains only generated IDs and cleanup states.

The REAL config deliberately refuses occupied ports 3000 or 5173. It cannot safely prove the database/proxy identity of an already-running process, so it never reuses or stops a teammate's server.

## Coverage status

`v1-flow.write.spec.ts` is one serial journey (18 steps, one `runId`); `onboarding.write.spec.ts` keeps the approve/reject gate.

| Scenario | Spec step | Status |
| --- | --- | --- |
| Health, public listing list/detail, login/register shells (desktop + mobile) | `public.read.spec.ts` | READ, verified |
| Register, landlord application, Platform Admin approve, non-admin refused | 01 | WRITE-GATED |
| Origin / CSRF / anonymous refusal through the Vite proxy | 02 | WRITE-GATED |
| Workspace create + capabilities, second isolated workspace | 03 | WRITE-GATED |
| Building, rooms, amenity, image, listing publish, public discovery by city | 04 | WRITE-GATED |
| Viewing: book, OWNER confirm/reject, seeker cancel, notifications | 05 | WRITE-GATED |
| Tenant profile, invitation, accept, role refresh, replay refused | 06 | WRITE-GATED |
| Current + future contract, overlap guard, room state, vehicle stop | 07 | WRITE-GATED |
| Rates, room service, meter reading + adjustment | 08 | WRITE-GATED |
| Invoice DRAFT edit/delete, issue, adjustment idempotency | 09 | WRITE-GATED |
| Payments: idempotency, over-payment guard, reversal (append-only) | 10 | WRITE-GATED |
| Deposits: collection/deduction/refund, insufficient balance, reversal | 11 | WRITE-GATED |
| Maintenance OWNER/tenant lifecycle, cancel, notifications read state | 12 | WRITE-GATED |
| Tenant Portal reads, IDOR, dashboard totals | 13 | WRITE-GATED |
| Admin listing hide/restore + audit trail | 14 | WRITE-GATED |
| Multi-role (landlord is also a tenant in another workspace) | 15 | WRITE-GATED |
| UI: OWNER, tenant and Platform Admin sessions, retired Reports route | 16-18 | WRITE-GATED |
| User lock/unlock/session invalidation | - | BLOCKED (separate Product approval) |

Cleanup runs in reverse creation order using product state transitions only (reverse payments/deposits, end or cancel contracts, stop services and rates, revoke links, unpublish, archive). Issued invoices, adjustments, ledger entries, applications and audit rows are history and stay. The manifest lists every record and any cleanup action that failed.

## UI-driven WRITE (`ui-flow.write.spec.ts`)

Every mutation under test is made in a real browser (click/type/select/submit); the API is used only for prerequisite fixtures, read-only persistence checks and cleanup. Each step records the request the UI sent (method, path template, status, body key names only) into the manifest. Invitation tokens stay in memory and are never recorded.

Run only this spec (the READ project runs first as a dependency):

```text
npx playwright test --config playwright.real.config.ts ui-flow
```

Steps: A1 apply (form), A2 Admin approve/reject (UI), A3 create workspace + capabilities, B1 building/rooms/listing, B2 public marketplace, B3 viewing book/confirm/reject, B4 tenant + invitation + link, B5 current/future contract + cancel, B6 rate/service/meter, B7 invoice draft/issue/adjustment, B8 payments + reversal, B9 deposit ledger, C1 tenant maintenance + OWNER lifecycle + notifications, D1 Admin hide/restore + audit, E1 multi-role.

Artifacts and manifests live in `.real-smoke/` (git-ignored), not in `test-results/`, because the mock config empties `test-results/` on every run.

## Environment notes

- The config starts the API with `node ... src/main.ts` instead of `npm run dev`: `node --watch` restarts endlessly on this Windows setup while it first loads `node_modules`, so the API never becomes healthy.
- That API process is started with `AUTH_RATE_LIMIT_REGISTER_IP_MAX=50` and `AUTH_RATE_LIMIT_LOGIN_IP_MAX=200`. The defaults (5 registrations per 15 minutes) cannot fit the fresh accounts of one scenario. The counters are in memory and die with that process; nothing is changed in `.env`.

## Commands (documentation only)

Read-only mode, using the existing web Playwright script:

```powershell
$env:REAL_SMOKE_MODE='read'
npm run test:e2e -w @rental/web -- --config playwright.real.config.ts
```

Write mode must only be run after Product approval. Supply secrets through the process environment, never command history or committed files:

```text
REAL_SMOKE_MODE=write
REAL_SMOKE_WRITE_APPROVAL=<approved exact value documented above>
REAL_SMOKE_ADMIN_EMAIL=<secret environment value>
REAL_SMOKE_ADMIN_PASSWORD=<secret environment value>
npm run test:e2e -w @rental/web -- --config playwright.real.config.ts
```

Do not use the mock `playwright.config.ts` as evidence of REAL API coverage.
