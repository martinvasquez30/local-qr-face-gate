# CLAUDE.md

Context for Claude Code when working in this repository.

## Working with the author

- The author is Martín, a university student. **Reply to him in Spanish.**
- Everything inside the repo (code, identifiers, comments, commit messages, docs) must be
  **in English**. This is a course rule.
- He has to defend the code in a technical Q&A at the final delivery, so explain what each change does and
  why. Prefer simple, readable solutions over clever ones.
- Ask before committing. Never push without explicit confirmation.
- Every time AI generates code, add a row to the "Credits and AI usage" table in
  `README.md` (date, tool, what it was used for). Credit third-party libraries there too.

## Course context

Diseño de Software (TICS316, 2nd semester 2026), Universidad Adolfo Ibáñez. Individual
project, **topic 3**. Product Owner: Nicolás Cenzano.

| Weight | What is graded |
|---|---|
| 70% | Iterative process: **at least one commit per week (Monday–Sunday)** since 2026-10-05, with incremental improvements |
| 30% | Final delivery: live demo, no slides, max 5 minutes, plus technical questions about the code |

Mandatory in the final demo for every project:

- Fully **responsive** UI (any screen size).
- **SSO** login.
- **Custom multi-language** support (no external translation APIs).

AI and third-party code are allowed if credited, and the author must understand them.

## Product scope (topic 3)

Access control system combining face recognition and dynamic QR codes.

1. **Registration and authentication**: secure enrollment of users with biometric data,
   **local, with no internet connection**; dynamic QR codes for temporary access.
2. **Real-time identity verification**: face recognition at access points; QR code
   fallback when face recognition fails.
3. **Access history and auditing**: detailed log of entries and exits; activity reports
   filtered by date and user.
4. **Offline operation**: generate and validate QR codes without internet.

## Architecture

Full design in `docs/architecture.md`. In short:

- **Local monolith, no cloud**: one FastAPI server with SQLite (through SQLAlchemy) on the
  same machine or local network. One React frontend with three views: admin portal, face
  enrollment and access point (kiosk). No sync, no PWA, no PostgreSQL.
- **Faces**: the browser computes a face descriptor with a pre-trained model served
  locally (candidate `@vladmandic/face-api`); photos never leave the browser. The server
  compares descriptors (Euclidean distance) against a threshold.
- **QR codes**: HMAC-signed tokens `{user_id, exp, nonce}` made with
  `create_token`/`verify_token`, with their **own secret** (never the login token secret).
  Issued by an admin, valid 30–60 s, single use through `used_qr_nonces`.
- **Access log**: every attempt goes to `access_events`; reports filter by date and user.
  Access point endpoints use a terminal key, not SSO.
- **SSO**: Authlib in the backend with any OpenID Connect provider (Google by default,
  chosen with `SSO_METADATA_URL`). After the provider confirms the email of an active
  admin, the backend issues its own token and redirects to `FRONTEND_URL/#token=...` (or
  `#error=<code>`), so `get_current_user` does not change.
- **No ML folder**: the threshold starts at 0.5 and is checked with a few test attempts
  (distances stored in `access_events`). No notebooks, ONNX or model comparison.
- The original distributed design is kept in `docs/architecture.md` under
  "Future evolution". Do not build it unless asked.

## Repository layout

```
backend/
  app/main.py          FastAPI app, CORS, routers, startup (init_db), invalid_input handler, /health
  app/auth.py          Login: SSO (/auth/sso/login, /auth/sso/callback) and temporary
                       password login (/auth/login); /auth/me, get_current_user, require_admin
  app/security.py      PBKDF2 password hashing and HMAC-signed tokens (stdlib only)
  app/config.py        Settings from environment variables, with dev defaults
  app/database.py      SQLAlchemy engine, get_db (one session per request), init_db + demo admin,
                       _add_new_columns (adds new nullable model columns to an existing SQLite file)
  app/models.py        Database tables (User, AccessEvent), allowed values, as_utc()
  app/schemas.py       Pydantic shapes the API receives and returns (users, access events)
  app/users.py         Admin-only /users endpoints (list, create, get, update)
  app/faces.py         Admin-only GET/PUT/DELETE /users/{id}/face (average of captures;
                       the numbers are never returned; 409 face_already_enrolled if the face
                       already belongs to another user)
  app/access_events.py Admin-only GET /access-events (filters: start, end, user_id)
  app/access.py        Access point: require_terminal (X-Terminal-Key), POST /access/face,
                       find_match (threshold + margin, returns a denial reason), POST /access/qr
                       (signature, expiry, single use), record_access (writes access_events,
                       with the reason, for both; the kiosk is not told face reasons)
  app/qr.py            Admin-only POST /users/{id}/qr; create_qr_token / read_qr_token
                       ("<user_id>:<nonce>" signed with QR_SECRET)
  tests/               pytest; conftest.py gives each test an in-memory SQLite database
frontend/
  src/main.jsx         Entry point: loads i18n, wraps the app in BrowserRouter and AuthProvider
  src/App.jsx          Layout, screen selection (loading / login) and routes (/, /users, /history, /kiosk, ...)
  src/i18n.js          i18next setup and supported languages
  src/locales/         es.json, en.json (own translation files)
  src/api.js           fetch wrapper; errors become ApiError with a stable code
  src/auth/            AuthContext and useAuth()
  src/components/      LanguageSwitcher, BackendStatus, NavBar, ErrorMessage, Camera
  src/pages/           LoginPage (SSO button + dev password form), HomePage, UsersPage,
                       FaceCheckPage (camera and face model check),
                       EnrollFacePage (/users/:userId/face: consent, 3 captures, save),
                       KioskPage (/kiosk: no user login; terminal key + entry/exit setup),
                       HistoryPage (/history: day range + user filters, summary, reason)
  src/kiosk/           kioskApi.js: checkFace, checkQr (send X-Terminal-Key);
                       qrScanner.js: readQrFromVideo (jsQR on the camera picture)
                       (QrPage: /users/:userId/qr, renews the code when it expires)
  src/users/           CreateUserForm and usersApi (calls to /users)
  src/history/         historyApi.js: listAccessEvents, local day -> UTC moment helpers
  src/face/            faceModel.js: loads face-api lazily, getDescriptor(video) -> 128 numbers
  scripts/             copy-models.mjs: copies the face model weights to public/models
                       (git-ignored) before `npm run dev` / `npm run build`
docs/
  architecture.md      Design and decisions
  questions-for-po.md  Open questions for the Product Owner
  progress/            One file per week describing what changed
```

## Commands

Backend (from `backend/`):

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate   |   macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
uvicorn app.main:app --reload --env-file .env   # http://localhost:8000, docs at /docs
pytest
```

`backend/.env` (copied from `backend/.env.example`, never committed) holds the SSO client
values and fixed secrets. Without it the server still runs, with SSO turned off.

Frontend (from `frontend/`):

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
```

Development login: `admin@example.com` / `admin123`.

## Conventions

- **Commits**: Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`,
  `chore:`). Small, focused commits are better for the 70% process grade.
- **No hardcoded UI text.** Every visible string goes through `t()`. Add each new key to
  **both** `es.json` and `en.json`.
- **API errors** return a stable code in `detail` (for example `invalid_credentials`). The
  frontend maps it to the `errors.<code>` translation key. Add the key when adding a code.
- **Authentication goes only through** `get_current_user` (backend) and `useAuth()`
  (frontend). This keeps the future SSO change contained in `auth.py` and `AuthContext.jsx`.
- Wrap every `localStorage` / `sessionStorage` access in `try/catch`.
- New backend behavior comes with pytest tests.
- Check the UI at a 360 px wide viewport before committing.

## Never

- Commit biometric data, face images, datasets, model weights (`.onnx`, `.pt`...), `.env`
  files or databases. `.gitignore` already covers them; keep it that way.
- Store face photos. Only embeddings are stored.
- Send images or biometric data to cloud APIs.
- Use external translation APIs.

## Progress

| Week | Dates | Delivered | Details |
|---|---|---|---|
| 1 | Oct 5–11 | Project scaffold: FastAPI health check, React + Vite, docs, ML plan | — |
| 2 | Oct 12–18 | Temporary login, Spanish/English language switcher | `docs/progress/week-02.md` |
| 3 | Oct 19–25 | SQLite database, admin-only users API, users management page with routing | `docs/progress/week-03.md` |

### Next steps

1. Progress notes for week 6 (`docs/progress/week-06.md`) and the progress table above.
2. Threshold check with a few people, full check with the internet disconnected.
3. Demo script (5 minutes) and rehearsal.
4. Extras if there is time: blink check (liveness), CSV export, encrypted descriptors.

### Open questions

See `docs/questions-for-po.md`. The ones that most affect the design:

- Does "local, no internet" mean no cloud (current plan: one local server), or no network
  at all?
- Is SSO for the admin portal enough to meet the SSO requirement?
- Is it enough that admins issue the QR codes?
