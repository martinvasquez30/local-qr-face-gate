import { apiRequest } from "../api.js";

// Calls made by the access point (kiosk). It has no user login: it sends the
// terminal key instead, in the X-Terminal-Key header. `settings` is the kiosk
// setup: { terminalKey, direction, location }.

function terminalHeaders(settings) {
  return { "X-Terminal-Key": settings.terminalKey };
}

/**
 * Ask the server whether this face can get in. Only the 128 numbers are sent,
 * with `livenessPassed`: whether the person turned their head when asked.
 * Returns `{ result: "granted" | "denied", user_name, distance }`.
 */
export function checkFace(settings, descriptor, livenessPassed) {
  return apiRequest("/access/face", {
    method: "POST",
    body: {
      descriptor,
      direction: settings.direction,
      location: settings.location,
      liveness_passed: livenessPassed,
    },
    extraHeaders: terminalHeaders(settings),
  });
}

/**
 * Ask the server whether this QR code can get in. `token` is the text read
 * from the code. Same answer shape, plus `reason` when it is denied.
 */
export function checkQr(settings, token) {
  return apiRequest("/access/qr", {
    method: "POST",
    body: { token, direction: settings.direction, location: settings.location },
    extraHeaders: terminalHeaders(settings),
  });
}

/** "I am here": lets the admin home show this access point as connected. */
export function sendHeartbeat(settings) {
  return apiRequest("/access/heartbeat", {
    method: "POST",
    body: { direction: settings.direction, location: settings.location },
    extraHeaders: terminalHeaders(settings),
  });
}
