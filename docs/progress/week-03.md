# Week 3 (Oct 19–25, 2026): user management with a database

> These notes were written on Nov 8, 2026, after the week 3 commits. They describe the code
> as committed on Oct 25 (`8fc7f1b` and `24a69b4`).

## Goal

Replace the in-memory demo user with a real `users` table and add an admin page to list,
create, deactivate and reactivate users. Face enrollment will attach face templates to
these users, and access events will reference them.

## Changes

### Backend

| File | Change |
|---|---|
| `requirements.txt` | Adds `sqlalchemy` (database access) and `email-validator` (used by Pydantic's `EmailStr`). |
| `app/config.py` | New `database_url` setting, read from `DATABASE_URL`. Default: `sqlite:///./data/app.db`. |
| `app/database.py` | **New.** Engine, one session per request (`get_db`), and `init_db()`, which creates the tables and seeds the demo admin only when the table is empty. |
| `app/models.py` | **New.** `User` table: `id`, `email` (unique, always lowercase and trimmed), `name`, `role`, `is_active`, `password_hash` (nullable), `created_at`, `updated_at`. |
| `app/schemas.py` | **New.** Pydantic shapes for the API: `UserOut` (what the API returns), `UserCreate` and `UserUpdate` (what clients can send). |
| `app/users.py` | **New.** `/users` router. Every endpoint requires an admin. |
| `app/auth.py` | Reads users from the database instead of memory. The token now stores the user id instead of the email. New `require_admin` dependency. Rejects users deactivated after logging in. |
| `app/main.py` | Calls `init_db()` on startup through a `lifespan` handler, registers the users router, and turns validation errors into the `invalid_input` code. |
| `tests/conftest.py` | **New.** Each test gets its own in-memory SQLite database with the demo admin. Fixtures: `client`, `db`, `admin_token`, `member`. |
| `tests/test_auth.py` | Adapted to the database fixtures. 4 new tests: inactive admin, member without password, token of a deleted user, user deactivated after login. |
| `tests/test_users.py` | **New.** 16 tests: access control, create and list, ordering, duplicate email, invalid input, get, update, deactivate, reactivate and the self-protection rules. |

API summary:

| Endpoint | Body / query | Success | Errors (`detail`) |
|---|---|---|---|
| `GET /users` | `?include_inactive=false` | 200, list ordered by name | |
| `POST /users` | `{ name, email, role }` | 201, created user | 409 `email_already_exists` |
| `GET /users/{id}` | | 200, the user | 404 `user_not_found` |
| `PATCH /users/{id}` | any of `{ name, role, is_active }` | 200, updated user | 404 `user_not_found`, 400 `cannot_modify_self` |

Every `/users` endpoint can also return 401 `not_authenticated`, 401 `invalid_token`,
401 `inactive_user`, 403 `forbidden` (not an admin) and 422 `invalid_input` (bad request
data; the field errors are in `errors`).

Changes to the auth endpoints:

- `POST /auth/login` and `GET /auth/me` now return the user with `id` and `is_active`.
- `POST /auth/login` returns 401 `invalid_credentials` also when the user is inactive or
  has no password.
- `GET /auth/me` returns 401 `inactive_user` when the user was deactivated after logging
  in, and 401 `invalid_token` when the user no longer exists.

### Frontend

| File | Change |
|---|---|
| `package.json`, `package-lock.json` | Adds `react-router-dom`. |
| `src/main.jsx` | Wraps the app in `BrowserRouter`. |
| `src/App.jsx` | Routes `/` (home) and `/users`. `/users` is only for admins; unknown URLs go to `/`. While logged out, every URL shows the login form. |
| `src/components/NavBar.jsx` | **New.** "Home" and "Users" links in the top bar, only for admins. |
| `src/components/ErrorMessage.jsx` | **New.** Shows the translated message for an error code. Used by the login page and the users page. |
| `src/api.js` | New `errorCodeOf(error)` helper: the code to show for any caught error. |
| `src/auth/AuthContext.jsx` | Also exposes the `token`, so pages can send it with API calls. |
| `src/pages/LoginPage.jsx` | Uses `ErrorMessage` and `errorCodeOf`. |
| `src/pages/UsersPage.jsx` | **New.** Users table with search, "show inactive users" checkbox, and a Deactivate / Reactivate button per row. Loading, empty and error states. |
| `src/users/CreateUserForm.jsx` | **New.** Form to add a user (name, email, role). Clears itself and reloads the list after saving. |
| `src/users/usersApi.js` | **New.** `listUsers`, `createUser` and `updateUser`, built on `apiRequest`. |
| `src/App.css` | Styles for the navigation, users table, badges and create form. Below 640 px each table row becomes a card. |
| `src/locales/es.json`, `en.json` | New keys: `nav.*`, `users.*`, `roles.member`, and the error codes `missing_user_fields`, `email_already_exists`, `user_not_found`, `cannot_modify_self`, `forbidden`, `inactive_user`, `invalid_input`. |

### Docs

- This file, `README.md` and `CLAUDE.md` were updated for week 3 on Nov 8, together with a
  fix to the `create_token` docstring in `app/security.py`, which
  still said the token stores the email.

## Design decisions

| Decision | Why |
|---|---|
| SQLite in development, through SQLAlchemy 2.0 | No setup needed. The code only talks to SQLAlchemy, so moving to another database is mostly a `DATABASE_URL` change. |
| Deactivate users, never delete them | Access events and face templates will point to users. Deleting a user would break the audit history. |
| Only admins manage users and log in | Members are people who pass through access points; they do not use the admin portal. That is why `password_hash` is nullable. |
| Tables created with `create_all` at startup | Simple, with no migrations tool. The cost: a model change needs the SQLite file to be deleted (see limitations). |
| The token stores the user id, not the email | The id never changes. |
| The user is read from the database on every request | A deactivation takes effect immediately, even for tokens issued before it. |
| Database model and API schemas are separate | The API never returns fields like `password_hash`, and clients can only send the fields listed in the schema. |
| Emails normalized in the schema and in the model | The schema trims and lowercases before checking the email format; the model makes sure no code path can store an email with uppercase letters or spaces. |
| `require_admin` set on the whole `/users` router | No endpoint can be left unprotected by mistake. |
| Validation errors return `detail: "invalid_input"` | Keeps the convention that `detail` is always a translatable code. |
| An admin cannot deactivate themselves or drop their own admin role | Otherwise the system could end up with no admin at all. |
| Search runs in the browser | The list is small, so no extra API call is needed. |
| Old list requests are cancelled (`AbortController`) | If the checkbox changes before the answer arrives, an outdated list never replaces a newer one. |
| Table rows become cards below 640 px | A wide table does not fit at 360 px; each value is shown with its column name (`data-label`). |
| A fresh in-memory database per test | Tests never touch `backend/data/app.db` and cannot affect each other. |

## How to verify

1. `cd backend && pytest`: 36 tests (20 new).
2. `cd frontend && npm install && npm run build`: builds with no errors.
3. Delete `backend/data/app.db` if it exists and start the backend → the admin is seeded.
4. Start the frontend and log in as `admin@example.com` / `admin123`.
5. Go to "Usuarios" / "Users" → the admin appears.
6. Create a member → it appears in the list.
7. Create another user with the same email in uppercase → "email already exists" error.
8. Deactivate the member → it disappears; check "show inactive users" → it appears as
   inactive. Reactivate it.
9. The Deactivate button is disabled on your own row.
10. Switch language → every text on the page changes, including errors.
11. Restart the backend → the users are still there.
12. Narrow the browser to 360 px → cards instead of a table, no horizontal scroll.

## Known limitations

- No migrations: changing a model means deleting the SQLite file in development.
- Members cannot log in. This is intended.
- Admins created from the users page have no password, so they cannot log in until SSO
  replaces the temporary login.
- No pagination on `GET /users`. Fine for the expected number of users.
- Creating a user checks that the email is free and then inserts it. If two identical
  requests arrive at the same moment, the unique constraint prevents the duplicate, but the
  second request gets a 500 error instead of 409.
- If the token expires while a page is open, the page shows the "session expired" error but
  does not go back to the login form until it is reloaded.
- No frontend tests yet.

## Commits

```
feat(backend): add SQLite database and users API

- SQLAlchemy User model with SQLite in development, demo admin seeded on startup
- Login and current user read from the database; inactive users are rejected
- Admin-only /users endpoints: list, create, get and update (deactivate instead of delete)
- Validation errors return a translatable invalid_input code
- Tests with an in-memory database for auth and users
```

```
feat(frontend): add users management page with routing
```
