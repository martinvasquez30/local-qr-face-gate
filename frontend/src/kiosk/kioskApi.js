import { apiRequest } from "../api.js";

// Calls made by the access point (kiosk). It has no user login: it sends the
// terminal key instead, in the X-Terminal-Key header.

/**
 * Ask the server whether this face can get in. Only the 128 numbers are sent.
 * Returns `{ result: "granted" | "denied", user_name, distance }`.
 */
export function checkFace(terminalKey, descriptor, direction) {
  return apiRequest("/access/face", {
    method: "POST",
    body: { descriptor, direction },
    extraHeaders: { "X-Terminal-Key": terminalKey },
  });
}
