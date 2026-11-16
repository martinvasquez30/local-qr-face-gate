# Week 6 (Nov 9–15, 2026): SSO, face recognition, QR codes and history

> These notes were written on Nov 16, 2026. They describe the code as committed between
> Nov 14 and Nov 15 (`e4fbc8b` to `8703a4b`).

## Goal

Build every part of the product that was still missing, so that the whole flow works
end to end on one machine:

1. SSO login (mandatory for the course).
2. Face model in the browser and face enrollment.
3. Face verification at the access point (kiosk).
4. Dynamic single-use QR codes as the fallback.
5. Access history page with filters.

## Changes

### 1. SSO with OpenID Connect (`e4fbc8b`)

| File | Change |
|---|---|
| `backend/app/auth.py` | `GET /auth/sso/login` redirects to the provider; `GET /auth/sso/callback` receives the answer. Only an **active admin** with a **verified email** gets a token. The backend then issues its own token (the same as the password login) and redirects to `FRONTEND_URL/#token=...`, or `#error=<code>` (`sso_not_configured`, `sso_failed`, `sso_not_allowed`). |
| `backend/app/config.py`, `.env.example` | `SSO_METADATA_URL` (Google by default), `SSO_CLIENT_ID`, `SSO_CLIENT_SECRET`, `SESSION_SECRET`, `FRONTEND_URL`. |
| `backend/app/main.py` | `SessionMiddleware`: keeps the random OAuth `state` in a signed cookie between the redirect and the callback. |
| `backend/requirements.txt` | Adds `authlib`, `httpx` and `itsdangerous`. |
| `backend/tests/test_sso.py` | **New.** 9 tests with a faked provider. |
| `frontend/src/auth/AuthContext.jsx` | Reads `#token` or `#error` when the page loads and removes it from the address bar. |
| `frontend/src/pages/LoginPage.jsx` | "Sign in with Google" button; the password form stays below as "development access". |

On Nov 15 it was tested with a real Google OAuth client (app in testing mode) (`8703a4b`).

### 2. Face model and enrollment (`9d16c16`, `e595dc4`, `c894615`, `eb02009`)

| File | Change |
|---|---|
| `frontend/package.json` | Adds `@vladmandic/face-api` 1.7.15 (pinned: the repository is archived). |
| `frontend/scripts/copy-models.mjs` | **New.** Copies the model weights to `public/models` (git-ignored) before `npm run dev` and `npm run build`, so the model is served locally and works without internet. |
| `frontend/src/face/faceModel.js` | **New.** Loads the library only when needed. `getDescriptor(video)` returns 128 numbers, or `no_face`, `multiple_faces` or `camera_not_ready`. |
| `frontend/src/components/Camera.jsx` | **New.** Opens the camera and always stops it when the page closes. Camera errors are translated. |
| `frontend/src/pages/FaceCheckPage.jsx` | **New.** `/face-check`: checks the camera and the model. |
| `backend/app/models.py` | New `FaceTemplate` table: one per user, the descriptor as a JSON list. |
| `backend/app/faces.py` | **New.** Admin-only `GET`, `PUT` and `DELETE /users/{id}/face`. `PUT` stores the **average** of 1–5 captures. The numbers are never returned. |
| `backend/app/users.py` | Deactivating a user deletes their face. |
| `frontend/src/pages/EnrollFacePage.jsx` | **New.** `/users/:userId/face`: consent first, then the camera, 3 captures, save or delete. |
| `backend/tests/test_faces.py` | **New.** 12 tests. |
| `ml/` | **Removed.** The threshold starts at 0.5 and is checked with real attempts (see below). |

### 3. Access point (`c1fe56d`, `9df97b9`)

| File | Change |
|---|---|
| `backend/app/access.py` | **New.** `POST /access/face`, protected by the `X-Terminal-Key` header instead of a user login. `find_match` takes the closest face of an active user and accepts it only if the distance is below **0.5** and at least **0.05** smaller than the second closest. `record_access` writes every attempt to `access_events`. |
| `backend/app/config.py`, `.env.example` | `TERMINAL_KEY`, `FACE_MATCH_THRESHOLD`, `FACE_MATCH_MARGIN`. |
| `frontend/src/pages/KioskPage.jsx` | **New.** `/kiosk`, outside the login. One-time setup (terminal key, entry or exit) saved in the browser. Checks one face every 1.5 s, shows the result for 3 s, waits for the person to leave after entering, and suggests a QR code after 3 denied attempts in a row. |
| `backend/tests/test_access.py` | **New.** 12 tests. |

### 4. Dynamic QR codes (`3b58041`, `76a4783`)

| File | Change |
|---|---|
| `backend/app/qr.py` | **New.** Admin-only `POST /users/{id}/qr`. The token is `"<user_id>:<nonce>"` with an expiry (60 s), signed with **its own** `QR_SECRET`, so a QR code can never be used as a login token. |
| `backend/app/models.py` | New `UsedQrNonce` table: the nonce is the primary key. |
| `backend/app/access.py` | `POST /access/qr` checks the signature, the expiry and that the user is active, then saves the nonce. A second use breaks the primary key, so the database itself enforces **single use**. Denied answers carry a reason: `qr_invalid`, `qr_expired`, `user_inactive`, `qr_already_used`. |
| `frontend/src/pages/QrPage.jsx` | **New.** `/users/:userId/qr`: draws the code (`qrcode.react`) with a countdown and asks for a new one when it expires. |
| `frontend/src/kiosk/qrScanner.js` | **New.** Reads a QR code from the camera picture with `jsQR`. |
| `frontend/src/pages/KioskPage.jsx` | "Use a QR code" mode: the same camera, searched every 300 ms for up to 20 s. |
| `backend/tests/test_qr.py` | **New.** 11 tests. |

### 5. History page (`c414231`)

| File | Change |
|---|---|
| `frontend/src/pages/HistoryPage.jsx` | **New.** `/history`: "from" and "to" days and a person filter, a summary (attempts, granted, denied) and the table. A newer filter cancels the older request. |
| `frontend/src/history/historyApi.js` | **New.** Turns a local day into the exact moment it starts, so the server's UTC filter covers the whole local day. |
| `frontend/src/App.css` | Shared `.data-table` style for the users and history tables (cards below 640 px). |

## Design decisions

| Decision | Why |
|---|---|
| The browser computes the descriptor; the server compares | Photos never leave the browser. Only 128 numbers travel, and only to the local server. |
| face-api instead of training a model | A pre-trained model is enough for a prototype and keeps the project small. |
| Average of 3 captures | Small changes in light and angle cancel out; one template per user keeps the comparison simple. |
| Threshold 0.5 plus a margin of 0.05 | Letting the wrong person in is worse than turning the right one away, who can still use a QR code. The margin stops the kiosk from guessing between two similar people. |
| The kiosk uses a terminal key, not SSO | The door must keep working without internet and without someone logged in. |
| QR codes signed with HMAC and their own secret | The same server creates and checks them, so no public/private key pair is needed. A separate secret keeps QR codes and login tokens apart. |
| Single use through a primary key | The database refuses the second copy, even if two kiosks read the same code at the same moment. |
| One `record_access` for face and QR | Both methods end up in the same log, with the same fields. |
| The SSO token goes after `#` in the redirect | The part after `#` is never sent to a server, so the token does not end up in logs. |

## How to verify

1. `cd backend && pytest`: 89 tests (44 new).
2. Log in with Google (needs `backend/.env`, see the README) or with the development login.
3. Users → add a person → Face → accept → 3 captures → save.
4. Access point → set the terminal key → look at the camera → "Welcome, <name>".
5. Users → QR → take a photo of it with a phone → at the kiosk, "Use a QR code" → granted;
   show it again → "This QR code was already used".
6. History → today's attempts, with the distance of the face attempts.
7. Switch language and narrow the browser to 360 px on each page.

## Tests with a real camera (Nov 14–15)

| Attempt | Distance |
|---|---|
| The enrolled person, in front of the camera | 0.35 |
| Another person's photo | 0.65 |
| A photo of the enrolled person shown on a phone | 0.42 |

The threshold separates the first two. The third is accepted: there is no liveness check
(see limitations).

On Nov 15 the whole flow was also tested **with the Wi-Fi turned off**: portal, new user,
enrollment, kiosk with face and QR, history and languages all worked. Every file the
frontend loads comes from `localhost`.

## Known limitations

- **No liveness check:** a photo of an enrolled person on a phone can get in.
- Found on Nov 15 and **fixed in week 7** (`76cb702`):
  - The same face could be enrolled for two users. The kiosk then turned that person away
    almost every time (the margin rule).
  - Denied attempts did not say why.
  - Starting the backend without internet made the Google button show a 500 error.
- The kiosk settings live in the browser's `localStorage`; another browser needs the setup
  again.
- One template per user: very different light can push the distance over the threshold.
- No frontend tests yet.

## Commits

```
feat(backend): add SSO login with OpenID Connect (Google by default)
feat(frontend): load face model and add camera check page
feat(backend): add face enrollment API
feat(frontend): add face enrollment page
chore: remove the ml folder and update docs for face enrollment
feat(backend): add face verification for the access point
feat(frontend): add access point (kiosk) page
feat(backend): add dynamic single-use QR codes
feat(frontend): show QR codes and read them at the access point
feat(frontend): add access history page with filters
docs: mark SSO with Google as tested
```
