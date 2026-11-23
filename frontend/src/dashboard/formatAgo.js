/**
 * "hace 10 segundos" / "12 minutes ago", in the given language. It uses
 * Intl.RelativeTimeFormat, which is built into the browser: no library and
 * no translation keys needed.
 */
export function formatAgo(seconds, language) {
  const format = new Intl.RelativeTimeFormat(language, { numeric: "auto" });
  if (seconds < 60) return format.format(-seconds, "second");
  if (seconds < 3600) return format.format(-Math.floor(seconds / 60), "minute");
  if (seconds < 86400) return format.format(-Math.floor(seconds / 3600), "hour");
  return format.format(-Math.floor(seconds / 86400), "day");
}
