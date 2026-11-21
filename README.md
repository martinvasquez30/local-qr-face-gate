# Access Control — Face Recognition & Dynamic QR

Individual project for **Diseño de Software (TICS316-2-2026)**, Universidad Adolfo Ibáñez.

An access control system that verifies people at access points using **face recognition**,
with **dynamic QR codes** as a fallback. Biometric data is processed and stored **locally**,
and QR codes can be generated and validated **without an internet connection**.

## Scope

Based on the project brief (topic 3):

1. **User registration and authentication**
   - Secure local enrollment of users with biometric data (no internet required).
   - Generation of dynamic QR codes for temporary access.
2. **Real-time identity verification**
   - Face recognition at access points.
   - QR code fallback when face recognition fails.
3. **Access history and auditing**
   - Detailed log of entries and exits.
   - Activity reports filtered by date and user.
4. **Offline operation**
   - Generate and validate QR codes without an internet connection.

General course requirements: fully **responsive** UI, **SSO** login and **custom multi-language**
support (no external translation APIs).

## Project status and weekly progress

**Current status (week 7):** the full flow works on one machine without internet: SSO and
user management, face enrollment, access point with face recognition (with a head-turn
liveness check) and QR fallback, and the access history with filters. The online demo
(without face recognition, see [Online demo](#online-demo-deployment)) is live at
https://local-qr-face-gate.vercel.app.

Each week's changes are described in detail in its own Markdown file in
[`docs/progress/`](docs/progress/): goal, changed files, design decisions, how to verify,
known limitations and commits.

| Week | Dates | Main changes | Details |
|---|---|---|---|
| 1 | Oct 5–11 | Project scaffold: FastAPI health check, React + Vite frontend, README and architecture notes | Initial commit (`3618985`) |
| 2 | Oct 12–18 | Temporary email/password login, Spanish/English language switcher | [`week-02.md`](docs/progress/week-02.md) |
| 3 | Oct 19–25 | SQLite database, admin-only users API, users management page with routing | [`week-03.md`](docs/progress/week-03.md) |
| 4 | Oct 26–Nov 1 | No commits this week | — |
| 5 | Nov 2–8 | Simpler architecture (one local server), access log table and filtered list API | [`week-05.md`](docs/progress/week-05.md) |
| 6 | Nov 9–15 | SSO with Google, face model and enrollment, kiosk with face and QR, single-use QR codes, history page; tested offline | [`week-06.md`](docs/progress/week-06.md) |
| 7 | Nov 16–22 | Duplicate faces rejected, reason for every denied attempt, head-turn liveness check, online demo deployment (in progress) | [`week-07.md`](docs/progress/week-07.md) |

## Architecture at a glance

- Everything runs on **one machine or local network, with no cloud services**: a FastAPI
  server with a SQLite database, and a React frontend with three views (admin portal, face
  enrollment and access point).
- The **browser** computes a face descriptor with a locally served model; photos never
  leave it. The **server** compares descriptors, issues and checks signed QR codes, and
  logs every access attempt.
- Internet is only needed to sign in with **SSO**. The match threshold starts at 0.5 and
  is checked with real attempts (their distances are stored in the access log).
- An **online demo** runs the same code in the cloud with face recognition turned off, so
  no biometric data ever reaches a cloud server (see [Online demo](#online-demo-deployment)).

See [`docs/architecture.md`](docs/architecture.md) for the full design.

## Tech stack

| Layer | Technology | Why |
|---|---|---|
| UI (admin portal, enrollment, access point) | React · Vite · React Router | Responsive single-page app |
| Face detection and descriptor | Pre-trained model in the browser (candidate: `@vladmandic/face-api`), files served locally | Runs locally, photos never leave the browser |
| Server | Python · FastAPI | Users, face matching, QR codes, access log and reports |
| Database | SQLite through SQLAlchemy (PostgreSQL on Supabase in the online demo) | No setup, one local file; the same code works with PostgreSQL |
| Online demo hosting | Vercel (frontend), Render (backend), Supabase (database) | Free plans; face recognition is off there |
| QR codes | HMAC-signed tokens (Python standard library) | Created and checked by the local server, no internet needed |
| i18n | react-i18next with own translation files | Custom multi-language, no external APIs |
| SSO | Any OpenID Connect provider through Authlib (Google during development) | The provider is configuration, not code |

## Project structure

```
access-control/
├── backend/          Local server (FastAPI)
│   ├── app/
│   └── tests/
├── frontend/         Admin portal, enrollment and access point UI (React + Vite)
│   └── src/
└── docs/             Architecture notes and open questions
```

## Getting started

### Backend

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate   |   macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
uvicorn app.main:app --reload
```

The API runs at http://localhost:8000 — check http://localhost:8000/health
and the interactive docs at http://localhost:8000/docs.

Run the tests:

```bash
pytest
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The app runs at http://localhost:5173. Sign in with the demo account below; the home
screen shows whether the backend is reachable.

### Demo login

Admins sign in with SSO (see [SSO setup](#sso-setup-google)). For local development there is
also a **temporary** email/password login. The first time the backend starts with an empty
database, it creates this demo admin (unless `INITIAL_ADMIN_EMAIL` is set, as in the online
demo):

| Email | Password |
|---|---|
| `admin@example.com` | `admin123` |

Users are stored in a SQLite file (`backend/data/app.db`, not committed). There are no
migrations yet: after changing a model, delete that file and restart the backend.

The temporary login will be replaced by SSO (see [`docs/architecture.md`](docs/architecture.md#temporary-login-until-sso-is-ready)).

### SSO setup (Google)

SSO works with any OpenID Connect provider; development uses Google.

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project and open
   the OAuth consent screen (Google Auth Platform). Choose **External** and add your Google
   account as a **test user**.
2. Create an **OAuth client ID** of type **Web application**, with this authorized
   redirect URI: `http://localhost:8000/auth/sso/callback`.
3. Copy `backend/.env.example` to `backend/.env` and fill in `SSO_CLIENT_ID` and
   `SSO_CLIENT_SECRET`.
4. On the Users page, create an **admin** with the same email as your Google account. Only
   active admins can sign in with SSO.
5. Start the backend with `uvicorn app.main:app --reload --env-file .env` and open
   `http://localhost:8000/auth/sso/login`. Use `localhost`, not `127.0.0.1`: the redirect
   URI must match exactly.

To use another provider, such as Microsoft Entra ID, change `SSO_METADATA_URL` and the
client values; the code stays the same.

### Environment variables

All variables are optional in development. The easiest way to set them is a
`backend/.env` file (see `backend/.env.example`), loaded with `--env-file .env`.

| Variable | Where | Default | Purpose |
|---|---|---|---|
| `TOKEN_SECRET` | backend | random on each start | Key that signs access tokens. Without it, restarting the backend logs everyone out. |
| `TOKEN_TTL_SECONDS` | backend | `3600` | How long a login lasts, in seconds. |
| `CORS_ORIGINS` | backend | `http://localhost:5173` | Comma-separated list of frontend origins allowed to call the API. |
| `DATABASE_URL` | backend | `sqlite:///./data/app.db` | Database location (SQLAlchemy URL), relative to the folder the backend is started from. A `postgresql://` URL (Supabase) also works. |
| `SSO_METADATA_URL` | backend | Google's OpenID configuration URL | Which SSO provider is used. |
| `SSO_CLIENT_ID` | backend | empty (SSO turned off) | Client ID given by the SSO provider. |
| `SSO_CLIENT_SECRET` | backend | empty | Client secret given by the SSO provider. Never commit it. |
| `SESSION_SECRET` | backend | random on each start | Signs the short-lived cookie used during the SSO sign-in. |
| `FRONTEND_URL` | backend | `http://localhost:5173` | Where the browser is sent after SSO. |
| `TERMINAL_KEY` | backend | `dev-terminal-key` | Key the access point (`/kiosk`) sends to prove it is a trusted device. Change it outside development. |
| `FACE_MATCH_THRESHOLD` | backend | `0.5` | Largest face distance that is still accepted. |
| `FACE_MATCH_MARGIN` | backend | `0.05` | How much closer the best match must be than the second best. |
| `QR_SECRET` | backend | random on each start | Signs QR codes. Must be different from `TOKEN_SECRET`. |
| `QR_TTL_SECONDS` | backend | `60` | How long a QR code is valid, in seconds. |
| `FACE_RECOGNITION_ENABLED` | backend | `true` | `false` in the online demo: the server refuses face descriptors (`403 face_recognition_disabled`). |
| `INITIAL_ADMIN_EMAIL` | backend | empty | If set, an empty database gets this admin (SSO only, no password) instead of the demo admin. Always set it on a public server. |
| `VITE_API_BASE_URL` | frontend | `http://localhost:8000` | Backend URL. Copy `frontend/.env.example` to `frontend/.env` to change it. |
| `VITE_SSO_PROVIDER_NAME` | frontend | `Google` | Name on the SSO button. Must match the provider set in the backend. |
| `VITE_FACE_RECOGNITION_ENABLED` | frontend | `true` | `false` in the online demo: hides the face pages and the kiosk only reads QR codes. Must match the backend. |

To generate a random secret for `TOKEN_SECRET` or `SESSION_SECRET`:

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

## Online demo (deployment)

The product is meant to run **locally**: face descriptors are biometric data and must not
reach a cloud server. The online demo runs the **same code** with face recognition turned
off, so the rest of the system can be tried from any browser:

**Live:** https://local-qr-face-gate.vercel.app (backend: https://access-control-api-3w44.onrender.com/health)

| Feature | Local installation | Online demo |
|---|---|---|
| SSO login, user management | Yes | Yes |
| Dynamic QR codes (issue and read at the kiosk) | Yes | Yes |
| Access history with filters | Yes | Yes |
| Spanish / English | Yes | Yes |
| Face enrollment and face check at the kiosk | Yes | **No** (the server refuses face data) |
| Works without internet | Yes | No |

| Part | Service | Configured in |
|---|---|---|
| Frontend | [Vercel](https://vercel.com/) (root directory `frontend`) | `frontend/vercel.json` (all routes go to `index.html`, so `/users` or `/kiosk` work on reload) |
| Backend | [Render](https://render.com/) web service (free plan) | `render.yaml` (Blueprint) |
| Database | [Supabase](https://supabase.com/) PostgreSQL | `DATABASE_URL` on Render; the tables are created on the first start |

### Steps

1. **Supabase:** create a project in `us-east-1` (next to Render's Virginia region). In
   the SQL editor, create a database user for the app with its own **private schema**
   (Supabase's automatic Data API only exposes the `public` schema, so the app's tables
   are never reachable through it):

   ```sql
   create role app_user with login password '<a long random password>';
   grant app_user to postgres;
   create schema app authorization app_user;
   revoke app_user from postgres;
   alter role app_user set search_path = app;
   revoke all on schema app from public;
   ```

   The connection string uses the **Session pooler** (the direct connection needs IPv6,
   which Render does not have), with the user written as `app_user.<project-ref>`:
   `postgresql://app_user.<project-ref>:<password>@aws-1-us-east-1.pooler.supabase.com:5432/postgres`.
   The tables are created by the backend on its first start.
2. **Render:** New → **Blueprint** → choose this repository. Render reads `render.yaml`,
   creates the secrets and asks for the rest:
   - `DATABASE_URL`: the Supabase string from step 1.
   - `INITIAL_ADMIN_EMAIL`: your Google email (the first admin, SSO only).
   - `FRONTEND_URL` and `CORS_ORIGINS`: the Vercel URL from step 3 (for example
     `https://<app>.vercel.app`). They can be filled in after step 3.
   - `SSO_CLIENT_ID` and `SSO_CLIENT_SECRET`: from Google (step 4).

   Check `https://<api>.onrender.com/health`: it must say `"face_recognition": false`.
3. **Vercel:** New Project → this repository → Root Directory `frontend` (Vite is
   detected). Environment variables:
   - `VITE_API_BASE_URL` = `https://<api>.onrender.com`
   - `VITE_FACE_RECOGNITION_ENABLED` = `false`
   - `VITE_SSO_PROVIDER_NAME` = `Google`

   Vite reads them **when building**: after changing one, deploy again.
4. **Google:** in the OAuth client, add the authorized redirect URI
   `https://<api>.onrender.com/auth/sso/callback`. While the app is in testing mode, every
   Google account that signs in must be a **test user**.
5. **Kiosk:** open `/kiosk` on the Vercel URL and type the `TERMINAL_KEY` that Render
   generated (Render dashboard → Environment).

To let someone else in (for example the evaluator), add their Google account as a test user
in Google and create them as an **admin** on the Users page.

**Free plan note:** Render stops the backend after 15 minutes without requests, and the
next request takes about a minute. Open `/health` a few minutes before a demo.

## Languages

The UI is available in **Spanish** and **English**, using our own translation files
(no external translation APIs):

- `frontend/src/locales/es.json` and `en.json` hold every visible text. Both files must
  have the same keys.
- The selector in the top bar changes the language and remembers it in the browser.
- The first time, the app uses the browser language if it is supported, otherwise Spanish.
- The backend never sends text to show; it sends error codes (for example
  `invalid_credentials`) that the frontend translates with the `errors.<code>` key.

To add a language, copy `es.json` to a new file (for example `pt.json`), translate the
values, and register it in `frontend/src/i18n.js` (`LANGUAGE_NAMES` and `resources`).

## Roadmap

- [x] Project scaffold, documentation and health check
- [x] Temporary email/password login (stand-in until SSO)
- [x] Multi-language support (Spanish / English)
- [x] User management (admin portal)
- [x] Simplified architecture: one local server, no cloud services
- [x] Access log (every attempt) and history page with date and user filters (`/history`)
- [x] Dynamic QR codes (HMAC-signed with their own key, valid 60 s, single use): `/users/{id}/qr`
- [x] Face verification at the access point (`/kiosk`); QR fallback suggested after 3 failures
- [x] QR code reading at the access point (same camera, "Use a QR code" button)
- [ ] Match threshold calibrated with test captures (FAR / FRR)
- [x] SSO login with Google (OpenID Connect; tested with a real Google OAuth client)
- [x] Face model and camera in the browser (`/face-check`)
- [x] Face enrollment: 3 captures averaged into one template per user (`/users/{id}/face`)
- [x] Full flow checked with the internet disconnected
- [x] Online demo: Vercel + Render + Supabase, face recognition only in the local installation (https://local-qr-face-gate.vercel.app)
- [x] Liveness check: the kiosk asks for a head turn to a random side (stops photos)

## Credits and AI usage

As allowed by the course rules, AI tools were used during development. All generated code
has been reviewed and studied by the author.

| Date | Tool | Used for |
|---|---|---|
| 2026-10-11 | Claude (Anthropic) | Initial project scaffold, README and architecture notes |
| 2026-10-18 | Claude Code (Anthropic) | Temporary login (backend and frontend), password hashing and signed tokens, i18n setup with Spanish/English files, styles, pytest tests and week 2 docs |
| 2026-10-25 | Claude Code (Anthropic) | Planning and implementation of the SQLite database layer and users API (backend), the users management page with routing (frontend), translations, styles and pytest tests |
| 2026-11-08 | Claude Code (Anthropic) | Architecture and complexity review, simplified architecture docs, week 3 progress notes and documentation updates, access events table and filtered list API with pytest tests |
| 2026-11-13 | Claude Code (Anthropic) | SSO login in the backend (OpenID Connect with Authlib), pytest tests with a faked provider, SSO setup docs |
| 2026-11-14 | Claude Code (Anthropic) | SSO sign-in button and token handling in the frontend; face model loading with face-api, camera component, camera check page and model copy script; face enrollment API (pytest tests) and capture page; removal of the `ml/` folder; face verification at the access point (`POST /access/face` with pytest tests, `/kiosk` page); dynamic single-use QR codes (issue and check endpoints with pytest tests, QR page, QR reading at the kiosk) |
| 2026-11-15 | Claude Code (Anthropic) | Access history page (`/history`) with date and user filters and a shared table style |
| 2026-11-15 | Claude Code (Anthropic) | Diagnosis of failed face attempts (same face enrolled for two users); rejecting a face already enrolled for another user; storing and showing why an attempt was denied; adding new columns to an existing SQLite database; SSO error page when the provider cannot be reached (all with pytest tests) |
| 2026-11-16 | Claude Code (Anthropic) | Progress notes for weeks 5 and 6 (`docs/progress/`) and the progress table in `CLAUDE.md` |
| 2026-11-17 | Claude Code (Anthropic) | Liveness check: a blink check was built and dropped after real tests (the landmark model barely moves the eyelids); replaced by a random head-turn challenge (`headTurn.js`), `liveness_passed` field and `liveness_failed` reason (pytest tests), network warm-up at load, live head-turn test on the camera check page |
| 2026-11-18 | Claude Code (Anthropic) | Summary of the course rubric against the project; weekly progress table in the README and week 7 notes; online demo: `FACE_RECOGNITION_ENABLED` switch (backend and frontend, QR-only kiosk), SSO-only first admin (`INITIAL_ADMIN_EMAIL`), PostgreSQL URLs with psycopg, `render.yaml` and `vercel.json`, deployment docs (with pytest tests) |
| 2026-11-18 | Claude Code (Anthropic) | Options to make QR codes without internet; personal QR codes signed in the browser with a key per user (TOTP-style, Web Crypto), `POST /me/qr-key`, check in `POST /access/qr`, SSO sign-in for members, "My QR" page (with pytest tests) |

### Third-party libraries

| Library | Used for | License |
|---|---|---|
| [FastAPI](https://fastapi.tiangolo.com/) | Backend web framework (includes Pydantic and Starlette) | MIT |
| [Uvicorn](https://www.uvicorn.org/) | ASGI server that runs the backend | BSD-3-Clause |
| [pytest](https://pytest.org/) | Backend tests | MIT |
| [HTTPX](https://www.python-httpx.org/) | HTTP client used by Authlib and by FastAPI's `TestClient` | BSD-3-Clause |
| [Authlib](https://authlib.org/) | SSO: OpenID Connect client (redirect, callback, identity token check) | BSD-3-Clause |
| [itsdangerous](https://itsdangerous.palletsprojects.com/) | Signed session cookie used during SSO (needed by Starlette's `SessionMiddleware`) | BSD-3-Clause |
| [SQLAlchemy](https://www.sqlalchemy.org/) | Database access (tables as Python classes) | MIT |
| [psycopg](https://www.psycopg.org/) 3 | PostgreSQL driver, used only by the online demo (Supabase) | LGPL-3.0 |
| [email-validator](https://github.com/JoshData/python-email-validator) | Email format check used by Pydantic's `EmailStr` | Unlicense |
| [React](https://react.dev/) | Frontend UI | MIT |
| [Vite](https://vitejs.dev/) and `@vitejs/plugin-react` | Frontend dev server and build | MIT |
| [i18next](https://www.i18next.com/) | Translation engine (with our own translation files) | MIT |
| [react-i18next](https://react.i18next.com/) | React bindings for i18next (`useTranslation`) | MIT |
| [React Router](https://reactrouter.com/) (`react-router-dom`) | Page routes (`/`, `/users`) and navigation links | MIT |
| [@vladmandic/face-api](https://github.com/vladmandic/face-api) 1.7.15 | Face detection and 128-number face descriptors in the browser (includes TensorFlow.js and the pre-trained weights: SSD MobileNet v1, 68-point landmarks, face recognition net). Repository archived since 2024; the version is pinned. | MIT |
| [qrcode.react](https://github.com/zpao/qrcode.react) 4.2.0 | Draws the QR code on the admin's QR page | ISC |
| [jsQR](https://github.com/cozmo/jsQR) 1.4.0 | Reads QR codes from the kiosk camera's picture | Apache-2.0 |

## Author

Martín Vásquez — Universidad Adolfo Ibáñez
