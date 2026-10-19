# Questions for the Product Owner

> Open questions about the scope of topic 3. Each one has the current plan, so work can
> continue until there is an answer. Answers are recorded here when they arrive.

## 1. SSO and offline operation

SSO (Microsoft Entra ID) needs an internet connection, but enrollment and QR validation
must work offline.

- **Current plan:** SSO only protects the admin portal on the central server. Access
  point terminals do not depend on SSO to validate people at the door.
- **Question:** Is SSO for the admin portal enough to meet the SSO requirement?
- **Answer:** _pending_

## 2. Meaning of "local, with no internet connection"

- **Question:** Does it mean "no cloud services" (terminals may talk to the central
  server over the local network), or "no network at all" (each terminal is fully
  standalone)?
- **Current plan:** No cloud services. Terminals work alone when the network is down and
  sync with the central server when it is back.
- **Answer:** _pending_

## 3. Where QR codes are generated while offline

QR codes are signed with Ed25519 and terminals validate them with the public key (see
[`architecture.md`](architecture.md)). Someone has to hold the private key to create them.

- **Options:** (a) the central server only, which needs a connection; (b) a device on the
  local network that holds the key; (c) the user's phone with a key issued per user.
- **Question:** Which scenario should work with no connection: getting a new QR code, or
  only validating one?
- **Answer:** _pending_

## 4. Who enrolls users

- **Question:** Do administrators enroll users at a terminal, or can users enroll
  themselves? Is explicit consent required before capturing biometric data?
- **Current plan:** Only administrators enroll users, and enrollment asks for consent.
- **Answer:** _pending_

## 5. Entries and exits

- **Question:** Must the system record exits as well as entries? If so, is each terminal
  fixed to one direction, or does the person choose?
- **Current plan:** Each terminal is configured as entry or exit.
- **Answer:** _pending_

## 6. QR code validity

- **Question:** How long should a dynamic QR code stay valid?
- **Current plan:** 30–60 seconds, so a screenshot is useless after a short time.
- **Answer:** _pending_

## 7. Data retention

- **Question:** How long should access events and face embeddings be kept? What happens
  to a user's embeddings when the user is deactivated?
- **Current plan:** Delete embeddings when the user is deactivated; keep access events.
- **Answer:** _pending_

## 8. Reports

- **Question:** Besides filtering by date and user, should reports be exported (for
  example to CSV or PDF)?
- **Current plan:** On-screen reports with filters first; CSV export if time allows.
- **Answer:** _pending_

## 9. Liveness detection

- **Question:** Must the system detect spoofing attempts (a printed photo or a phone
  screen in front of the camera), or is it out of scope?
- **Current plan:** Out of the minimum scope; listed as a stretch goal in the roadmap.
- **Answer:** _pending_
