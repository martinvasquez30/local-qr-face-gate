# Questions for the Product Owner

> Open questions about the scope of topic 3. Each one has the current plan, so work can
> continue until there is an answer. Answers are recorded here when they arrive.

## 1. SSO and offline operation

SSO needs an internet connection, but enrollment and QR validation must work offline.
The SSO code works with any OpenID Connect provider; development uses Google, and switching
to Microsoft (university accounts) is a configuration change.

- **Current plan:** SSO only protects the admin portal. The access point does not depend
  on SSO to validate people at the door; its endpoints use a terminal key instead.
- **Question:** Is SSO for the admin portal enough to meet the SSO requirement? Must it
  use the university (Microsoft) account, or is another provider such as Google fine?
- **Answer:** _pending_

## 2. Meaning of "local, with no internet connection"

- **Question:** Does it mean "no cloud services" (the access point may talk to a server on
  the same machine or the local network), or "no network at all" (each access point is
  fully standalone)?
- **Current plan (decided on 2026-11-08):** No cloud services. One local server with its
  database serves the admin portal, enrollment and the access point, so everything keeps
  working when the internet is down. See [`architecture.md`](architecture.md), decision 1.
  If the answer is "no network at all", the design moves towards the standalone terminals
  described in "Future evolution".
- **Answer:** _pending_

## 3. Where QR codes are generated while offline

- **Current plan (decided on 2026-11-08):** The local server creates and checks the QR
  codes (signed with HMAC), so both work without internet. An admin issues them from the
  portal, for example for a visitor or for someone whose face is not recognized. See
  [`architecture.md`](architecture.md), decision 5.
- **Question:** Is it enough that an admin issues the QR codes, or must people be able to
  get their own QR code without an admin?
- **Answer:** _pending_

## 4. Who enrolls users

- **Question:** Do administrators enroll users, or can users enroll themselves? Is
  explicit consent required before capturing biometric data?
- **Current plan:** Only administrators enroll users, and enrollment asks for consent.
- **Answer:** _pending_

## 5. Entries and exits

- **Question:** Must the system record exits as well as entries? If so, is each access
  point fixed to one direction, or does the person choose?
- **Current plan:** Each access point is configured as entry or exit.
- **Answer:** _pending_

## 6. QR code validity

- **Question:** How long should a dynamic QR code stay valid?
- **Current plan:** 30–60 seconds, so a screenshot is useless after a short time.
- **Answer:** _pending_

## 7. Data retention

- **Question:** How long should access events and face descriptors be kept? What happens
  to a user's descriptors when the user is deactivated?
- **Current plan:** Delete descriptors when the user is deactivated; keep access events.
- **Answer:** _pending_

## 8. Reports

- **Question:** Besides filtering by date and user, should reports be exported (for
  example to CSV or PDF)?
- **Current plan:** On-screen reports with filters first; CSV export if time allows.
- **Answer:** _pending_

## 9. Liveness detection

- **Question:** Must the system detect spoofing attempts (a printed photo or a phone
  screen in front of the camera), or is it out of scope?
- **Current plan:** A basic check is done: the kiosk asks for a head turn to a random
  side, which stops printed photos and photos on a phone (a flat picture cannot turn in
  3D).
- **Answer:** _pending_

## 10. Online deployment and local biometric data

The course rubric asks for an online deployment (for example Vercel and Supabase), while
topic 3 asks for local biometric enrollment without internet.

- **Question:** Is an online demo with face recognition turned off enough to meet the
  deployment criterion, with face recognition shown on the local installation?
- **Current plan (decided on 2026-11-18):** The same code runs online (Vercel, Render and
  Supabase) with `FACE_RECOGNITION_ENABLED=false`: users, SSO, QR codes, history and
  languages work there, and the server refuses face descriptors, so no biometric data
  reaches the cloud. Face recognition is shown on the local installation. See
  [`architecture.md`](architecture.md), decision 9.
- **Answer:** _pending_
