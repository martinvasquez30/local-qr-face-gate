import { apiRequest } from "../api.js";

// Personal QR codes, made in the user's own browser so they also work without
// internet. Same idea as an authenticator app (TOTP): while online, the server
// gives the user a secret key of their own; after that, every 30 seconds the
// browser signs "<user_id>:<step>:<nonce>" with it (HMAC-SHA256). The server
// has the same key and checks the signature (backend/app/qr.py).

export const STEP_SECONDS = 30;
const KEY_STORAGE_KEY = "personalQrKey";

/** Ask the server for a new key (needs a connection). Replaces the old one. */
export function requestPersonalQrKey(token) {
  return apiRequest("/me/qr-key", { method: "POST", token });
}

// The key is kept in sessionStorage, like the login token: it survives moving
// between pages and reloads, and is forgotten when the tab is closed.
export function readSavedKey(userId) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY_STORAGE_KEY));
    return saved?.userId === userId ? saved.key : null;
  } catch {
    return null;
  }
}

export function saveKey(userId, key) {
  try {
    sessionStorage.setItem(KEY_STORAGE_KEY, JSON.stringify({ userId, key }));
  } catch {
    // Storage blocked: the key only lives while this page is open.
  }
}

/** Called on sign out, so the next person on this device cannot make codes. */
export function forgetPersonalQrKey() {
  try {
    sessionStorage.removeItem(KEY_STORAGE_KEY);
  } catch {
    // Storage blocked: there is nothing saved to remove.
  }
}

/**
 * The browser's built-in cryptography (Web Crypto). Browsers only offer it on
 * secure pages: https, or http://localhost.
 */
export function canSignOnThisDevice() {
  return Boolean(window.isSecureContext && window.crypto?.subtle);
}

/** A random value in base64url (letters, digits, "-" and "_"), 16 characters. */
function randomNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

/** HMAC-SHA256 of `message` with `key`, in hex. Same as the server's. */
export async function sign(key, message) {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Make a new code. Returns `{ value, expiresAt }`: the text to draw as a QR,
 * and when the current 30-second period ends (time in milliseconds).
 * It uses only the key and the clock: no network.
 */
export async function makePersonalQr(key, userId, now = Date.now()) {
  const step = Math.floor(now / 1000 / STEP_SECONDS);
  const nonce = randomNonce();
  const signature = await sign(key, `${userId}:${step}:${nonce}`);
  return {
    value: `P:${userId}:${step}:${nonce}:${signature}`,
    expiresAt: (step + 1) * STEP_SECONDS * 1000,
  };
}
