let readClock: () => Date = () => new Date();

/** The one clock seam for lead timestamps. Tests may replace it deterministically. */
export function now(): Date {
  return readClock();
}

export function setClockForTests(clock: (() => Date) | undefined): void {
  readClock = clock ?? (() => new Date());
}
