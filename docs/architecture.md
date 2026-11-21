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
│  FASTAPI (same machine or local network)                     │ SSO   │ SSO provider       │
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
| Writing events at the access point (face and QR) | Done (week 6) |
| History page with day range and user filters (`/history`) | Done (week 6) |
| Dynamic QR codes: issue (`/users/{id}/qr`) and check at the kiosk (`POST /access/qr`) | Done (week 6) |
| Face model and camera in the browser | Done (week 6) |
| Face enrollment (average of 3 captures, one template per user) | Done (week 6) |
| Face verification at the access point (`/kiosk`, `POST /access/face`) | Done (week 6) |
| SSO: backend endpoints (OpenID Connect, Google first) | Done (week 6) |
| SSO: login button in the frontend, tested with a real Google OAuth client | Done (week 6) |
| Online demo without face recognition (Vercel, Render, Supabase) | Done (week 7): https://local-qr-face-gate.vercel.app |
| Personal QR codes made by the user's device, also without internet (`/my-qr`, TOTP-style) | Done (week 7) |

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

It starts at 0.5, stricter than the library's usual 0.6, and is then checked with test
attempts of a few people: the access log stores the distance of every face attempt, so
the distances of the same person and of different people can be compared. The result
is written down in the docs. A large evaluation on a public dataset is out of scope.

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

How it works (done in week 6):

1. On the users page, the admin opens "QR" for a person (`/users/:userId/qr`). The page
   calls `POST /users/{id}/qr` and draws the returned token as a QR code
   (`qrcode.react`), with a 60-second countdown. At 0 it asks for a new code.
2. The token's subject is `"<user_id>:<nonce>"`, signed with `QR_SECRET` and an expiry.
3. At the kiosk, "Use a QR code" switches the same camera to QR reading: every 300 ms the
   picture is copied to a canvas and `jsQR` looks for a code (for up to 20 s).
4. `POST /access/qr` checks the signature and expiry, that the user exists and is active,
   and saves the nonce. Denied codes get a reason: `qr_invalid`, `qr_expired`,
   `user_inactive` or `qr_already_used`.
5. The result goes through the same `record_access` as faces, so both methods share one
   log. In the demo, the person takes a photo of the code with a phone and shows it to
   the kiosk; showing it a second time is denied.

#### Personal QR codes made by the user's device (week 7)

Admin codes need the server at the moment they are made. To let a user make their own
code even when their phone has no connection to the server (for example, they were
signed in and the internet went down), the user's device signs the codes itself. It works
like an authenticator app (TOTP, RFC 6238):

1. While online, the user signs in (SSO; members can now sign in too, but they only see
   "Home" and "My QR") and opens "My QR" (`/my-qr`). The page calls `POST /me/qr-key`:
   the server makes a random key for that user, stores it in `users.qr_key` and returns
   it. The browser keeps it in `sessionStorage` (forgotten when the tab is closed or on
   sign out).
2. From then on, without the network, the browser makes a code every 30 seconds:
   `P:<user_id>:<step>:<nonce>:<signature>`, where `step` is the number of 30-second
   periods since 1970 and the signature is HMAC-SHA256 of `"<user_id>:<step>:<nonce>"`
   with the key, computed with the browser's Web Crypto (`frontend/src/qr/personalQr.js`).
3. `POST /access/qr` sees the `P:` prefix and calls `read_personal_qr`: it checks the
   shape, recomputes the signature with that user's key, and accepts the current period,
   the previous one and the next one (codes live 30-60 s, plus up to 30 s of clock
   difference). The nonce goes to `used_qr_nonces` (prefixed `personal:`), so each code
   works once. "New code" makes another nonce, so a person can go in and out within the
   same 30 seconds.

**Why a key per user and not `QR_SECRET` on the phone:** a secret copied from the
browser could then sign codes for anyone. With a key per user, a copied key only makes
codes for that one user. A new key (opening "My QR" in a new tab) replaces the old one,
so a lost phone's codes stop working.

**Limits:** the key is stored readable in the database, like any TOTP server (HMAC
needs the same key on both sides); Ed25519 key pairs would avoid it, at the cost of a
crypto library. Web Crypto only works on secure pages (https or `localhost`), so a phone
that opens the local server as `http://192.168.x.x` gets a clear message instead of a
code. Without a PWA the page must already be open: reloading it without a connection
does not work.

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

How the access point checks a face (done in week 6):

1. `/kiosk` is set up once in the browser with the terminal key and entry/exit. Every
   1.5 s it looks for exactly one face, asks the person to **turn their head** (see
   "Liveness check" below) and sends the face's 128 numbers to `POST /access/face` with
   the `X-Terminal-Key` header, together with `liveness_passed`.
2. The server compares them with the faces of all **active** users and takes the closest.
   It accepts only if that distance is below `FACE_MATCH_THRESHOLD` (0.5) **and** at least
   `FACE_MATCH_MARGIN` (0.05) smaller than the second closest, so two similar people are
   never confused.
3. Every attempt is written to `access_events` with the distance, through one function
   (`record_access`) that the QR check also uses. The kiosk only receives "granted" with
   the person's name, or "denied".
4. A denied attempt also stores **why**: `face_no_match` (the closest face is beyond the
   threshold), `face_ambiguous` (two people almost equally close) or `no_faces_enrolled`.
   The history page shows it to admins; the kiosk still only says "not recognized",
   because telling a stranger why would only help them try again.
5. After a person gets in, the kiosk waits until they leave the camera before checking
   again, so one visit is not logged many times. After 3 denied attempts in a row it
   suggests asking for a QR code.

Enrollment rejects a face that already belongs to another user (`face_already_enrolled`,
closer than the threshold). In the first tests the same face was enrolled for two users,
and the margin rule turned that person away almost every time: 36 of 38 denied attempts
were under the threshold. The stored reasons make this kind of problem visible.

#### Liveness check (head turn)

Without it, a photo of an enrolled person shown on a phone was accepted (measured: 0.42
for the photo vs 0.35 for the real face). So before checking who the person is, the kiosk
asks them to turn their head to a random side (`src/face/headTurn.js`):

1. face-api already finds 68 points on the face to compute the descriptor. The **turn**
   is how far the tip of the nose is from the middle between the eyes, measured along the
   line that joins the eyes and divided by the distance between the eyes. It is about 0
   when looking straight, positive when the person turns to their left and negative to
   their right.
2. **Why a photo cannot pass:** the nose sticks out of a real face, so when the head
   turns, the nose moves sideways compared with the eyes (about 0.17 for a 20° turn). A
   photo is flat: however it is turned or tilted, the nose stays in the middle between
   the eyes (0.00). Measuring along the eye line means tilting the head to one side does
   not count as a turn.
3. The screen says "Turn your head to your left" or "...right", chosen at random, so a
   recorded video cannot know which way to turn. The kiosk measures many times per second
   (detection and points only, without the slower descriptor network), with a 30 ms pause
   between measures so the browser can still draw the screen. The turn counts when it
   changes by at least **0.15** from where the head started (the median of the first
   values), toward the side that was asked, within 5 s. Using the change, not the value,
   means a photo of someone who is already turned does not pass.
4. Then "Now look straight ahead": a turned face matches its enrolled face worse, so the
   descriptor is taken once the head is back near where it started (up to 3 s). It is
   taken after the turn, so the face that is checked is the face that turned.
5. The server receives `liveness_passed` as a **required** field. If the head did not
   turn, the attempt is denied with the reason `liveness_failed` and logged with the
   closest matching user, so the history shows whose face was shown.

**First attempt: blink detection, dropped.** A blink was tried first, measuring the gap
between the eyelids from the same 68 points. With a real camera, the face-api landmark
model barely moves the eyelid points when the eyes close: 0.216 with the eyes open,
0.186 with them closed, and 0.186 also appeared with the eyes open, just from noise.
Closed and open eyes could not be told apart, so it was replaced by the head turn, which
relies on points the model follows well (the nose and the eye centers).

Two problems found while testing, which apply to any check that measures many pictures
in a row:

- The first run of each network prepares its programs for the graphics card and freezes
  the page for seconds (measured: 6 s for the first detection, about 50 ms afterwards).
  Now `loadFaceModels` runs the three networks once on a blank picture (`warmUp`), while
  the screen says "Loading face model…".
- With no pause between measures, the instructions were never drawn. Hence the 30 ms
  pause.

The camera check page (`/face-check`) has a **head-turn test** that shows the turn live,
which side it means, the most it reached to each side and the measures per second. It is
how the 0.15 limit is checked with a real camera.

Limits, said plainly:

- Someone holding a **3D mask**, or a video that happens to turn to the right side, can
  pass. A sequence of two random turns would make guessing harder.
- The check runs in the kiosk's browser and the server trusts `liveness_passed`. That is
  acceptable because the kiosk is a trusted device identified by its terminal key; a
  modified kiosk could lie. A server-side check would need the server to see the video.
- It is not bank-grade anti-spoofing: that needs a trained anti-spoofing model or a depth
  camera.

### 7. SSO for the admin portal

SSO protects the admin portal. The access point does not depend on it.

Any **OpenID Connect** provider works with the same code: the provider is chosen with
`SSO_METADATA_URL` and the client values in the server settings. Development uses Google
because its app registration needs no approval. Microsoft Entra ID (for example, university
accounts) only needs other values; it must use the tenant-specific metadata URL, because
with the shared `common` URL the token issuer does not match and Authlib rejects it.

#### Temporary login until SSO is ready

Until the SSO button is in the frontend, a temporary email/password login is used. Both
are built so that the rest of the app does not depend on how the admin logged in:

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

How SSO works (backend done, with Authlib):

1. `GET /auth/sso/login` saves a random `state` value in a signed, short-lived cookie
   (Starlette's `SessionMiddleware`) and redirects the browser to the provider.
2. The admin signs in on the provider's page, and the provider sends the browser back to
   `GET /auth/sso/callback`.
3. Authlib checks that the `state` matches (so the answer was asked for by this browser),
   exchanges the code for the identity token and checks its signature with the provider's
   public keys.
4. The backend reads the email (`email`, or `preferred_username` for Microsoft), rejects
   it if the provider says it is not verified, and looks for an **active admin** with
   that email.
5. It then issues **the same token as the password login** and redirects to
   `FRONTEND_URL/#token=...`. On any problem it redirects to `FRONTEND_URL/#error=<code>`
   (`sso_not_configured`, `sso_failed`, `sso_not_allowed`, or `sso_unavailable` when the
   provider cannot be reached, for example without internet). The part after `#` stays in
   the browser and is never sent to a server, so the token does not end up in logs.

Because the backend keeps issuing its own token, `get_current_user` and the protected
endpoints do not change. What is left is the frontend: a "Sign in with Google" button and
`AuthContext.jsx` reading `#token` or `#error` when the page loads. The password endpoint
is removed or hidden once SSO works end to end.

API errors return a stable code in `detail` (for example `invalid_credentials`), never a
sentence. The frontend translates the code, so the backend stays language-agnostic.

### 8. Custom multi-language support

UI strings live in translation files inside the repository
(`frontend/src/locales/es.json`, `en.json`), loaded with react-i18next. No external
translation APIs. The initial language is the saved choice, then the browser language,
then Spanish. Adding a language means adding one JSON file with the same keys and
registering it in `src/i18n.js`.

### 9. Online demo without face recognition

The course rubric asks for an online deployment, but face descriptors are biometric data
and this project never sends them to a cloud server. The online demo therefore runs the
**same code** with one switch turned off:

- **Backend:** `FACE_RECOGNITION_ENABLED=false` makes `PUT /users/{id}/face` and
  `POST /access/face` answer `403 face_recognition_disabled` (dependency
  `require_face_recognition` in `faces.py`). The check runs before the body is used, so
  the descriptor is neither stored nor logged. Deleting a face still works. `/health`
  reports the switch.
- **Frontend:** `VITE_FACE_RECOGNITION_ENABLED=false` hides the face pages and buttons,
  and the kiosk only reads QR codes (it never loads the face model). The backend switch
  is the real protection; the frontend one only avoids offering something the server
  refuses.
- **Database:** PostgreSQL on Supabase instead of SQLite. Only `DATABASE_URL` changes;
  `normalize_database_url` makes SQLAlchemy use the psycopg 3 driver.
- **First admin:** on a public server a demo admin with a known password would let anyone
  in. With `INITIAL_ADMIN_EMAIL`, an empty database gets one admin with that email and no
  password, so the only way in is SSO.

Hosting: Vercel for the frontend (`frontend/vercel.json`), Render for the backend
(`render.yaml`), Supabase for the database. Steps in the README ("Online demo").

**Trade-off:** the online demo cannot show face recognition, which is the core of the
product; it is shown on the local installation. Pending confirmation from the Product
Owner (question 10 in [`questions-for-po.md`](questions-for-po.md)).

## Data model

SQLite in development, through SQLAlchemy (PostgreSQL on Supabase in the online demo).

| Table | Main fields | Status |
|---|---|---|
| `users` | id, email, name, role (`admin` / `member`), is_active, password_hash (admins only), created_at, updated_at | Done |
| `face_templates` | id, user_id (unique: one per user), descriptor (average of the captures, 128 numbers), created_at | Done |
| `access_events` | id, user_id (empty if nobody was recognized), method (`face` / `qr`), result (`granted` / `denied`), direction (`in` / `out`), distance (face only), reason (denied only), created_at | Done |
| `used_qr_nonces` | nonce (primary key, so it is unique; personal codes are prefixed `personal:`), used_at | Done |

Users are deactivated, never deleted, because access events point to them.

`create_all` only creates missing tables. When a model gets a new column that may be
empty, `init_db` adds it to the existing SQLite file with `ALTER TABLE ... ADD COLUMN`
(`_add_new_columns`), so the data is kept. Renaming or removing a column still needs the
file to be deleted; a migrations tool (Alembic) is not worth it for this project.

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
