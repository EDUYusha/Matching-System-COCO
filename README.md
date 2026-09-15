# coco-v3 — TOLA / co-co.today (Next.js)

A full-stack **Next.js 16** rebuild of the TOLA / co-co.today system, on a
**light theme**.

It is the third expression of the same application. The original is Rails 6 plus
a CakePHP admin panel (`../server`, `../admin`); `../coco-v2` is the React + Vite
+ Fastify port; this is the Next.js one. **coco-v2 is untouched and still runs** —
the two are independent, on different ports and different databases.

Feature parity is exact: every screen, every endpoint, every business rule and
every Japanese string. Nothing added, nothing dropped.

---

## ⚠️ Leaked credentials in the original repository

`server/config/initializers/constants.rb` contains **live production secrets in
plaintext**: the LINE channel access token, the Twilio auth token and the Axes
payment `zkey`. None were copied here — every secret comes from the environment.
Treat all three as compromised and rotate them; they are in that repository's git
history.

---

## Quick start

```bash
cp .env.example .env          # then set SECRET_KEY_BASE / ADMIN_SECRET_KEY_BASE
npm install
npm run db:push
npm run db:seed
npm run dev                   # http://localhost:3000
npm run dev:worker            # BullMQ worker + cron, a separate process
```

Postgres and Redis come from `../coco-v2/docker-compose.yml` (`docker compose up -d`).
This app uses its **own database** `coco_v3` and **Redis database 1**, so it
shares the containers without touching coco-v2's data or queues.

| | coco-v2 | coco-v3 |
| --- | --- | --- |
| member app | :5173 | **:3000** |
| admin panel | :5174 | **:3000/admin** |
| API | :4000 | **:3000/api** |
| database | `coco_dev` | `coco_v3` |
| redis db | 0 | 1 |

### Seeded development logins

| Who | Login | Password |
| --- | --- | --- |
| Admin panel | `m_administrator` | `qweasd` |
| Cast | `cast@a.bc` | `qweasd` |
| Guest | `customer@a.bc` | `qweasd` |
| Inviter | `inviter@a.bc` | `qweasd` |
| Operator | `operator1@a.bc` | `qweasd` |

---

## Why there is a custom server

`server.ts` wraps Next in a plain Node HTTP server for exactly one reason: the
chat needs a WebSocket, and Next's request handler has nowhere to attach one. Next
still handles every request; Socket.IO takes the upgrades on `/websockets`, the
path the original mounted ActionCable at.

`npm run dev:next` starts plain `next dev` for anything that does not need the
socket.

---

## Layout

```
server.ts              Next + Socket.IO
src/app/
  (public)/            signup, password reset, the legal pages — no session
  (app)/               everything behind a login; carries the bottom nav
  admin/               the operator panel, its own session and shell
  api/                 297 Route Handlers
src/components/
  screens/             the member screens
  admin/               the panel's screens
src/client/            browser-side: api client, store, socket, hooks
src/server/            services, jobs, auth, serializers — no React
src/lib/               types and pure logic shared by both sides
worker/                the BullMQ process
```

`src/server` never imports React and `src/client` never imports Prisma, so the
boundary that used to be a network hop between two apps is now a directory rule.

---

## How the original maps onto this

| Rails / CakePHP | coco-v3 |
| --- | --- |
| controllers | `src/app/api/**/route.ts` — **297 endpoints** |
| interactors (57 files) | `src/server/services/**` |
| ActiveRecord + concerns | `prisma/schema.prisma` (60 models) |
| `discard` soft delete | `discardedAt`, filtered in every query |
| `enumerize` | PostgreSQL enums, mirrored in `src/lib/enums.ts` |
| `kaminari` | `src/server/lib/pagination.ts` |
| ActionCable | Socket.IO on `/websockets` |
| Sidekiq + sidekiq-cron | BullMQ, three queues, cron in `Asia/Tokyo` |
| Shrine | `src/server/http/multipart.ts` → `UPLOADS_DIR` |
| `prawn` receipts | `src/server/services/receipt-pdf.ts`, streamed |
| ERB views | `src/components/screens/**` |
| CakePHP admin | `src/app/admin/**` |
| `before_action :authenticate` | `src/server/auth/session.ts` |
| `config.time_zone = 'Tokyo'` | `src/lib/datetime.ts` — all wall-clock logic |

Routing still mirrors `config/routes.rb` one to one, so every url the Rails app
served resolves — links in old LINE notifications and emails keep working.

---

## The light theme

v2 rendered the original's dark ground. This build keeps the same gold identity
(`#e6b324` — the Rails views' accent and the default for `BusinessArea#color`)
and sets it on warm paper.

The palette lives in `src/app/globals.css` as Tailwind 4 `@theme` tokens:

- **paper** `#fffdf8 → #efe8da` — the ground. Not pure white; white makes the
  gold look dirty.
- **gold** — 500 stays the brand value for fills and borders. Text and icons use
  700/800, because gold at its brand value fails contrast on paper.
- **ink** — a warm neutral ramp, 50 lightest to 900 for body text.

Surfaces separate with a hairline and a soft shadow (`.card`) rather than by
being darker. `LevelBadge` darkens arbitrary stored colours — `CastLevel#color`
values were chosen for a dark ground — to keep them readable on white.

---

## Things that had to be reproduced carefully

**Ruby integer arithmetic.** `Integer#/` floors and `Float#to_i` truncates;
JavaScript `/` does neither. Every money calculation goes through `idiv()` and
`toI()` in `src/lib/money.ts`.

**The Tokyo clock.** Rails ran `config.time_zone = 'Tokyo'`, so every
`Time.current.hour` was a Tokyo hour. Host-local `getHours()` breaks this: on a
UTC host a 14:00 JST order reads as 05:00, inside the night-surcharge window.

**`dont_roll_back`.** `CompleteMeeting` charged the card inside a transaction and
let it commit even when a later step raised, so a successful charge was never
lost. `completeMeeting()` carries such an error past the commit and re-raises.

**Row locking.** `with_lock` became `SELECT … FOR UPDATE` plus an arithmetic
`UPDATE` in `src/server/services/credits.ts`.

---

## Migration tooling

`tools/` holds the scripts that carried the port across. They were **one-time
migration aids** — the files they produced are ordinary source now, and the
tools are kept only so the derivation is auditable:

| script | what it did |
| --- | --- |
| `translate-routes.py` | Fastify handlers → Route Handlers (187 endpoints) |
| `prune-imports.py` | dropped the imports each generated file did not use |
| `postfix-routes.py` | the handlers a regex could not express |
| `translate-pages.py` | react-router → next/navigation, dark → light |
| `postfix-pages.py` | `<Outlet/>`, `usePathname`, navigation state |
| `translate-admin.py` / `postfix-admin.py` | the same for the panel |
| `generate-app-routes.py` | the App Router page files |

**No business logic was generated.** The services came over verbatim from the
verified coco-v2 port, so the money paths are unchanged code, not a re-derivation.

---

## Verification

- **297/297 endpoints**, census-checked against coco-v2 — none missing, none extra
- `npx tsc --noEmit` clean
- `npm run build` passes
- All 58 member pages and 18 admin pages render; login, session and the admin
  session all exercised live against Postgres

Three defects were found and fixed during the port, two of which would have been
silent:

1. `reply.status(404).send()` with an empty body was becoming
   `NextResponse.json()` — **dropping the status**, so 404s and 403s would have
   returned 200.
2. The admin's 20 settings tables were generated from a `for` loop rather than
   literal route calls, so the translator never saw them — **100 endpoints**
   absent until the census caught it.
3. `POST /user/blockings/:targetId` and `DELETE /user/blockings/:id` share a path
   position, which Next forbids. Merged under one slug; both urls and meanings
   preserved.

---

## Known gaps

Inherited from coco-v2, because the source material is absent from the export:

1. **LINE templates.** `app/views/sns_templates/{simple,rich}_message.ruby` are
   missing; `services/sns.ts` rebuilds them against the LINE Messaging API.
2. **Help and legal copy.** The right routes and structure, placeholder bodies.
3. **Images.** The export ships no assets at all. `public/system` and
   `public/samples` are generated placeholders — regenerate with
   `python3 ../coco-v2/tools/generate-placeholder-assets.py`.
4. **Undocumented columns.** `users.days_elapsed` and `users.ad_source` are used
   by the Rails code but absent from `db/schema.rb`; modelled from their usage.
5. **External gateways are not exercised.** Axes, Twilio, LINE and Firebase are
   implemented against their documented APIs but never run with live credentials.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Next + Socket.IO on :3000 |
| `npm run dev:next` | plain `next dev`, no socket |
| `npm run dev:worker` | the BullMQ worker and cron |
| `npm run build` / `start` | production build and server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:push` / `db:seed` / `db:studio` | Prisma |
