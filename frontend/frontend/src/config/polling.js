/**
 * How often the live resources are re-read.
 *
 * The React app has no Socket.IO client -- the server emits `train:update`
 * and nothing listens -- so "live" here means a poll. Fifteen seconds for the
 * data an operator watches, and nothing at all for static geography.
 *
 * `useResource` pauses every poll while the tab is hidden and refetches on
 * return, so a background tab costs no requests. Socket.IO can replace this
 * later without a page changing: only these numbers and the hook would go.
 */
export const LIVE_POLL_MS = 15000;

/** Alerts change less often than positions, and the list is longer. */
export const ALERTS_POLL_MS = 15000;

/** Static reference data: fetched once per mount, never polled. */
export const STATIC_POLL_MS = 0;
