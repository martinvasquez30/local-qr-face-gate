# Week 7 (Nov 16–22, 2026): safer face checks and the online demo

> Work in progress: these notes are updated during the week. Last update: Nov 21, 2026.

## Goal

1. Fix the problems found in the week 6 tests with a real camera.
2. Add a liveness check, so a photo of an enrolled person cannot get in.
3. Follow the course rubric: keep the README up to date every week and publish an
   online demo, without sending biometric data to the cloud.

## Changes

### 1. Duplicate faces and denial reasons (`76cb702`)

| File | Change |
|---|---|
| `backend/app/faces.py` | Enrolling a face that is already enrolled for another user returns `409 face_already_enrolled`. With the same face on two users, the kiosk could never tell them apart. |
| `backend/app/models.py`, `access.py` | New `reason` column in `access_events`: why an attempt was denied (`face_no_match`, `face_ambiguous`, `no_faces_enrolled`, `qr_expired`, ...). The history page shows it; the kiosk does not, so a stranger learns nothing. |
| `backend/app/database.py` | `_add_new_columns`: adds new nullable columns to an existing SQLite file, so the data is kept. |
| `backend/app/auth.py` | Without internet, the SSO button goes back to the login page with `sso_unavailable` instead of a 500 error. |

### 2. Head-turn liveness check (`aa8aa7f`)

| File | Change |
|---|---|
| `frontend/src/face/headTurn.js` | **New.** Measures how far the nose is from the middle of the eyes, along the eye line. A real head that turns changes it; a flat photo does not. |
| `frontend/src/pages/KioskPage.jsx` | Asks for a turn to a random side (up to 5 s), then to look straight, and only then takes the descriptor. |
| `backend/app/access.py`, `schemas.py` | `POST /access/face` requires `liveness_passed`; without it the attempt is denied with `liveness_failed` and logged with the closest match. |
| `frontend/src/face/faceModel.js` | Warms up the three networks when the model loads, so the first check does not freeze. |

A blink check was tried first and dropped: the landmark model barely moves the eyelids, so
open and closed eyes gave almost the same value.

### 3. Weekly progress in the README (not committed yet)

| File | Change |
|---|---|
| `README.md` | New "Project status and weekly progress" section: current status and one row per week, linking to these notes. Old statements fixed (SSO button, threshold, offline test). |
| `docs/progress/week-07.md` | **New.** This file. |

### 4. Online demo without face recognition (`477a217`, `93bb711`)

| File | Change |
|---|---|
| `backend/app/config.py` | `FACE_RECOGNITION_ENABLED` (on by default) and `INITIAL_ADMIN_EMAIL`. |
| `backend/app/faces.py`, `access.py` | `require_face_recognition`: with the switch off, `PUT /users/{id}/face` and `POST /access/face` answer `403 face_recognition_disabled`. Deleting a face still works. |
| `backend/app/main.py` | `/health` also returns `face_recognition` (true or false). |
| `backend/app/database.py` | `normalize_database_url`: Supabase URLs use the psycopg 3 driver. With `INITIAL_ADMIN_EMAIL`, an empty database gets that admin without a password (SSO only) instead of the demo admin. |
| `backend/requirements.txt` | Adds `psycopg[binary]`. |
| `frontend/src/config.js` | `VITE_FACE_RECOGNITION_ENABLED`. |
| `frontend/src/App.jsx`, `UsersPage.jsx`, `HomePage.jsx` | Face pages and the "Face" button hidden; the home page explains what the online demo does. |
| `frontend/src/pages/KioskPage.jsx` | QR only: it never loads the face model and keeps scanning after each result. |
| `render.yaml`, `frontend/vercel.json` | **New.** Backend on Render (Blueprint) and frontend on Vercel. |
| `backend/tests/` | 8 new tests (switch off, first admin, PostgreSQL URL, `/health`). |

### 5. Personal QR codes made without internet (not committed yet)

| File | Change |
|---|---|
| `backend/app/qr.py` | `POST /me/qr-key` (any logged-in user) gives the user a secret key of their own; `read_personal_qr` checks codes `P:<user_id>:<step>:<nonce>:<signature>` (HMAC-SHA256 with that key, current period plus or minus one). |
| `backend/app/models.py` | New nullable `users.qr_key` column (added to existing databases by `_add_new_columns`). |
| `backend/app/access.py` | `POST /access/qr` accepts both kinds of code; same reasons and single use through `used_qr_nonces`. |
| `backend/app/auth.py` | SSO lets in any active user (`find_sso_user`). Members only reach `/auth/me` and `/me/qr-key`; the rest stays `require_admin`. |
| `frontend/src/qr/personalQr.js` | **New.** Gets and keeps the key, signs codes with Web Crypto, every 30 s, without the network. |
| `frontend/src/pages/MyQrPage.jsx` | **New.** `/my-qr` for every role: the code, a countdown, "New code" and whether the device is online. |
| `frontend/src/App.jsx`, `NavBar.jsx`, `AuthContext.jsx` | Route and link for "My QR"; members only see "Home" and "My QR"; signing out forgets the key. |
| `frontend/src/App.css` | Styles for the online/offline line; on phones the nav links wrap to a new row (with five links they no longer fit in 360 px). |
| `backend/tests/` | 12 new or changed tests (key, single use, clock window, another user's id, new key, deactivated user, member SSO). |

### 6. New visual design, part 1: base and app frame (not committed yet)

The look comes from a Figma Make prototype. It is rebuilt with the course stack (React
with JSX, Bootstrap 5 and our own CSS, Material Design as a visual guide) instead of
copying its code (one 1,500-line TypeScript file with made-up data).

| File | Change |
|---|---|
| `frontend/package.json`, `src/main.jsx` | Bootstrap 5 (CSS only, loaded before our CSS so our rules win). Its breakpoints and utility classes (`d-none d-lg-flex`, `d-flex`, `gap-3`...) show or hide each menu. |
| `frontend/src/App.css` | Design tokens: the prototype colors, an 8px spacing scale, shadows for elevation, system fonts (no download, works offline). Bootstrap's `--bs-*` variables point to them, so dark mode keeps working. Form borders now reach 3:1 contrast. |
| `frontend/src/components/AppShell.jsx`, `Sidebar.jsx`, `TopBar.jsx`, `BottomNav.jsx` | **New.** Logged-in frame: side menu from 992px, bottom menu on phones and tablets, top bar with the page name, language and (on phones) logout. |
| `frontend/src/components/navItems.js` | **New.** The menu entries in one list, read by both menus. |
| `frontend/src/components/PublicLayout.jsx`, `Brand.jsx`, `Icon.jsx` | **New.** Frame for login, loading and kiosk; logo; SVG icons bundled with the app. |
| `frontend/src/components/NavBar.jsx` | Removed: replaced by the two menus. |
| `frontend/src/locales/es.json`, `en.json` | Menu texts: short kiosk label, logout, privacy note. |

### 7. Prototype features, part 2 (not committed yet)

Only the features that fit the design were added. Almost all are calculated in the browser
from the API that already existed; the backend only gained a yes/no for enrolled faces.

| File | Change |
|---|---|
| `backend/app/models.py`, `schemas.py` | `User.face_template` relationship and `has_face` property: `/users` now says whether each user has a face enrolled (never the numbers). |
| `backend/tests/test_faces.py` | 1 new test: `has_face` before enrolling, after enrolling and after deleting. |
| `frontend/src/dashboard/` | **New.** Admin home: today's granted and denied attempts, success rate, active users (and how many have a face), attempts per hour as a CSS bar chart, and the latest 5 attempts. Built from `GET /access-events` and `GET /users`. |
| `frontend/src/history/stats.js`, `csv.js`, `describeEvent.js`, `EventsTable.jsx` | **New.** Totals, per-hour counts and filters (no React); CSV export made in the browser; the texts of one event, shared by the table and the CSV; the events table, shared by home and history. |
| `frontend/src/pages/HistoryPage.jsx` | Method and result filters, "Clear filters", 20 events per page, "Export CSV" (every filtered event, `;` as separator so Excel in Spanish opens it in columns). Filters in a Bootstrap grid. |
| `frontend/src/pages/IssueQrPage.jsx` | **New.** `/qr` ("Issue QR"): choose an active user, then the existing QR page shows the code. In the side menu; on phones it is the main button of the home page. |
| `frontend/src/pages/UsersPage.jsx`, `components/FilterTabs.jsx` | "All / Active / Inactive" tabs instead of the checkbox, the number of users shown, and a "Face" column. |
| `frontend/src/pages/QrPage.jsx` | A bar under the countdown that empties as the code expires. |
| `frontend/src/components/BackendStatus.jsx`, `TopBar.jsx` | The server status moved to the top bar of every page. It is checked every 30 s and when the network comes back or goes away. On phones only the dot shows. |
| `frontend/src/components/Pagination.jsx` | **New.** "Showing 1–20 of 46" with previous and next. |

Left out on purpose:

| Prototype feature | Why not |
|---|---|
| "Pending sync" on terminals | The design has no sync: each access point talks to the local server at the moment. The connected / offline status was added later (section 8). |
| QR codes of 5–30 minutes or for many uses | Codes last one minute and work once; a long-lived code is easy to share or photograph. |
| "Continue with Microsoft" | SSO already works with any OpenID Connect provider (`SSO_METADATA_URL`); the button shows its name. |
| Lighting, centering and distance checks while enrolling | Fake in the prototype. A real one needs more face-api work: possible later. |
| Surname, "U-00184" id, "More filters", "Need help?" | No data or behavior behind them. |

### 8. Access point places and status (not committed yet)

Each kiosk is set up with a place (library, physics lab, computer lab...), and the admin
home shows every access point as connected or offline, like the prototype's terminal list.

| File | Change |
|---|---|
| `backend/app/schemas.py` | `Location`: the fixed list of places. `location` (optional) in the face and QR checks; `HeartbeatRequest`; `TerminalOut` with `seconds_since_seen` and `is_online`, counted by the server. |
| `backend/app/models.py` | New `terminals` table (place, direction, last contact). New nullable `access_events.location` column, added to existing databases by `_add_new_columns`. |
| `backend/app/terminals.py` | **New.** `touch_terminal` (creates or updates the row) and admin-only `GET /terminals`. Connected = a contact in the last 90 s. |
| `backend/app/access.py` | `POST /access/heartbeat` (terminal key). Every check stores the place and also counts as a contact. |
| `backend/tests/test_terminals.py` | **New.** 9 tests: key, unknown place, one row per place and direction, admins only, online and offline, place in the log, kiosks without a place. |
| `frontend/src/kiosk/locations.js`, `pages/KioskPage.jsx`, `kiosk/kioskApi.js` | The setup asks for the place; a kiosk saved without one asks again. Heartbeat every 30 s. The title shows "Library · Entry". |
| `frontend/src/dashboard/TerminalsPanel.jsx`, `terminalsApi.js`, `formatAgo.js` | **New.** "Access points" card: place, entry or exit, status pill (color and text) and "2 minutes ago" with the browser's `Intl.RelativeTimeFormat`. Reloads every 30 s. |
| `frontend/src/history/describeEvent.js` | New "Place" column in the history, the home table and the CSV. |

## Design decisions

| Decision | Why |
|---|---|
| The online demo runs the same code with a switch | No second version to maintain. The switch is checked by the backend, so even a modified frontend cannot send face data to the cloud server. |
| 403 before the body is used | The descriptor is neither stored nor logged; there is nothing biometric in the cloud database. |
| No demo admin on a public server | `admin123` is in the README, so anyone could sign in. With `INITIAL_ADMIN_EMAIL` the first admin can only use SSO. |
| Supabase through the session pooler | The direct connection needs IPv6, which Render's free plan does not have. |
| Render for the backend | Vercel is made for frontends; FastAPI needs a long-running Python server. |
| Personal QR codes: a key per user, TOTP-style | Putting `QR_SECRET` on phones would let anyone sign codes for anyone. A key per user only makes codes for that user, uses only `hmac` (stdlib) and Web Crypto (built into the browser), and is the same idea as an authenticator app. |
| A random nonce in each personal code | Single use like admin codes, and "New code" allows going in and out within the same 30 seconds. |
| Prototype as a visual reference, not as code | Its code is one large file with fake data, hardcoded Spanish texts and features the backend does not have (terminal sync, long-lived QR codes). Small components keep each part easy to explain. |
| Bootstrap CSS only, no Bootstrap JavaScript | It is the course framework for grid, breakpoints and utilities; React state already opens and closes things. |
| Bottom menu on phones and tablets, side menu from 992px | Material Design navigation: thumbs reach the bottom bar; large screens have room for labels. The current page is marked with a shape and bold text, not only with color. |
| System fonts instead of Google Fonts | Google Fonts needs internet, and the app must work offline. |
| Dashboard numbers calculated in the browser | No new endpoint: today's events are few, and `stats.js` has small functions that are easy to explain and check. |
| Method/result filters and pages in the browser | The server already filters by days and user, which cuts the list the most. Doing the rest in the browser needs no API change. |
| CSV made in the browser, without a library | A CSV is text with separators; `toCsv` is a few lines and quotes values that contain `;` or quotes. |
| Bar chart with HTML and CSS | One `<li>` per hour with a height in %. No chart library to learn or credit, and screen readers get the numbers as text. |
| Places from a fixed list, not free text | Each place can be translated and filtered, and the server rejects anything else (422). Adding one is a line in `schemas.py`, `locations.js` and the two language files. |
| Terminals created by their first contact | No screen to register kiosks: setting one up is enough. A heartbeat every 30 s keeps an idle kiosk "connected". |
| The server says "connected", not the browser | It counts the seconds with its own clock, so a wrong clock on the admin's computer does not change the result. |

## How to verify

1. `cd backend && pytest`: 108 tests (8 new).
2. Locally, as the online demo: start the backend with `FACE_RECOGNITION_ENABLED=false`
   and the frontend with `VITE_FACE_RECOGNITION_ENABLED=false`. The home page shows the
   online demo notice, Users has no "Face" button, `/face-check` goes back home, and the
   kiosk asks for a QR code right away.
3. `http://localhost:8000/health` shows `"face_recognition": false`.

## Known limitations

- The online demo is live at https://local-qr-face-gate.vercel.app since Nov 18. Supabase (`us-east-1`) uses its
  own database user with a private `app` schema; Render runs in Virginia, next to it.
  The dev admin (`admin123`) does not exist there: the public server answers
  `invalid_credentials`.
- Render's free plan stops the backend after 15 minutes without requests; the next one
  takes about a minute.
- Week 4 (Oct 26–Nov 1) had no commits, and the README was not updated in week 3.

## Commits

```
feat: reject duplicate faces and record why access is denied
docs: add progress notes for weeks 5 and 6
feat: ask for a head turn at the kiosk before checking a face
```
