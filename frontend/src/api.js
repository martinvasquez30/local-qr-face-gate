import { API_BASE_URL } from "./config.js";

/**
 * Error thrown by apiRequest. `code` is a stable string (for example
 * "invalid_credentials") that matches an `errors.<code>` translation key, so
 * the UI can show the message in the current language.
 */
export class ApiError extends Error {
  constructor(code, status) {
    super(code);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

/** Call the backend and return the JSON body, or throw an ApiError. */
export async function apiRequest(path, { method = "GET", body, token, signal } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error.name === "AbortError") throw error; // Cancelled on purpose.
    throw new ApiError("network_error", 0); // Server down or no connection.
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    // The backend sends the error code in `detail`. Anything else (for example
    // a validation error list) is shown as a generic error.
    const code = typeof data?.detail === "string" ? data.detail : "unexpected_error";
    throw new ApiError(code, response.status);
  }
  return data;
}
