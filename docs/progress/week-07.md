# Week 7 (Nov 16–22, 2026): safer face checks and the online demo

> Work in progress: these notes are updated during the week. Last update: Nov 18, 2026.

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

### 4. Online demo without face recognition (not committed yet)

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

## Design decisions

| Decision | Why |
|---|---|
| The online demo runs the same code with a switch | No second version to maintain. The switch is checked by the backend, so even a modified frontend cannot send face data to the cloud server. |
| 403 before the body is used | The descriptor is neither stored nor logged; there is nothing biometric in the cloud database. |
| No demo admin on a public server | `admin123` is in the README, so anyone could sign in. With `INITIAL_ADMIN_EMAIL` the first admin can only use SSO. |
| Supabase through the session pooler | The direct connection needs IPv6, which Render's free plan does not have. |
| Render for the backend | Vercel is made for frontends; FastAPI needs a long-running Python server. |

## How to verify

1. `cd backend && pytest`: 108 tests (8 new).
2. Locally, as the online demo: start the backend with `FACE_RECOGNITION_ENABLED=false`
   and the frontend with `VITE_FACE_RECOGNITION_ENABLED=false`. The home page shows the
   online demo notice, Users has no "Face" button, `/face-check` goes back home, and the
   kiosk asks for a QR code right away.
3. `http://localhost:8000/health` shows `"face_recognition": false`.

## Known limitations

- The online demo is not deployed yet: the accounts on Vercel, Render and Supabase are
  created by the author (steps in the README).
- Render's free plan stops the backend after 15 minutes without requests; the next one
  takes about a minute.
- Week 4 (Oct 26–Nov 1) had no commits, and the README was not updated in week 3.

## Commits

```
feat: reject duplicate faces and record why access is denied
docs: add progress notes for weeks 5 and 6
feat: ask for a head turn at the kiosk before checking a face
```
