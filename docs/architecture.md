# Architecture

> Living document. Updated as the design evolves.

## Overview

The system is split into **access point terminals** that work offline and a **central
server** that manages users and consolidates the audit log when terminals are online.
The face recognition model is evaluated in Python and runs inside the terminal's browser.

```
┌──────────────────────────────────────────┐        ┌───────────────────────────────┐
│  ACCESS POINT TERMINAL (PWA, offline)    │        │  CENTRAL SERVER               │
│                                          │        │                               │
│  React UI (kiosk view)                   │        │  FastAPI                      │
│   ├─ camera → MediaPipe face detection   │        │   ├─ SSO (Microsoft Entra ID) │
│   ├─ ONNX model (onnxruntime-web)        │ users  │   ├─ user & enrollment mgmt   │
│   │    → face embedding                  │◀───────│   ├─ QR key management        │
│   ├─ QR scanner + signature validation   │        │   └─ reports (date / user)    │
│   └─ IndexedDB (Dexie.js)                │ events │                               │
│        ├─ authorized users + embeddings  │───────▶│  PostgreSQL                   │
│        └─ pending access events          │        │   └─ users, events, audit     │
└──────────────────────────────────────────┘        └───────────────────────────────┘
                                                                  ▲
                                                                  │ SSO login
                                                     ┌────────────┴────────────┐
                                                     │  Admin portal (React)   │
                                                     └─────────────────────────┘

┌──────────────────────────────────────────┐
│  ML PIPELINE (Python, offline work)      │
│  model evaluation → threshold → ONNX ────┼──▶ deployed to terminals
└──────────────────────────────────────────┘
```

## Design decisions

### 1. Face recognition runs in the terminal's browser

The terminal detects the face with MediaPipe, aligns and crops it, and computes an embedding
with an ONNX model through `onnxruntime-web`. No image ever leaves the terminal, and
verification works with no connection.

### 2. The model is chosen and calibrated in Python

The ML pipeline (see [`../ml/README.md`](../ml/README.md)) compares pre-trained models on a
public dataset, measures FAR and FRR, and picks the similarity threshold with data. The
same model is exported to ONNX for the browser, and a parity check ensures both environments
produce the same embeddings.

### 3. Store face embeddings, not photos

Only embeddings are stored. Raw photos are discarded after enrollment. Embeddings are
biometric data and are treated as sensitive:

- Encrypted at rest in IndexedDB using the Web Crypto API (non-extractable keys).
- The terminal requests persistent storage (`navigator.storage.persist()`) so the browser
  does not evict the data.

### 4. One-way synchronization in each direction

To avoid sync conflicts, data only flows one way per type:

| Direction | Data | Rule |
|---|---|---|
| Server → terminal | Authorized users and their embeddings | Terminal only downloads; server is the source of truth |
| Terminal → server | Access events | Append-only; each event has a UUID generated at the terminal, so re-sending is idempotent |

### 5. Signed dynamic QR codes

Each QR code encodes a small payload:

```
{ user_id, issued_at, expires_at, nonce }
```

The payload is signed with **Ed25519**. Terminals only need the **public key** to verify the
signature and expiry, so validation works offline. Short validity windows (e.g. 30–60 s)
make screenshots useless. Each terminal keeps a local cache of used nonces to prevent
replay within the window.

Open question: where QR codes are **generated** while offline (see
[`questions-for-po.md`](questions-for-po.md)).

### 6. SSO for the admin portal

SSO (Microsoft Entra ID) protects the admin portal on the central server. Terminals do not
depend on SSO to validate people at the door.

#### Temporary login until SSO is ready

SSO needs an app registration in Entra ID, which may need approval from the university.
Until then, a temporary email/password login is used. It is built so it can be swapped
for SSO without touching the rest of the app:

| Layer | Single entry point | Everything else uses... |
|---|---|---|
| Backend | `app/auth.py` → `get_current_user` | `Depends(get_current_user)` to get the user |
| Frontend | `src/auth/AuthContext.jsx` → `useAuth()` | `user`, `login()`, `logout()` |

How it works today:

1. `POST /auth/login` checks the password against a PBKDF2 hash and returns a signed
   token (HMAC-SHA256, with expiry; see `app/security.py`).
2. The frontend keeps the token in `sessionStorage` and sends it as
   `Authorization: Bearer <token>`.
3. `get_current_user` checks the signature and the expiry, and returns the user.

What changes with SSO:

- `AuthContext.jsx`: `login()` redirects to Microsoft (OpenID Connect, authorization
  code flow with PKCE) instead of sending a password.
- `auth.py`: `get_current_user` validates the token issued by Entra ID (signature with
  Microsoft's public keys, issuer, audience) instead of our own token. The password
  endpoint and `security.py` token functions are removed.
- Pages, components and other endpoints do not change, because they only use
  `useAuth()` and `get_current_user`.

API errors return a stable code in `detail` (for example `invalid_credentials`), never a
sentence. The frontend translates the code, so the backend stays language-agnostic.

### 7. Custom multi-language support

UI strings live in translation files inside the repository
(`frontend/src/locales/es.json`, `en.json`), loaded with react-i18next. No external
translation APIs. The initial language is the saved choice, then the browser language,
then Spanish. Adding a language means adding one JSON file with the same keys and
registering it in `src/i18n.js`.

## Data model (draft)

### Central server (PostgreSQL)

| Entity | Main fields |
|---|---|
| `User` | id, full_name, email, role, is_active, created_at |
| `FaceTemplate` | id, user_id, embedding (encrypted), model_version, created_at |
| `AccessPoint` | id, name, location, public_key_fingerprint, last_sync_at |
| `AccessEvent` | id (UUID from terminal), user_id (nullable), access_point_id, method (face/qr), result, direction (in/out), similarity_score, occurred_at, received_at |
| `QrToken` | id, user_id, nonce, issued_at, expires_at |

### Terminal (IndexedDB)

| Store | Content |
|---|---|
| `authorizedUsers` | user_id, display name, encrypted embeddings, model_version |
| `pendingEvents` | access events not yet sent to the server |
| `usedNonces` | QR nonces seen during their validity window |
| `config` | QR public key, similarity threshold, model version |
