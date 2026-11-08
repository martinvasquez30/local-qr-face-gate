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
| SSO | Microsoft Entra ID (OpenID Connect) through Authlib | University accounts already use Microsoft 365 |

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

SSO is not set up yet, so there is a **temporary** email/password login. The first time
the backend starts with an empty database, it creates this demo admin:

| Email | Password |
|---|---|
| `admin@example.com` | `admin123` |

Users are stored in a SQLite file (`backend/data/app.db`, not committed). There are no
migrations yet: after changing a model, delete that file and restart the backend.

The temporary login will be replaced by SSO (see [`docs/architecture.md`](docs/architecture.md#temporary-login-until-sso-is-ready)).

### Environment variables

All variables are optional in development.

| Variable | Where | Default | Purpose |
|---|---|---|---|
| `TOKEN_SECRET` | backend | random on each start | Key that signs access tokens. Without it, restarting the backend logs everyone out. |
| `TOKEN_TTL_SECONDS` | backend | `3600` | How long a login lasts, in seconds. |
| `CORS_ORIGINS` | backend | `http://localhost:5173` | Comma-separated list of frontend origins allowed to call the API. |
| `DATABASE_URL` | backend | `sqlite:///./data/app.db` | Database location (SQLAlchemy URL), relative to the folder the backend is started from. |
| `VITE_API_BASE_URL` | frontend | `http://localhost:8000` | Backend URL. Copy `frontend/.env.example` to `frontend/.env` to change it. |

To keep sessions across backend restarts, set a fixed secret before starting the server:

```bash
# macOS/Linux
export TOKEN_SECRET="$(python -c 'import secrets; print(secrets.token_urlsafe(32))')"
# Windows PowerShell
$env:TOKEN_SECRET = python -c "import secrets; print(secrets.token_urlsafe(32))"
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
- [ ] SSO login (Microsoft Entra ID)
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
| 2026-11-08 | Claude Code (Anthropic) | Architecture and complexity review, simplified architecture docs, week 3 progress notes and documentation updates |

### Third-party libraries

| Library | Used for | License |
|---|---|---|
| [FastAPI](https://fastapi.tiangolo.com/) | Backend web framework (includes Pydantic and Starlette) | MIT |
| [Uvicorn](https://www.uvicorn.org/) | ASGI server that runs the backend | BSD-3-Clause |
| [pytest](https://pytest.org/) | Backend tests | MIT |
| [HTTPX](https://www.python-httpx.org/) | HTTP client used by FastAPI's `TestClient` | BSD-3-Clause |
| [SQLAlchemy](https://www.sqlalchemy.org/) | Database access (tables as Python classes) | MIT |
| [email-validator](https://github.com/JoshData/python-email-validator) | Email format check used by Pydantic's `EmailStr` | Unlicense |
| [React](https://react.dev/) | Frontend UI | MIT |
| [Vite](https://vitejs.dev/) and `@vitejs/plugin-react` | Frontend dev server and build | MIT |
| [i18next](https://www.i18next.com/) | Translation engine (with our own translation files) | MIT |
| [react-i18next](https://react.i18next.com/) | React bindings for i18next (`useTranslation`) | MIT |
| [React Router](https://reactrouter.com/) (`react-router-dom`) | Page routes (`/`, `/users`) and navigation links | MIT |

## Author

Martín Vásquez — Universidad Adolfo Ibáñez
