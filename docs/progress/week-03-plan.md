# Week 3 plan (Oct 19–25, 2026): user management with a database

Implementation spec for Claude Code. Read `CLAUDE.md` first and follow its conventions.

Suggested prompt:

> Lee CLAUDE.md y docs/progress/week-03-plan.md. Implementa el plan por fases, explicándome
> en español qué hace cada cambio. Corre los tests al terminar cada fase y no hagas commit
> sin preguntarme.

**Deadline: Sunday Oct 25, 23:59.** Phases 1–4 are the minimum for this week's commit.
Items marked *(stretch)* are only done if there is time left.

## Goal

Replace the in-memory demo user with a real `users` table and add an admin page to list,
create, deactivate and reactivate users. Face enrollment (next weeks) will attach face
templates to these users, and access events will reference them.

## Scope decisions (already agreed, do not change without asking)

| Decision | Reason |
|---|---|
| SQLite in development, through SQLAlchemy 2.0 | Zero setup. The architecture targets PostgreSQL; with SQLAlchemy, switching is a `DATABASE_URL` change. |
| **Deactivate, never delete** users (`is_active`) | Access events and face templates will reference users. Deleting would break the audit history. |
| Only admins manage users | Members are people who pass through access points; they do not use the admin portal. |
| Members have no password (`password_hash` is nullable) | Only admins log in. SSO will replace passwords later anyway. |
| Tables created with `Base.metadata.create_all` at startup | No migrations tool yet (Alembic is a later step). Document this as a known limitation. |
| `auth.py` stays the only module that knows how login works | Keeps the SSO swap local, as stated in `CLAUDE.md`. |

## Phase 1: database layer (backend)

New dependencies in `backend/requirements.txt`: `sqlalchemy>=2.0` and `email-validator>=2.0`
(used by Pydantic's `EmailStr`).

**`app/config.py`**: add `database_url`, read from `DATABASE_URL`, default
`sqlite:///./data/app.db`. `backend/data/` and `*.db` are already in `.gitignore`;
verify it.

**`app/database.py`** (new):

- `engine` (for SQLite pass `connect_args={"check_same_thread": False}`).
- `SessionLocal` and a declarative `Base`.
- `get_db()` dependency that yields a session and always closes it.
- `init_db()` that creates the `data/` folder if needed, runs `create_all`, and seeds the
  demo admin (`admin@example.com` / `admin123`, name "Admin") **only if the table is empty**.

**`app/models.py`** (new): `User` table using typed `Mapped` / `mapped_column`.

| Column | Type | Notes |
|---|---|---|
| `id` | int, PK | |
| `email` | str, unique, indexed | Always stored lowercase and trimmed |
| `name` | str | |
| `role` | str | `"admin"` or `"member"` |
| `is_active` | bool | Default `True` |
| `password_hash` | str, nullable | Only admins have one |
| `created_at` | datetime (UTC) | Set on insert |
| `updated_at` | datetime (UTC) | Set on insert and update |

**`app/main.py`**: call `init_db()` from a FastAPI `lifespan` handler (not the deprecated
`on_event`), and register the new users router.

## Phase 2: auth on top of the database (backend)

Update `app/auth.py`:

- Remove `_USERS`, `_PASSWORD_HASHES` and `DEMO_USER`. Read users from the database through
  `get_db`.
- Keep the dummy hash check so failed logins take the same time.
- Login fails with `invalid_credentials` if the user does not exist, is inactive, has no
  password, or the password is wrong. Same code for all cases.
- `get_current_user` returns 401 `invalid_token` if the user no longer exists, and 401
  `inactive_user` if they were deactivated after logging in.
- New dependency `require_admin` that returns 403 `forbidden` for non-admins.
- The public user schema (rename the current `User` model to `UserOut`) adds `id` and
  `is_active`. `/auth/me` returns it. Keep the frontend working with the new fields.

## Phase 3: users API (backend)

New router `app/users.py`, prefix `/users`, every endpoint protected by `require_admin`.

| Endpoint | Body / query | Success | Errors (`detail`) |
|---|---|---|---|
| `GET /users` | `?include_inactive=false` | 200, list ordered by name | |
| `POST /users` | `{ name, email, role }` | 201, created user | 409 `email_already_exists` |
| `GET /users/{id}` | | 200 | 404 `user_not_found` |
| `PATCH /users/{id}` | any of `{ name, role, is_active }` | 200 | 404 `user_not_found`, 400 `cannot_modify_self` |

Rules:

- Normalize email (trim + lowercase) before checking uniqueness and saving.
- `name` is trimmed and cannot be empty; validate with Pydantic.
- An admin cannot deactivate themselves or remove their own admin role
  (`cannot_modify_self`). Otherwise the system could end up with no admin.
- Creating a user never sets a password (new users are members or future SSO admins).

**Validation errors**: add an exception handler in `main.py` for `RequestValidationError`
that returns 422 with `detail: "invalid_input"` (keep the field errors in another key, e.g.
`errors`). This keeps the convention that `detail` is always a translatable code.

## Phase 4: tests (backend)

- New `tests/conftest.py`: each test gets a fresh **in-memory** SQLite database
  (`sqlite://` with `StaticPool`), `app.dependency_overrides[get_db]`, and the seeded admin.
  Fixtures: `client`, `admin_token`, `member` (an active member created in the DB).
- Adapt `tests/test_auth.py` to the fixtures. Add: inactive admin cannot log in; token of a
  user deactivated after login gets `inactive_user`.
- New `tests/test_users.py`, at least:
  - 401 without token, 403 with a member token *(a member token can be created with
    `create_token` directly, since members cannot log in)*.
  - Create user, then list includes it.
  - Duplicate email (different case) → 409.
  - Invalid email → 422 `invalid_input`.
  - Deactivate → hidden from default list, shown with `include_inactive=true`.
  - Reactivate.
  - Admin deactivating themselves → 400 `cannot_modify_self`.
  - Unknown id → 404.
- `test_security.py` and `test_health.py` must keep passing.

**Checkpoint:** `pytest` all green → propose commit 1:

```
feat(backend): add SQLite database and users API
```

## Phase 5: users page (frontend)

**Navigation**: add `react-router-dom`. Routes: `/` (home) and `/users`. When logged out,
any route shows the login page. Add nav links in the top bar ("Inicio" / "Usuarios"),
only for logged-in admins. The language switcher stays in the top bar.

**`src/users/usersApi.js`** (new): `listUsers`, `createUser`, `updateUser`, built on
`apiRequest` with the token from `useAuth()`.

**`src/pages/UsersPage.jsx`** (new):

- Table with name, email, role, status and an action button (Deactivate / Reactivate).
- "Show inactive users" checkbox.
- Create form: name, email, role (`member` by default). On success, clear the form and
  refresh the list.
- Loading, empty ("No users yet") and error states. Errors use `errors.<code>`.
- Disable the deactivate button on the admin's own row.
- *(stretch)* Edit name and role inline.
- *(stretch)* Search by name or email (client-side filter is enough).

**Responsive**: below ~640 px, show each row as a card (labels next to values) instead of
a wide table. No horizontal scroll at 360 px.

**Translations**: add every new key to both `es.json` and `en.json`: `nav.*`, `users.*`,
`roles.member`, and the error codes `email_already_exists`, `user_not_found`,
`cannot_modify_self`, `forbidden`, `inactive_user`, `invalid_input`.

**Checkpoint:** `npm run build` with no errors, manual check in the browser (see below) →
propose commit 2:

```
feat(frontend): add users management page with routing
```

## Phase 6: docs

- `docs/progress/week-03.md`: same structure as `week-02.md` (goal, changes per file, API
  table, design decisions, how to verify, known limitations, commit). No demo questions.
- `CLAUDE.md`: update the repository layout, add the week 3 row to the progress table,
  and update next steps (SSO first).
- `docs/architecture.md`: mark the `User` entity as implemented and mention SQLite in
  development.
- `README.md`: roadmap (`[x] User management`), a new row in "Credits and AI usage", and add
  SQLAlchemy, email-validator and React Router to the libraries table. **Check each
  license** on the package page instead of assuming it.

Propose commit 3:

```
docs: add week 3 progress notes and update project docs
```

## Manual verification

With backend and frontend running:

1. Delete `backend/data/app.db` if it exists and start the backend → the admin is seeded.
2. Log in as `admin@example.com` / `admin123`.
3. Go to "Usuarios" → the admin appears.
4. Create a member → appears in the list.
5. Create another user with the same email in uppercase → "email already exists" error.
6. Deactivate the member → disappears; check "show inactive" → appears as inactive.
7. Reactivate it.
8. The deactivate button is disabled on your own row.
9. Switch language → every text on the page changes, including errors.
10. Restart the backend → users are still there (persistence).
11. 360 px width → cards instead of table, no horizontal scroll.

## Known limitations to document

- No migrations: changing a model means deleting the SQLite file in development.
- Members cannot log in yet; that is intended until SSO.
- No pagination on `GET /users` (fine for the expected scale).
