import { apiRequest } from "../api.js";

// Calls to the /users endpoints. Every call needs the admin's token, which
// pages get from useAuth().

export function listUsers(token, { includeInactive = false, signal } = {}) {
  const query = includeInactive ? "?include_inactive=true" : "";
  return apiRequest(`/users${query}`, { token, signal });
}

export function createUser(token, { name, email, role }) {
  return apiRequest("/users", { method: "POST", token, body: { name, email, role } });
}

export function getUser(token, userId, { signal } = {}) {
  return apiRequest(`/users/${userId}`, { token, signal });
}

/** `changes` holds only the fields to change: any of name, role, is_active. */
export function updateUser(token, userId, changes) {
  return apiRequest(`/users/${userId}`, { method: "PATCH", token, body: changes });
}

// --- Face enrollment (/users/{id}/face) ---------------------------------------

/** `{ enrolled, updated_at }`. The face numbers themselves are never returned. */
export function getFaceStatus(token, userId, { signal } = {}) {
  return apiRequest(`/users/${userId}/face`, { token, signal });
}

/** `descriptors`: the captures, each a list of 128 numbers. The server keeps their average. */
export function enrollFace(token, userId, descriptors) {
  return apiRequest(`/users/${userId}/face`, { method: "PUT", token, body: { descriptors } });
}

export function deleteFace(token, userId) {
  return apiRequest(`/users/${userId}/face`, { method: "DELETE", token });
}

// --- QR codes (/users/{id}/qr) --------------------------------------------------

/** A new single-use QR code: `{ token, expires_in }` (seconds). */
export function createQr(token, userId) {
  return apiRequest(`/users/${userId}/qr`, { method: "POST", token });
}
