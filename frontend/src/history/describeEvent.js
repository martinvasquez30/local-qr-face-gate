/**
 * The texts shown for one access event, in the current language. The table
 * and the CSV export both use it, so they always say the same thing.
 * `t` and `language` come from useTranslation(); `userNames` maps id -> name.
 */
export function describeEvent(event, { t, language, userNames }) {
  let user = t("history.unknownUser");
  if (event.user_id !== null) user = userNames[event.user_id] ?? `#${event.user_id}`;

  return {
    // The API sends UTC; the browser shows local time.
    when: new Date(event.created_at).toLocaleString(language),
    user,
    method: t(`history.method.${event.method}`),
    result: t(`history.result.${event.result}`),
    direction: t(`kiosk.direction.${event.direction}`),
    // Events logged before kiosks had a place have none.
    location: event.location ? t(`locations.${event.location}`) : "—",
    distance: event.distance === null ? "—" : event.distance.toFixed(3),
    // Events logged before reasons were stored have none.
    reason: event.reason ? t(`history.reason.${event.reason}`) : "—",
  };
}

/** Column order of the table and the CSV file. */
export const EVENT_COLUMNS = [
  "when",
  "user",
  "method",
  "result",
  "location",
  "direction",
  "distance",
  "reason",
];

/** Columns of the short table on the home page. */
export const COMPACT_COLUMNS = ["when", "user", "method", "result", "location"];
