// Small calculations on a list of access events. No React here: the pages
// only show the results (logic apart from presentation).

/** Totals of a list of events. `successRate` is a % (null without events). */
export function summarize(events) {
  const granted = events.filter((event) => event.result === "granted").length;
  const total = events.length;
  return {
    total,
    granted,
    denied: total - granted,
    successRate: total === 0 ? null : Math.round((granted / total) * 100),
  };
}

/** How many events happened in each hour of the day (local time): 24 numbers. */
export function countByHour(events) {
  const counts = new Array(24).fill(0);
  for (const event of events) {
    counts[new Date(event.created_at).getHours()] += 1;
  }
  return counts;
}

/** Keep the events that match the method and result ("" means any). */
export function filterEvents(events, { method, result }) {
  return events.filter(
    (event) => (!method || event.method === method) && (!result || event.result === result)
  );
}
