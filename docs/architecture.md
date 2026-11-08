# Architecture

> Living document. Updated as the design evolves.

## Overview

The whole system runs on **one machine, or inside one local network, with no cloud
services**: a FastAPI server with a SQLite database, and a React frontend opened in the
browser. The same frontend has three views: the **admin portal**, **face enrollment** and
the **access point** (kiosk). Internet is only needed to sign in with SSO.

```
┌──────────────────────────────────────────────────────────────┐
│  BROWSER (React)                                             │
│   Admin portal  ·  Face enrollment  ·  Access point (kiosk)  │
│   camera → face model (served locally) → face descriptor     │
│   QR display and QR scanner                                  │
└──────────────────────────────┬───────────────────────────────┘
                               │ HTTP + JSON (descriptors, never photos)
┌──────────────────────────────▼───────────────────────────────┐       ┌────────────────────┐
│  FASTAPI (same machine or local network)                     │ SSO   │ Microsoft Entra ID │
│   auth · users · faces · access (face / QR) · reports        │─ ─ ─ ▶│ (internet, only to │
└──────────────────────────────┬───────────────────────────────┘       │  sign in)          │
                               │ SQLAlchemy                            └────────────────────┘
┌──────────────────────────────▼───────────────────────────────┐
│  SQLITE                                                      │
│   users · face_templates · access_events · used_qr_nonces    │
└──────────────────────────────────────────────────────────────┘
```

### Status

| Part | Status |
|---|---|
| Users table, admin-only users API and users page | Done (week 3) |
| Temporary email/password login | Done (week 2), replaced by SSO later |
| Spanish / English UI | Done (week 2) |
| Access log: `access_events` table and admin list with filters | Done (week 5) |
| Writing events at the access point, reports page | Planned |
| Dynamic QR codes | Planned |
| Face enrollment and verification | Planned |
| SSO | Planned |

## Design decisions

### 1. One local server instead of offline terminals that sync

The brief asks for enrollment and QR codes that work **without an internet connection**.
This design reads it as "no cloud services": the access point's browser talks to a server
on the same machine or the local network, and everything keeps working when the internet
is down. This reading is pending confirmation from the Product Owner (question 2 in
[`questions-for-po.md`](questions-for-po.md)).

With one server and one database there is a single source of truth: no synchronization, no
conflicts and no stale copies of the user list.

**Trade-off:** if the local server stops, the access point stops too. This is acceptable
for a prototype with one access point. Independent terminals are described in
[Future evolution](#future-evolution).

### 2. Face descriptors are computed in the browser and compared on the server

1. The browser detects the face and computes a **descriptor**: a list of numbers that
   summarizes the face. Two photos of the same person give descriptors that are close to
   each other.
2. The model files are served by the local server (no CDN), so this works offline.
3. Only the descriptor is sent to the server. The photo never leaves the browser.
4. The server compares it with every enrolled descriptor (Euclidean distance) and accepts
   the closest user if the distance is below the threshold. With tens of users this takes
   no time, so no special search structure is needed.

Candidate library: `@vladmandic/face-api`, which gives detection and a 128-number
descriptor in one call. Its repository has been archived since September 2024, so the
version would be pinned; its author points to Human as the successor. The final choice is
made when face enrollment is implemented, and the library and model licenses are recorded
in the README credits.

### 3. The threshold is chosen with data

Letting the wrong person in (false acceptance) is worse than rejecting the right person
(false rejection), because a rejected person can still use a QR code. The threshold is
therefore chosen to keep the false acceptance rate (FAR) very low, even if the false
rejection rate (FRR) goes up.

It is calibrated with test captures of a few people: distances between captures of the
same person and of different people. See [`../ml/README.md`](../ml/README.md).

### 4. Store descriptors, not photos

Photos are never stored. Descriptors are still biometric data, so:

- Only admins can enroll people.
- A user's descriptors are deleted when the user is deactivated (pending question 7).
- They never leave the local server.
- Encrypting them at rest is an optional improvement.

### 5. Dynamic QR codes signed with HMAC

Each QR code holds a small signed token:

```
{ user_id, exp, nonce }
```

- It is created and checked with the same `create_token` / `verify_token` functions used
  for login tokens (`app/security.py`), but with **its own secret key**. With a different
  key, a QR code can never be used as a login token.
- An admin issues it from the portal (for example for a visitor, or for someone whose face
  is not recognized). It is valid for 30–60 seconds and the screen shows a new one when it
  expires.
- **Single use:** when a QR code is accepted, its `nonce` is saved in `used_qr_nonces`
  (unique column). A second use is rejected.
- The same local server creates and checks the codes, so both work without internet. A
  public/private key pair (for example Ed25519) is not needed, because no other device
  has to verify them.

### 6. Every access attempt is logged

The access point records every attempt, accepted or rejected, in `access_events`. Reports
filter these events by date and user. Each access point is set up as an entry or an exit
(question 5).

`GET /access-events` (admins only) lists the events, newest first, with three optional
filters: `start` (included), `end` (not included) and `user_id`. `start` and `end` are
exact moments with a time zone: the browser turns a local day into the moment it starts
and ends, and the server compares them in UTC, which is how dates are stored. The API
returns dates in UTC (ending in `Z`) so the browser shows them in local time.

The access point's endpoints are protected with a terminal key from the server settings,
not with SSO, so the kiosk keeps working without internet.

### 7. SSO for the admin portal

SSO (Microsoft Entra ID) protects the admin portal. The access point does not depend on it.

#### Temporary login until SSO is ready

SSO needs an app registration in Entra ID, which may need approval from the university.
Until then, a temporary email/password login is used. It is built so it can be swapped
for SSO without touching the rest of the app:

| Layer | Single entry point | Everything else uses... |
|---|---|---|
| Backend | `app/auth.py` → `get_current_user` | `Depends(get_current_user)` to get the user |
| Frontend | `src/auth/AuthContext.jsx` → `useAuth()` | `user`, `token`, `login()`, `logout()` |

How it works today:

1. `POST /auth/login` checks the password against a PBKDF2 hash and returns a signed
   token (HMAC-SHA256, with expiry; see `app/security.py`).
2. The frontend keeps the token in `sessionStorage` and sends it as
   `Authorization: Bearer <token>`.
3. `get_current_user` checks the signature and the expiry, reads the user from the
   database and returns it.

What changes with SSO (planned with Authlib, an OpenID Connect client for FastAPI):

- The backend gets two new endpoints: one redirects the admin to Microsoft, and the other
  receives the answer. Authlib checks Microsoft's signed answer and gives the backend the
  admin's email.
- The backend looks up that email in the `users` table, checks that the user is an active
  admin and then issues **the same token as today**. So `get_current_user` and the
  protected endpoints do not change.
- `AuthContext.jsx`: `login()` sends the browser to the backend's SSO endpoint instead of
  sending a password, and stores the token it gets back.
- The password endpoint is removed once SSO works.

API errors return a stable code in `detail` (for example `invalid_credentials`), never a
sentence. The frontend translates the code, so the backend stays language-agnostic.

### 8. Custom multi-language support

UI strings live in translation files inside the repository
(`frontend/src/locales/es.json`, `en.json`), loaded with react-i18next. No external
translation APIs. The initial language is the saved choice, then the browser language,
then Spanish. Adding a language means adding one JSON file with the same keys and
registering it in `src/i18n.js`.

## Data model

SQLite in development, through SQLAlchemy.

| Table | Main fields | Status |
|---|---|---|
| `users` | id, email, name, role (`admin` / `member`), is_active, password_hash (admins only), created_at, updated_at | Done |
| `face_templates` | id, user_id, descriptor (list of numbers), created_at | Planned |
| `access_events` | id, user_id (empty if nobody was recognized), method (`face` / `qr`), result (`granted` / `denied`), direction (`in` / `out`), distance (face only), created_at | Done |
| `used_qr_nonces` | nonce (unique), used_at | Planned |

Users are deactivated, never deleted, because access events point to them.

## Future evolution

The first version of this design (October 2026) had **independent access point
terminals** that kept working even without the local network:

- A PWA with a service worker, storing users and encrypted descriptors in the browser
  (IndexedDB with Dexie.js, encrypted with Web Crypto).
- One-way synchronization: users from the server to the terminals, access events from the
  terminals to the server (append-only, with a UUID per event).
- QR codes signed with Ed25519, so terminals only need the public key.
- A face model exported to ONNX and run with `onnxruntime-web`, with a check that Python
  and the browser produce the same embeddings.
- PostgreSQL as the central database.

It was left out because the brief does not need it and each piece adds new ways to fail:
sync conflicts, distributing keys, terminals with an outdated user list, and two runtimes
that must give the same embeddings. It would make sense with many access points at
different sites that must keep working while the network is down. The current design
keeps that path open: the same API and the same tables would be the central server of
that version.
