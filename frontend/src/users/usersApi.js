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

/** `changes` holds only the fields to change: any of name, role, is_active. */
export function updateUser(token, userId, changes) {
  return apiRequest(`/users/${userId}`, { method: "PATCH", token, body: changes });
}
