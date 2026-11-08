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
- **SSO**: Authlib in the backend; after Microsoft confirms the email, the backend issues
  its own token, so `get_current_user` does not change.
- **ML** (`ml/`): only threshold calibration (FAR/FRR) with test captures.
- The original distributed design is kept in `docs/architecture.md` under
  "Future evolution". Do not build it unless asked.

## Repository layout

```
backend/
  app/main.py          FastAPI app, CORS, routers, startup (init_db), invalid_input handler, /health
  app/auth.py          Temporary login: /auth/login, /auth/me, get_current_user, require_admin
  app/security.py      PBKDF2 password hashing and HMAC-signed tokens (stdlib only)
  app/config.py        Settings from environment variables, with dev defaults
  app/database.py      SQLAlchemy engine, get_db (one session per request), init_db + demo admin
  app/models.py        Database tables (User)
  app/schemas.py       Pydantic shapes the API receives and returns (UserOut, UserCreate, UserUpdate)
  app/users.py         Admin-only /users endpoints (list, create, get, update)
  tests/               pytest; conftest.py gives each test an in-memory SQLite database
frontend/
  src/main.jsx         Entry point: loads i18n, wraps the app in BrowserRouter and AuthProvider
  src/App.jsx          Layout, screen selection (loading / login) and routes (/, /users)
  src/i18n.js          i18next setup and supported languages
  src/locales/         es.json, en.json (own translation files)
  src/api.js           fetch wrapper; errors become ApiError with a stable code
  src/auth/            AuthContext and useAuth()
  src/components/      LanguageSwitcher, BackendStatus, NavBar, ErrorMessage
  src/pages/           LoginPage, HomePage, UsersPage
  src/users/           CreateUserForm and usersApi (calls to /users)
ml/                    Face match threshold calibration (README describes the steps)
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
uvicorn app.main:app --reload     # http://localhost:8000, docs at /docs
pytest
```

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

1. `access_events` table and an admin-only list endpoint filtered by date and user.
2. Dynamic QR codes: issue (admin) and check at the access point (single use).
3. Face enrollment and verification at the access point, with QR fallback.
4. SSO with Microsoft Entra ID through Authlib (ask for the app registration early).
5. Reports page, threshold calibration, full check with the internet disconnected.

### Open questions

See `docs/questions-for-po.md`. The ones that most affect the design:

- Does "local, no internet" mean no cloud (current plan: one local server), or no network
  at all?
- Is SSO for the admin portal enough to meet the SSO requirement?
- Is it enough that admins issue the QR codes?
