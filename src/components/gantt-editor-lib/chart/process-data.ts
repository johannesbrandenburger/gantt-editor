import type {
  Topic,
  ProcessedData,
  Settings,
  GanttEditorDestination,
  GanttEditorSlot,
} from './types';

/** Skip O(n)-heap conflict sweep above this (still correct row layout; conflicts not marked). */
const CONFLICT_DETECTION_MAX_SLOTS = 50_000;

class IntMinHeap {
  private readonly h: number[] = [];

  get size(): number {
    return this.h.length;
  }

  push(x: number): void {
    this.h.push(x);
    let i = this.h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.h[p]! <= this.h[i]!) break;
      [this.h[p], this.h[i]] = [this.h[i]!, this.h[p]!];
      i = p;
    }
  }

  pop(): number | undefined {
    const n = this.h.length;
    if (n === 0) return undefined;
    const out = this.h[0]!;
    const last = this.h.pop()!;
    if (n > 1) {
      this.h[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let sm = i;
        if (l < this.h.length && this.h[l]! < this.h[sm]!) sm = l;
        if (r < this.h.length && this.h[r]! < this.h[sm]!) sm = r;
        if (sm === i) break;
        [this.h[i], this.h[sm]] = [this.h[sm]!, this.h[i]!];
        i = sm;
      }
    }
    return out;
  }
}

class ActiveRowHeap {
  private readonly ends: number[] = [];
  private readonly rowIdxs: number[] = [];

  get size(): number {
    return this.ends.length;
  }

  peekEnd(): number | undefined {
    return this.ends[0];
  }

  push(end: number, rowIdx: number): void {
    this.ends.push(end);
    this.rowIdxs.push(rowIdx);
    let i = this.ends.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      const pEnd = this.ends[p]!;
      const cEnd = this.ends[i]!;
      if (pEnd < cEnd) break;
      if (pEnd === cEnd && this.rowIdxs[p]! <= this.rowIdxs[i]!) break;
      [this.ends[p], this.ends[i]] = [this.ends[i]!, this.ends[p]!];
      [this.rowIdxs[p], this.rowIdxs[i]] = [this.rowIdxs[i]!, this.rowIdxs[p]!];
      i = p;
    }
  }

  popRowIdx(): number | undefined {
    const n = this.ends.length;
    if (n === 0) return undefined;

    const outRowIdx = this.rowIdxs[0]!;
    const lastEnd = this.ends.pop()!;
    const lastRowIdx = this.rowIdxs.pop()!;
    if (n > 1) {
      this.ends[0] = lastEnd;
      this.rowIdxs[0] = lastRowIdx;

      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let sm = i;

        if (l < this.ends.length) {
          const lEnd = this.ends[l]!;
          const sEnd = this.ends[sm]!;
          if (lEnd < sEnd || (lEnd === sEnd && this.rowIdxs[l]! < this.rowIdxs[sm]!)) {
            sm = l;
          }
        }

        if (r < this.ends.length) {
          const rEnd = this.ends[r]!;
          const sEnd = this.ends[sm]!;
          if (rEnd < sEnd || (rEnd === sEnd && this.rowIdxs[r]! < this.rowIdxs[sm]!)) {
            sm = r;
          }
        }

        if (sm === i) break;
        [this.ends[i], this.ends[sm]] = [this.ends[sm]!, this.ends[i]!];
        [this.rowIdxs[i], this.rowIdxs[sm]] = [this.rowIdxs[sm]!, this.rowIdxs[i]!];
        i = sm;
      }
    }
    return outRowIdx;
  }
}

class MinHeap<T> {
  private readonly h: T[] = [];
  constructor(private readonly key: (t: T) => number) {}

  get size(): number {
    return this.h.length;
  }

  peek(): T | undefined {
    return this.h[0];
  }

  push(x: T): void {
    this.h.push(x);
    let i = this.h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.key(this.h[p]!) <= this.key(this.h[i]!)) break;
      [this.h[p], this.h[i]] = [this.h[i]!, this.h[p]!];
      i = p;
    }
  }

  pop(): T | undefined {
    const n = this.h.length;
    if (n === 0) return undefined;
    const out = this.h[0]!;
    const last = this.h.pop()!;
    if (n > 1) {
      this.h[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let sm = i;
        if (l < this.h.length && this.key(this.h[l]!) < this.key(this.h[sm]!)) sm = l;
        if (r < this.h.length && this.key(this.h[r]!) < this.key(this.h[sm]!)) sm = r;
        if (sm === i) break;
        [this.h[i], this.h[sm]] = [this.h[sm]!, this.h[i]!];
        i = sm;
      }
    }
    return out;
  }

  /** Snapshot of heap contents (order not meaningful). */
  allValues(): T[] {
    return this.h.slice();
  }
}

function effectiveEndMs(slot: {
  closeTime: Date;
  deadline?: Date;
  secondaryDeadline?: Date;
}): number {
  let e = slot.closeTime.getTime();
  if (slot.deadline) e = Math.max(e, slot.deadline.getTime());
  if (slot.secondaryDeadline) e = Math.max(e, slot.secondaryDeadline.getTime());
  return e;
}

function sortSlotsByOpen(slots: GanttEditorSlot[]): GanttEditorSlot[] {
  return slots.slice().sort(
    (a, b) =>
      a.openTime.getTime() - b.openTime.getTime() ||
      a.id.localeCompare(b.id),
  );
}

/**
 * Assign slots to non-overlapping rows in O(n log n) using a sweep + min-heap
 * (interval partitioning). Row assignment may differ from the legacy greedy
 * "first fitting row" order but preserves the no-overlap invariant.
 */
function assignSlotsToRowsHeap(
  topicSlots: GanttEditorSlot[],
  topicId: string,
  compactView: boolean,
): Array<{ name: string; slots: GanttEditorSlot[]; id: string }> {
  const sorted = sortSlotsByOpen(topicSlots);

  type Prepared = { slot: GanttEditorSlot; open: number; end: number };
  const prepared: Prepared[] = new Array(sorted.length);
  for (let i = 0; i < sorted.length; i++) {
    const slot = sorted[i]!;
    prepared[i] = {
      slot,
      open: slot.openTime.getTime(),
      end: compactView ? slot.closeTime.getTime() : effectiveEndMs(slot),
    };
  }

  const rows: Array<{ name: string; slots: GanttEditorSlot[]; id: string }> = [];
  const activeRows = new ActiveRowHeap();
  const freeRowIndices = new IntMinHeap();

  for (const item of prepared) {
    while (activeRows.size > 0 && activeRows.peekEnd()! <= item.open) {
      const freedRowIdx = activeRows.popRowIdx()!;
      freeRowIndices.push(freedRowIdx);
    }

    const rowIdx = freeRowIndices.size > 0 ? freeRowIndices.pop()! : rows.length;
    if (rowIdx === rows.length) {
      rows.push({ name: '', slots: [], id: `${topicId}-${rowIdx}` });
    }

    rows[rowIdx]!.slots.push(item.slot);
    activeRows.push(item.end, rowIdx);
  }

  return rows;
}

/**
 * Check if a candidate slot overlaps with any existing slot in the row.
 * This avoids creating a new spread array and re-sorting on every check.
 */
const doesSlotOverlapRow = (
  existingSlots: { openTime: Date; closeTime: Date }[],
  candidate: { openTime: Date; closeTime: Date },
): boolean => {
  const cOpen = candidate.openTime.getTime();
  const cClose = candidate.closeTime.getTime();
  for (const s of existingSlots) {
    if (s.openTime.getTime() < cClose && s.closeTime.getTime() > cOpen) {
      return true;
    }
  }
  return false;
};

const doesSlotOverlapRowWithDeadline = (
  existingSlots: {
    openTime: Date;
    closeTime: Date;
    deadline?: Date;
    secondaryDeadline?: Date;
  }[],
  candidate: {
    openTime: Date;
    closeTime: Date;
    deadline?: Date;
    secondaryDeadline?: Date;
  },
): boolean => {
  const cOpen = candidate.openTime.getTime();
  let cClose = candidate.closeTime.getTime();
  if (candidate.deadline) {
    cClose = Math.max(cClose, candidate.deadline.getTime());
  }
  if (candidate.secondaryDeadline) {
    cClose = Math.max(cClose, candidate.secondaryDeadline.getTime());
  }
  for (const s of existingSlots) {
    let sClose = s.closeTime.getTime();
    if (s.deadline) {
      sClose = Math.max(sClose, s.deadline.getTime());
    }
    if (s.secondaryDeadline) {
      sClose = Math.max(sClose, s.secondaryDeadline.getTime());
    }
    if (s.openTime.getTime() < cClose && sClose > cOpen) {
      return true;
    }
  }
  return false;
};

export const addSlotToRows = (
  rows: {
    name: string;
    slots: {
      openTime: Date;
      closeTime: Date;
      destinationId: string;
      id: string;
      deadline?: Date;
      secondaryDeadline?: Date;
    }[];
    id: string;
  }[],
  slot: {
    openTime: Date;
    closeTime: Date;
    destinationId: string;
    id: string;
    deadline?: Date;
    secondaryDeadline?: Date;
  },
  topicId: string,
  compactView: boolean,
) => {
  let rowFound = false;
  if (compactView) {
    for (const row of rows) {
      if (!doesSlotOverlapRow(row.slots, slot)) {
        row.slots.push(slot);
        rowFound = true;
        break;
      }
    }
  } else {
    for (const row of rows) {
      if (!doesSlotOverlapRowWithDeadline(row.slots, slot)) {
        row.slots.push(slot);
        rowFound = true;
        break;
      }
    }
  }
  if (!rowFound) {
    rows.push({ name: '', slots: [slot], id: `${topicId}-${rows.length}` });
  }
};

function buildSlotsByDestination(
  data: GanttEditorSlot[],
): Map<string, GanttEditorSlot[]> {
  const map = new Map<string, GanttEditorSlot[]>();
  for (const slot of data) {
    const list = map.get(slot.destinationId);
    if (list) list.push(slot);
    else map.set(slot.destinationId, [slot]);
  }
  return map;
}

/**
 * Sweep-line conflict ids: same strict overlap as row logic, deadline-extended end.
 */
function collectConflictIds(allSlots: GanttEditorSlot[]): Set<string> {
  const n = allSlots.length;
  if (n === 0) return new Set();
  if (n > CONFLICT_DETECTION_MAX_SLOTS) return new Set();

  type Ev = { open: number; end: number; id: string };
  const evs: Ev[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const s = allSlots[i]!;
    evs[i] = {
      open: s.openTime.getTime(),
      end: effectiveEndMs(s),
      id: s.id,
    };
  }
  evs.sort((a, b) => a.open - b.open || a.id.localeCompare(b.id));

  const heap = new MinHeap<{ end: number; id: string }>((x) => x.end);
  const conflictIds = new Set<string>();

  for (const ev of evs) {
    while (heap.size > 0 && heap.peek()!.end <= ev.open) {
      heap.pop();
    }
    if (heap.size > 0) {
      conflictIds.add(ev.id);
      for (const x of heap.allValues()) {
        conflictIds.add(x.id);
      }
    }
    heap.push({ end: ev.end, id: ev.id });
  }

  return conflictIds;
}

export function processData(
  data: Array<GanttEditorSlot>,
  destinationData: Array<GanttEditorDestination>,
  startDateTime: Date,
  endDateTime: Date,
  settings: Settings,
): ProcessedData {
  const collapsedTopics = JSON.parse(
    localStorage.getItem('collapsedTopics') || '[]',
  ) as string[];
  const collapsedSet = new Set(collapsedTopics);

  const enrichedDestinationData = destinationData.map((destination) => ({
    ...destination,
    isCollapsed: collapsedSet.has(destination.id),
  }));

  const slotsByDest = buildSlotsByDestination(data);

  let processedData: Topic[] = enrichedDestinationData.map((destination) => ({
    name: destination.displayName,
    id: destination.id,
    isCollapsed: destination.isCollapsed,
    rows: [],
    yStart: 0,
    yEnd: 0,
    isInactive: destination.active === false,
    groupId: destination.groupId,
  }));

  processedData.forEach((topic) => {
    const topicSlots = slotsByDest.get(topic.id) ?? [];
    if (!topic.isCollapsed) {
      topic.rows = assignSlotsToRowsHeap(
        topicSlots,
        topic.id,
        settings.compactView,
      );
    } else {
      const collapsed: GanttEditorSlot[] = [];
      for (const slot of topicSlots) {
        collapsed.push({
          ...slot,
          flight: slot.group,
          flightId: slot.group,
        } as GanttEditorSlot);
      }
      collapsed.sort(
        (a, b) =>
          a.openTime.getTime() - b.openTime.getTime() ||
          a.id.localeCompare(b.id),
      );
      topic.rows = [
        {
          id: `${topic.id}-collapsed`,
          name: 'all',
          slots: collapsed,
        },
      ];
    }
  });

  processedData.forEach((topic) => {
    topic.rows.forEach((row) => {
      row.slots = row.slots.map((slot) => ({ ...slot }));
    });
    const allSlots = topic.rows.flatMap((row) => row.slots);
    const conflictIds = collectConflictIds(allSlots);
    for (const slot of allSlots) {
      slot.isConflict = conflictIds.has(slot.id);
    }
  });

  processedData = processedData.sort((a, b) =>
    a.id === 'UNALLOCATED' ? -1 : b.id === 'UNALLOCATED' ? 1 : 0,
  );

  return {
    processedData_: processedData,
    processedStartDateTime: startDateTime,
    processedEndDateTime: endDateTime,
  };
}
