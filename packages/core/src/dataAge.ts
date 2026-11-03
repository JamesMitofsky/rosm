// A note for screens that show search results, when the data behind them is
// old enough to matter.
//
// Search replies carry `asOf`, when the oldest copy they used was fetched.
// Copies a little over an hour old are routine: the server refreshes them in
// the background for the next search. A copy hours old means the data service
// has been failing for a while, and a volunteer should know what they're
// looking at may have changed since.
//
// The wording never names the data service: volunteers don't know what it is,
// and naming it would only confuse them.

// How old the data must be before it's worth a word.
export const DATA_AGE_NOTICE_MS = 6 * 60 * 60 * 1000;

const HOUR_MS = 60 * 60 * 1000;

// The note for data fetched at `asOf` (an ISO time), or null when there's
// nothing worth saying: under DATA_AGE_NOTICE_MS old, or no usable time at all
// (a reply from a server that doesn't send one). `now` is passed in so the
// caller owns the clock. Ages are floored, in hours under two days and in days
// after that.
export function dataAgeNotice(asOf: unknown, now: number): string | null {
  if (typeof asOf !== "string") return null;
  const at = Date.parse(asOf);
  if (Number.isNaN(at)) return null;
  const age = now - at;
  if (age < DATA_AGE_NOTICE_MS) return null;
  const hours = Math.floor(age / HOUR_MS);
  const ago = hours < 48 ? `${hours} hours ago` : `${Math.floor(hours / 24)} days ago`;
  return `Showing data from ${ago}. The underlying data is slow to update right now.`;
}
