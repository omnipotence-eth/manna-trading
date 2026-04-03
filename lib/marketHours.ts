/**
 * US Equity market hours utility (NYSE / NASDAQ)
 * Regular session: 9:30am – 4:00pm ET, Monday–Friday
 * Extended hours:  4:00am – 8:00pm ET (not used for order routing by default)
 *
 * DST-aware: switches between EST (UTC-5) and EDT (UTC-4).
 */

const HOURS = 60 * 60 * 1000;

/** True if the given UTC date falls within US Daylight Saving Time. */
function isDST(date: Date): boolean {
  const year = date.getUTCFullYear();
  // DST starts: second Sunday of March at 2:00am ET
  const dstStart = nthSundayOfMonth(year, 2, 2);
  // DST ends:   first Sunday of November at 2:00am ET
  const dstEnd = nthSundayOfMonth(year, 10, 1);
  return date >= dstStart && date < dstEnd;
}

/** Returns a UTC Date representing the nth Sunday of the given month (0-indexed). */
function nthSundayOfMonth(year: number, month: number, n: number): Date {
  const d = new Date(Date.UTC(year, month, 1));
  const firstSunday = d.getUTCDay() === 0 ? 1 : 8 - d.getUTCDay();
  const day = firstSunday + (n - 1) * 7;
  // 2:00am ET in UTC — exact offset doesn't matter for day-level comparison
  return new Date(Date.UTC(year, month, day, 7, 0, 0));
}

export interface MarketStatus {
  isOpen: boolean;
  isPreMarket: boolean;
  isAfterHours: boolean;
  isClosed: boolean;
  /** Milliseconds until the next regular session open; 0 if currently open. */
  nextOpenMs: number;
  sessionType: 'regular' | 'pre' | 'after' | 'closed';
  currentTimeET: string;
}

/**
 * Returns the current US equity market status.
 * Pass an optional `now` Date for testing.
 */
export function getMarketStatus(now?: Date): MarketStatus {
  const date = now ?? new Date();
  const offsetHours = isDST(date) ? -4 : -5;
  const etMs = date.getTime() + offsetHours * HOURS;
  const et = new Date(etMs);

  const dayOfWeek = et.getUTCDay(); // 0=Sun, 6=Sat
  const hour = et.getUTCHours();
  const minute = et.getUTCMinutes();
  const timeMin = hour * 60 + minute; // minutes since midnight ET

  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  // Boundaries in minutes from midnight ET
  const PRE_OPEN  = 4 * 60;       // 4:00am
  const REG_OPEN  = 9 * 60 + 30;  // 9:30am
  const REG_CLOSE = 16 * 60;      // 4:00pm
  const EXT_CLOSE = 20 * 60;      // 8:00pm

  const isRegular   = !isWeekend && timeMin >= REG_OPEN  && timeMin < REG_CLOSE;
  const isPreMarket = !isWeekend && timeMin >= PRE_OPEN  && timeMin < REG_OPEN;
  const isAfterHrs  = !isWeekend && timeMin >= REG_CLOSE && timeMin < EXT_CLOSE;

  const currentTimeET = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} ET`;
  const nextOpenMs = isRegular ? 0 : msUntilNextOpen(date, dayOfWeek, timeMin, offsetHours);

  if (isRegular)   return { isOpen: true,  isPreMarket: false, isAfterHours: false, isClosed: false, nextOpenMs: 0, sessionType: 'regular', currentTimeET };
  if (isPreMarket) return { isOpen: false, isPreMarket: true,  isAfterHours: false, isClosed: false, nextOpenMs,  sessionType: 'pre',     currentTimeET };
  if (isAfterHrs)  return { isOpen: false, isPreMarket: false, isAfterHours: true,  isClosed: false, nextOpenMs,  sessionType: 'after',   currentTimeET };
  return               { isOpen: false, isPreMarket: false, isAfterHours: false, isClosed: true,  nextOpenMs,  sessionType: 'closed',  currentTimeET };
}

function msUntilNextOpen(now: Date, dayOfWeek: number, timeMin: number, offsetHours: number): number {
  // Days to add to reach next trading day at 9:30am ET
  let daysToAdd: number;
  if      (dayOfWeek === 0)                           daysToAdd = 1; // Sun → Mon
  else if (dayOfWeek === 6)                           daysToAdd = 2; // Sat → Mon
  else if (timeMin >= 16 * 60 && dayOfWeek === 5)    daysToAdd = 3; // Fri after close → Mon
  else if (timeMin >= 16 * 60)                        daysToAdd = 1; // Weekday after close → tomorrow
  else                                                daysToAdd = 0; // Before open same day

  const nextOpenUTC = new Date(now);
  nextOpenUTC.setUTCDate(nextOpenUTC.getUTCDate() + daysToAdd);
  // Set to 9:30am ET in UTC
  nextOpenUTC.setUTCHours(9 - offsetHours, 30, 0, 0);
  return Math.max(0, nextOpenUTC.getTime() - now.getTime());
}

/** Returns true if the US equity regular session is currently open. */
export function isMarketOpen(now?: Date): boolean {
  return getMarketStatus(now).isOpen;
}

/** Human-readable market status label for display. */
export function marketStatusLabel(now?: Date): string {
  const s = getMarketStatus(now);
  if (s.isOpen) return `OPEN (${s.currentTimeET})`;
  if (s.isPreMarket) return `PRE-MARKET (${s.currentTimeET})`;
  if (s.isAfterHours) return `AFTER-HOURS (${s.currentTimeET})`;
  const mins = Math.round(s.nextOpenMs / 60_000);
  const hrs = Math.floor(mins / 60);
  const m = mins % 60;
  const until = hrs > 0 ? `${hrs}h ${m}m` : `${m}m`;
  return `CLOSED — opens in ${until} (${s.currentTimeET})`;
}
