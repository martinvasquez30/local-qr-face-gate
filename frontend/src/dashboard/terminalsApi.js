import { apiRequest } from "../api.js";

/**
 * Every access point with its status (admins only):
 * `[{ location, direction, last_seen_at, seconds_since_seen, is_online }]`.
 */
export function listTerminals(token, { signal } = {}) {
  return apiRequest("/terminals", { token, signal });
}
