import { apiRequest } from "../api.js";

/**
 * Access events, newest first (admins only). Every filter is optional:
 * `start` and `end` are exact moments (ISO text) and `userId` is a user id.
 */
export function listAccessEvents(token, { start, end, userId, signal } = {}) {
  const params = new URLSearchParams();
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  if (userId) params.set("user_id", userId);
  const query = params.toString();
  return apiRequest(`/access-events${query ? `?${query}` : ""}`, { token, signal });
}

/** "2026-11-15" for the local day of `date` (what <input type="date"> uses). */
export function toDateInputValue(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Turn a local day ("2026-11-15") into the moment it starts, as ISO text in
 * UTC. `daysLater` = 1 gives the start of the next day, used as the end limit
 * (the server does not include `end`, so the whole day is covered).
 */
export function startOfLocalDay(dateText, daysLater = 0) {
  const moment = new Date(`${dateText}T00:00`); // Midnight in the browser's time zone.
  moment.setDate(moment.getDate() + daysLater);
  return moment.toISOString();
}
