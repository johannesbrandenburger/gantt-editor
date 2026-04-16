export type TimeDomainValue = Date | number;

export type TimeTickGenerator = (start: Date, end: Date) => Date[];

export interface TimeInterval {
  range(start: Date, end: Date): Date[];
}

export type TimeTickSpec = TimeInterval | TimeTickGenerator;

export interface TimeScale {
  (value: TimeDomainValue): number;
  invert(value: number): Date;
  domain(): [Date, Date];
  range(): [number, number];
  ticks(spec?: TimeTickSpec): Date[];
}

function floorToHour(date: Date, step: number): Date {
  const d = new Date(date);
  d.setMinutes(0, 0, 0);
  const hour = d.getHours();
  d.setHours(hour - (hour % step));
  return d;
}

function floorToDay(date: Date, step: number): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dayOfMonth = d.getDate();
  d.setDate(dayOfMonth - ((dayOfMonth - 1) % step));
  return d;
}

function buildSteppedRange(
  start: Date,
  end: Date,
  step: number,
  floor: (value: Date, n: number) => Date,
  offset: (value: Date, n: number) => Date,
): Date[] {
  if (step <= 0 || end <= start) return [];
  let current = floor(start, step);
  if (current < start) {
    current = offset(current, step);
  }

  const values: Date[] = [];
  let guard = 0;
  while (current < end && guard < 10000) {
    values.push(new Date(current));
    current = offset(current, step);
    guard += 1;
  }
  return values;
}

function toTime(value: TimeDomainValue): number {
  return value instanceof Date ? value.getTime() : value;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function defaultTickInterval(spanMs: number): TimeInterval {
  if (spanMs <= 2 * 60 * 60 * 1000) {
    return timeMinute.every(15);
  }
  if (spanMs <= 6 * 60 * 60 * 1000) {
    return timeMinute.every(30);
  }
  if (spanMs <= 12 * 60 * 60 * 1000) {
    return timeHour.every(1);
  }
  if (spanMs <= 24 * 60 * 60 * 1000) {
    return timeHour.every(2);
  }
  if (spanMs <= 2 * 24 * 60 * 60 * 1000) {
    return timeHour.every(6);
  }
  if (spanMs <= 4 * 24 * 60 * 60 * 1000) {
    return timeHour.every(12);
  }
  if (spanMs <= 10 * 24 * 60 * 60 * 1000) {
    return timeDay.every(1);
  }
  if (spanMs <= 30 * 24 * 60 * 60 * 1000) {
    return timeDay.every(2);
  }
  return timeDay.every(7);
}

function ticksFromSpec(start: Date, end: Date, spec?: TimeTickSpec): Date[] {
  if (!spec) {
    return defaultTickInterval(end.getTime() - start.getTime()).range(start, end);
  }
  if (typeof spec === "function") {
    return spec(start, end);
  }
  return spec.range(start, end);
}

function createIntervalFactory(
  floor: (value: Date, step: number) => Date,
  offset: (value: Date, step: number) => Date,
) {
  return {
    every(step: number): TimeInterval {
      return {
        range(start: Date, end: Date): Date[] {
          return buildSteppedRange(start, end, step, floor, offset);
        },
      };
    },
    range(start: Date, end: Date, step = 1): Date[] {
      return buildSteppedRange(start, end, step, floor, offset);
    },
  };
}

const timeMinute = createIntervalFactory(
  (value, step) => {
    const d = new Date(value);
    d.setSeconds(0, 0);
    const minute = d.getMinutes();
    d.setMinutes(minute - (minute % step));
    return d;
  },
  (value, step) => {
    const d = new Date(value);
    d.setMinutes(d.getMinutes() + step);
    return d;
  },
);

export const timeHour = createIntervalFactory(
  floorToHour,
  (value, step) => {
    const d = new Date(value);
    d.setHours(d.getHours() + step);
    return d;
  },
);

export const timeDay = createIntervalFactory(
  floorToDay,
  (value, step) => {
    const d = new Date(value);
    d.setDate(d.getDate() + step);
    d.setHours(0, 0, 0, 0);
    return d;
  },
);

export function createTimeScale(
  domainStart: Date,
  domainEnd: Date,
  rangeStart: number,
  rangeEnd: number,
  clamp = true,
): TimeScale {
  const d0 = domainStart.getTime();
  const d1 = domainEnd.getTime();
  const r0 = rangeStart;
  const r1 = rangeEnd;
  const domainSpan = d1 - d0;
  const rangeSpan = r1 - r0;

  const scale = ((value: TimeDomainValue): number => {
    if (domainSpan === 0) return r0;
    const t = toTime(value);
    const normalized = (t - d0) / domainSpan;
    const raw = r0 + normalized * rangeSpan;
    if (!clamp) return raw;
    const min = Math.min(r0, r1);
    const max = Math.max(r0, r1);
    return clampNumber(raw, min, max);
  }) as TimeScale;

  scale.invert = (value: number): Date => {
    if (rangeSpan === 0) return new Date(d0);
    const min = Math.min(r0, r1);
    const max = Math.max(r0, r1);
    const v = clamp ? clampNumber(value, min, max) : value;
    const normalized = (v - r0) / rangeSpan;
    return new Date(d0 + normalized * domainSpan);
  };

  scale.domain = (): [Date, Date] => [new Date(d0), new Date(d1)];
  scale.range = (): [number, number] => [r0, r1];
  scale.ticks = (spec?: TimeTickSpec): Date[] => ticksFromSpec(new Date(d0), new Date(d1), spec);

  return scale;
}