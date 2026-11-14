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

## Architecture at a glance

- Everything runs on **one machine or local network, with no cloud services**: a FastAPI
  server with a SQLite database, and a React frontend with three views (admin portal, face
  enrollment and access point).
- The **browser** computes a face descriptor with a locally served model; photos never
  leave it. The **server** compares descriptors, issues and checks signed QR codes, and
  logs every access attempt.
- Internet is only needed to sign in with **SSO**. The match threshold is calibrated with
  test data in **Python**.

See [`docs/architecture.md`](docs/architecture.md) for the full design.

## Tech stack

| Layer | Technology | Why |
|---|---|---|
| UI (admin portal, enrollment, access point) | React · Vite · React Router | Responsive single-page app |
| Face detection and descriptor | Pre-trained model in the browser (candidate: `@vladmandic/face-api`), files served locally | Runs locally, photos never leave the browser |
| Threshold calibration | Python · scikit-learn · Jupyter | Match threshold chosen with data (FAR / FRR) |
| Server | Python · FastAPI | Users, face matching, QR codes, access log and reports |
| Database | SQLite through SQLAlchemy | No setup, one local file |
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
├── ml/               Face match threshold calibration (Python)
│   ├── notebooks/
│   ├── src/
│   └── reports/
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

The SSO login button is not in the frontend yet, so the **temporary** email/password login
is still the way in (see [SSO setup](#sso-setup-google) for the backend part). The first time
the backend starts with an empty database, it creates this demo admin:

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
| `DATABASE_URL` | backend | `sqlite:///./data/app.db` | Database location (SQLAlchemy URL), relative to the folder the backend is started from. |
| `SSO_METADATA_URL` | backend | Google's OpenID configuration URL | Which SSO provider is used. |
| `SSO_CLIENT_ID` | backend | empty (SSO turned off) | Client ID given by the SSO provider. |
| `SSO_CLIENT_SECRET` | backend | empty | Client secret given by the SSO provider. Never commit it. |
| `SESSION_SECRET` | backend | random on each start | Signs the short-lived cookie used during the SSO sign-in. |
| `FRONTEND_URL` | backend | `http://localhost:5173` | Where the browser is sent after SSO. |
| `VITE_API_BASE_URL` | frontend | `http://localhost:8000` | Backend URL. Copy `frontend/.env.example` to `frontend/.env` to change it. |

To generate a random secret for `TOKEN_SECRET` or `SESSION_SECRET`:

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

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

### ML pipeline

See [`ml/README.md`](ml/README.md).

## Roadmap

- [x] Project scaffold, documentation and health check
- [x] Temporary email/password login (stand-in until SSO)
- [x] Multi-language support (Spanish / English)
- [x] User management (admin portal)
- [x] Simplified architecture: one local server, no cloud services
- [ ] Access log (every attempt) and reports by date and user
- [ ] Dynamic QR codes (HMAC-signed, single use)
- [ ] Face enrollment (descriptors only, no photos)
- [ ] Face verification at the access point, with QR fallback
- [ ] Match threshold calibrated with test captures (FAR / FRR)
- [ ] SSO login (OpenID Connect, Google first): backend done, frontend button next
- [ ] Full flow checked with the internet disconnected
- [ ] Liveness detection (anti-spoofing), stretch goal

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
| [email-validator](https://github.com/JoshData/python-email-validator) | Email format check used by Pydantic's `EmailStr` | Unlicense |
| [React](https://react.dev/) | Frontend UI | MIT |
| [Vite](https://vitejs.dev/) and `@vitejs/plugin-react` | Frontend dev server and build | MIT |
| [i18next](https://www.i18next.com/) | Translation engine (with our own translation files) | MIT |
| [react-i18next](https://react.i18next.com/) | React bindings for i18next (`useTranslation`) | MIT |
| [React Router](https://reactrouter.com/) (`react-router-dom`) | Page routes (`/`, `/users`) and navigation links | MIT |

## Author

Martín Vásquez — Universidad Adolfo Ibáñez
