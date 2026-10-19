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

- **Access point terminal**: React PWA that works offline. MediaPipe detects the face, an
  ONNX embedding model runs in the browser with `onnxruntime-web`, data lives in IndexedDB
  (Dexie.js) with embeddings encrypted through Web Crypto. QR codes are signed with Ed25519
  and validated offline with the public key.
- **Central server**: FastAPI + PostgreSQL. SSO, user management, reports, and sync with
  terminals. No database yet.
- **ML pipeline** (`ml/`): Python. Evaluate pre-trained face models on LFW, measure
  FAR/FRR, pick the similarity threshold with data, export to ONNX, and check that Python
  and the browser produce the same embeddings (parity check).
- **Sync**: one direction per data type. Users and embeddings go server → terminal;
  access events go terminal → server (append-only, UUID generated at the terminal).

## Repository layout

```
backend/
  app/main.py          FastAPI app, CORS, router registration, /health
  app/auth.py          Temporary login: /auth/login, /auth/me, get_current_user
  app/security.py      PBKDF2 password hashing and HMAC-signed tokens (stdlib only)
  app/config.py        Settings from environment variables, with dev defaults
  tests/               pytest
frontend/
  src/main.jsx         Entry point: loads i18n, wraps the app in AuthProvider
  src/App.jsx          Layout and screen selection (loading / login / home)
  src/i18n.js          i18next setup and supported languages
  src/locales/         es.json, en.json (own translation files)
  src/api.js           fetch wrapper; errors become ApiError with a stable code
  src/auth/            AuthContext and useAuth()
  src/components/      LanguageSwitcher, BackendStatus
  src/pages/           LoginPage, HomePage
ml/                    Model evaluation and export (README describes the pipeline)
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

### Next steps

1. SSO with Microsoft Entra ID, replacing the temporary login.
2. First ML notebook: evaluate a pre-trained model on LFW (FAR/FRR, ROC).
3. User management in the admin portal (requires a database).

### Open questions

See `docs/questions-for-po.md`. The ones that most affect the design:

- SSO needs internet, but enrollment and QR validation must work offline. Plan: SSO only
  for the admin portal.
- Does "local, no internet" mean no cloud, or no network at all?
- Where are QR codes generated while offline?
