# Week 5 (Nov 2–8, 2026): simpler architecture and the access log

> These notes were written on Nov 16, 2026. They describe the code as committed on Nov 8
> (`56ea0c0`, `e01cf09`, `8a4ca24` and `7bf9791`).

## Goal

1. Catch up on the docs of week 3.
2. Review the architecture: the first design (independent offline terminals that sync
   with a central server) was more than the brief needs. Replace it with one local server.
3. Start the access log (`access_events`), which the access point will write to and the
   reports will read from.

## Changes

### Docs

| File | Change |
|---|---|
| `docs/progress/week-03.md` | **New.** Notes for week 3 (users and database). |
| `docs/architecture.md` | Rewritten around a **local monolith**: one FastAPI server with SQLite on the same machine or local network, one React frontend with three views (admin portal, face enrollment, access point). The distributed design is kept under "Future evolution". |
| `docs/questions-for-po.md` | Questions updated for the new design: SSO without internet, what "with no internet connection" means, where QR codes are generated, entries and exits, among others. |
| `ml/README.md`, `ml/requirements.txt` | Reduced to checking the match threshold. ONNX and OpenCV removed. (The folder was removed in week 6.) |
| `README.md`, `CLAUDE.md` | Architecture summary, roadmap and repository layout. |
| — | Internal planning notes were taken out of the repository (`e01cf09`). |

### Backend

| File | Change |
|---|---|
| `app/models.py` | New `AccessEvent` table: `id`, `user_id` (empty when nobody was recognized), `method` (`face` / `qr`), `result` (`granted` / `denied`), `direction` (`in` / `out`), `distance` (face only), `created_at` (UTC, indexed). New `as_utc()` helper. |
| `app/schemas.py` | `AccessEventOut`: dates are returned in UTC, ending in `Z`. |
| `app/access_events.py` | **New.** Admin-only `GET /access-events`. |
| `app/main.py` | Registers the new router. |
| `tests/conftest.py` | `admin_headers` fixture shared by all test files. |
| `tests/test_access_events.py` | **New.** 9 tests: access control, empty list, order, user filter, `start` included and `end` not, limits with a time zone, combined filters, invalid date. |

API summary:

| Endpoint | Query | Success | Errors (`detail`) |
|---|---|---|---|
| `GET /access-events` | optional `start`, `end`, `user_id` | 200, list, newest first | 401 / 403 like `/users`, 422 `invalid_input` |

`start` is included and `end` is not. Both are exact moments with a time zone (for example
`2026-11-08T03:00:00Z`); the browser turns a local day into these moments.

## Design decisions

| Decision | Why |
|---|---|
| One local server instead of offline terminals that sync | The brief asks to work without internet, not without a local network. One server and one database means no synchronization, no conflicts and no stale user lists. The trade-off (if the server stops, the access point stops) is fine for one access point. |
| Every attempt is logged, granted or denied | Auditing needs the failures too, and the face distances of real attempts are what checks the threshold. |
| `user_id` can be empty | An unknown face belongs to nobody, but the attempt is still logged. |
| Dates stored and compared in UTC | One rule everywhere. The browser shows them in local time. SQLite forgets the time zone, so `as_utc()` marks the dates it returns as UTC. |
| `end` is not included | Consecutive ranges (one day, then the next) never count an event twice. |
| Index on `created_at` | Reports always filter by date. |
| Only admins can read the log | It holds personal data (who came in and when). |

## How to verify

1. `cd backend && pytest`: 45 tests (9 new).
2. Start the backend, log in at `/docs` and call `GET /access-events` → empty list (the
   access point that writes events came in week 6).

## Known limitations

- Nothing writes events yet: the access point was built in week 6.
- No pagination on `GET /access-events`.

## Commits

```
docs: add week 3 progress notes and update project docs
docs: remove internal planning notes
docs: simplify target architecture to a local monolith
feat(backend): add access_events table and filtered list API
```
