import { apiRequest } from "../api.js";

// Calls made by the access point (kiosk). It has no user login: it sends the
// terminal key instead, in the X-Terminal-Key header.

/**
 * Ask the server whether this face can get in. Only the 128 numbers are sent,
 * with `livenessPassed`: whether the person turned their head when asked.
 * Returns `{ result: "granted" | "denied", user_name, distance }`.
 */
export function checkFace(terminalKey, descriptor, direction, livenessPassed) {
  return apiRequest("/access/face", {
    method: "POST",
    body: { descriptor, direction, liveness_passed: livenessPassed },
    extraHeaders: { "X-Terminal-Key": terminalKey },
  });
}

/**
 * Ask the server whether this QR code can get in. `token` is the text read
 * from the code. Same answer shape, plus `reason` when it is denied.
 */
export function checkQr(terminalKey, token, direction) {
  return apiRequest("/access/qr", {
    method: "POST",
    body: { token, direction },
    extraHeaders: { "X-Terminal-Key": terminalKey },
  });
}
