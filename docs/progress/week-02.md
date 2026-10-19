# Week 2 (Oct 12–18, 2026): temporary login and multi-language support

## Goal

Cover two of the mandatory demo requirements, at least partially:

- **Login**: SSO with Microsoft needs an app registration in Entra ID, which may require
  university admin approval. To keep progress moving, a **temporary email/password login**
  was built and designed so SSO can replace it later without touching the rest of the app.
- **Custom multi-language**: Spanish and English with our own translation files.

## Changes

### Backend

| File | Change |
|---|---|
| `app/security.py` | **New.** Password hashing (PBKDF2-SHA256, 600,000 iterations, random salt) and HMAC-SHA256 signed tokens with expiry. Standard library only. |
| `app/config.py` | **New.** Settings read from environment variables, with development defaults. |
| `app/auth.py` | **New.** `POST /auth/login`, `GET /auth/me` and the `get_current_user` dependency. One demo user kept in memory. |
| `app/main.py` | Registers the auth router. |
| `tests/test_security.py` | **New.** 8 tests: hashing, token round trip, wrong secret, tampered token, expired token, malformed input. |
| `tests/test_auth.py` | **New.** 7 tests: valid login, email case/spaces, wrong password, unknown email, `/auth/me` with valid, missing and invalid tokens. |

API summary:

| Endpoint | Request | Success | Errors (`detail`) |
|---|---|---|---|
| `POST /auth/login` | `{ "email", "password" }` | `{ access_token, token_type, expires_in, user }` | 401 `invalid_credentials` |
| `GET /auth/me` | Header `Authorization: Bearer <token>` | `{ email, name, role }` | 401 `not_authenticated`, 401 `invalid_token` |

### Frontend

| File | Change |
|---|---|
| `src/i18n.js` | **New.** i18next setup. Initial language: saved choice → browser language → Spanish. Keeps `<html lang>` and the tab title in sync. |
| `src/locales/es.json`, `en.json` | **New.** All UI text, with identical keys in both files. |
| `src/components/LanguageSwitcher.jsx` | **New.** Language selector in the top bar; the choice is saved in `localStorage`. |
| `src/api.js` | **New.** `fetch` wrapper. Errors become `ApiError` with a `code` that matches an `errors.*` translation key. |
| `src/auth/AuthContext.jsx` | **New.** `AuthProvider` and `useAuth()` hook: `user`, `login`, `logout`, and session restore after reload via `/auth/me`. |
| `src/pages/LoginPage.jsx` | **New.** Login form with translated errors and a notice that the login is temporary. |
| `src/pages/HomePage.jsx` | **New.** Welcome screen with backend status and sign out. |
| `src/components/BackendStatus.jsx` | **New.** Health check indicator, moved out of `App.jsx`. |
| `src/App.jsx`, `src/main.jsx` | Top bar layout; shows loading, login or home depending on the session. |
| `src/App.css` | Styles for the top bar, form, buttons and errors; responsive and dark mode. |
| `package.json`, `package-lock.json` | Adds `i18next` and `react-i18next`. The lock file pins exact versions so every install is the same. |

### Docs

- `README.md`: demo credentials, environment variables, languages section, roadmap, AI
  usage row and third-party libraries table.
- `docs/architecture.md`: explains how the temporary login will be replaced by SSO.
- `docs/questions-for-po.md`: added (it was referenced but missing from the repo).
- `CLAUDE.md` and `docs/progress/`: project context and weekly progress notes.

## Design decisions

| Decision | Why |
|---|---|
| Auth isolated behind `get_current_user` and `useAuth()` | When SSO arrives, only `auth.py` and `AuthContext.jsx` change. Nothing else knows how login works. |
| Standard library crypto instead of a JWT library | No new dependencies, and every line is easy to read and explain. The token format follows the same idea as a JWT (payload + signature + expiry). |
| PBKDF2 with 600,000 iterations | Current OWASP recommendation for PBKDF2-HMAC-SHA256. Slows down brute force if hashes leak. |
| Password check even when the email does not exist | A failed login takes the same time either way, so attackers cannot discover which emails exist. |
| `hmac.compare_digest` for comparisons | Constant-time comparison avoids timing attacks on signatures and hashes. |
| Error codes instead of messages from the API | The backend stays language-agnostic; the frontend translates the code. |
| Token in `sessionStorage` | The session ends when the tab closes, which suits a temporary admin login. |
| Own detection logic instead of `i18next-browser-languagedetector` | Fewer dependencies and the priority order is explicit. |

## How to verify

1. `cd backend && pytest`: 15 new tests plus the existing health test, 16 in total.
2. `cd frontend && npm install && npm run dev`, with the backend running.
3. Wrong password → "Correo o contraseña incorrectos." / "Incorrect email or password."
4. Stop the backend and try to log in → network error message.
5. Log in with `admin@example.com` / `admin123` → welcome screen with server status.
6. Switch language → all text changes, including errors.
7. Reload the page → same language, still logged in.
8. Sign out → back to the login form.
9. Narrow the browser to about 360 px → nothing overflows.

## Known limitations

These are acceptable for a temporary login and will go away with SSO and the database:

- One demo user, kept in memory.
- Without `TOKEN_SECRET`, a new key is generated on each start, so restarting the backend
  logs everyone out (this includes `--reload` restarts).
- Tokens cannot be revoked before they expire; sign out only deletes the token in the
  browser.
- An open tab does not notice when its token expires; it finds out on the next reload,
  which goes back to the login form.
- No rate limiting on `/auth/login`.
- No frontend tests yet.

## Commit

```
feat: add temporary login and Spanish/English language switcher

- Email/password login with hashed passwords and signed tokens, to be replaced by SSO
- Custom translation files (es, en) with a persistent language selector
- Auth isolated behind get_current_user and useAuth() to ease the SSO migration
- Add missing questions-for-po.md, CLAUDE.md and weekly progress notes
```
