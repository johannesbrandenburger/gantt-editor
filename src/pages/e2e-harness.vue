<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import GanttEditorComponent from "@/components/GanttEditorComponent.vue";
import type {
  GanttEditorDestination,
  GanttEditorDestinationGroup,
  GanttEditorMarkedRegion,
  GanttEditorSlotWithUiAttributes,
  GanttEditorSuggestion,
  GanttEditorVerticalMarker,
} from "@/components/gantt-editor-lib/chart/types";

type FixtureName =
  | "core"
  | "dense"
  | "readonly"
  | "markers"
  | "suggestions"
  | "topic-collapse"
  | "performance";

type HarnessData = {
  startTime: Date;
  endTime: Date;
  slots: GanttEditorSlotWithUiAttributes[];
  destinations: GanttEditorDestination[];
  destinationGroups: GanttEditorDestinationGroup[];
  suggestions: GanttEditorSuggestion[];
  verticalMarkers: GanttEditorVerticalMarker[];
  markedRegion: GanttEditorMarkedRegion | null;
  isReadOnly: boolean;
  topContentPortion: number;
};

type QueryInput = Partial<{
  fixture: string;
  readOnly: string;
  slots: string;
  suggestions: string;
  markers: string;
  markedRegion: string;
  topContentPortion: string;
  startTime: string;
  endTime: string;
  data: string;
}>;

type HarnessApi = {
  getConfig: () => HarnessData;
  setConfig: (partial: Partial<HarnessData>) => HarnessData;
  resetFromUrl: () => HarnessData;
  applyQuery: (query: QueryInput) => Promise<void>;
  getEvents: () => Record<string, unknown[]>;
  clearEvents: () => void;
};

const route = useRoute();
const router = useRouter();

const destinationsBase: GanttEditorDestination[] = [
  { id: "chute-1", displayName: "Chute 1", active: true, groupId: "allocated" },
  { id: "chute-2", displayName: "Chute 2", active: true, groupId: "allocated" },
  { id: "chute-3", displayName: "Chute 3", active: true, groupId: "allocated" },
  { id: "UNALLOCATED", displayName: "Unallocated", active: true, groupId: "unallocated" },
];

const destinationGroupsBase: GanttEditorDestinationGroup[] = [
  { id: "allocated", displayName: "Allocated Chutes", heightPortion: 0.8 },
  { id: "unallocated", displayName: "Unallocated", heightPortion: 0.2 },
];

const isoDay = "2025-01-01";
const defaultStart = new Date(`${isoDay}T00:00:00Z`);
const defaultEnd = new Date(`${isoDay}T23:59:59Z`);

function parseBoolean(value: string | null | undefined, fallback = false): boolean {
  if (value == null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function parseNumber(value: string | null | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseDate(value: string | null | undefined, fallback: Date): Date {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function normalizeFixture(value: string | null | undefined): FixtureName {
  if (
    value === "dense" ||
    value === "readonly" ||
    value === "markers" ||
    value === "suggestions" ||
    value === "topic-collapse" ||
    value === "performance"
  ) {
    return value;
  }
  return "core";
}

function suggestionSlots(): GanttEditorSlotWithUiAttributes[] {
  return [
    {
      id: "SUGGEST-100",
      displayName: "SUGGEST-100",
      group: "SUGGEST-100",
      openTime: new Date(`${isoDay}T08:30:00Z`),
      closeTime: new Date(`${isoDay}T10:00:00Z`),
      destinationId: "chute-1",
      color: "#2980b9",
    },
  ];
}

function topicCollapseSlots(): GanttEditorSlotWithUiAttributes[] {
  return [
    {
      id: "COLL-001-A",
      displayName: "COLL-001-A",
      group: "TOPIC-COLL-001",
      openTime: new Date(`${isoDay}T09:00:00Z`),
      closeTime: new Date(`${isoDay}T10:00:00Z`),
      destinationId: "chute-1",
      color: "#16a085",
    },
    {
      id: "COLL-001-B",
      displayName: "COLL-001-B",
      group: "TOPIC-COLL-001",
      openTime: new Date(`${isoDay}T10:15:00Z`),
      closeTime: new Date(`${isoDay}T11:00:00Z`),
      destinationId: "chute-2",
      color: "#27ae60",
    },
    {
      id: "COLL-002-A",
      displayName: "COLL-002-A",
      group: "TOPIC-COLL-002",
      openTime: new Date(`${isoDay}T12:00:00Z`),
      closeTime: new Date(`${isoDay}T13:00:00Z`),
      destinationId: "chute-3",
      color: "#8e44ad",
    },
  ];
}

function coreSlots(): GanttEditorSlotWithUiAttributes[] {
  return [
    {
      id: "LH123-20250101-F",
      displayName: "LH123 | F",
      group: "LH123",
      openTime: new Date(`${isoDay}T10:00:00Z`),
      closeTime: new Date(`${isoDay}T12:00:00Z`),
      destinationId: "chute-1",
      deadline: new Date(`${isoDay}T13:00:00Z`),
      secondaryDeadline: new Date(`${isoDay}T13:25:00Z`),
      color: "#3498db",
      hoverData: "Core slot for e2e interactions",
    },
    {
      id: "OS200-20250101-G",
      displayName: "OS200 | G",
      group: "OS200",
      openTime: new Date(`${isoDay}T09:00:00Z`),
      closeTime: new Date(`${isoDay}T10:15:00Z`),
      destinationId: "chute-2",
      color: "#2ecc71",
    },
    {
      id: "AA300-20250101-U",
      displayName: "AA300 | U",
      group: "AA300",
      openTime: new Date(`${isoDay}T14:00:00Z`),
      closeTime: new Date(`${isoDay}T15:30:00Z`),
      destinationId: "UNALLOCATED",
      color: "#9b59b6",
    },
  ];
}

function denseSlots(total: number): GanttEditorSlotWithUiAttributes[] {
  const boundedTotal = Math.max(3, Math.min(400, total));
  return Array.from({ length: boundedTotal }, (_, idx) => {
    const openHour = 1 + (idx % 20);
    const openMinute = (idx % 4) * 15;
    const close = new Date(Date.UTC(2025, 0, 1, openHour + 1, openMinute, 0));
    const open = new Date(Date.UTC(2025, 0, 1, openHour, openMinute, 0));
    return {
      id: `DENSE-${String(idx + 1).padStart(4, "0")}`,
      displayName: `DENSE-${idx + 1}`,
      group: `GROUP-${Math.floor(idx / 2) + 1}`,
      openTime: open,
      closeTime: close,
      destinationId: idx % 6 === 0 ? "UNALLOCATED" : `chute-${(idx % 3) + 1}`,
      color: idx % 2 === 0 ? "#1abc9c" : "#e67e22",
    };
  });
}

function performanceSlots(
  total: number,
  rangeStart: Date,
  rangeEnd: Date,
): GanttEditorSlotWithUiAttributes[] {
  const boundedTotal = Math.max(1, Math.min(80_000, total));
  const startMs = rangeStart.getTime();
  const endMs = Math.max(startMs + 60_000, rangeEnd.getTime());
  const spanMs = endMs - startMs;

  return Array.from({ length: boundedTotal }, (_, idx) => {
    const openRatio = idx / boundedTotal;
    const openMs = startMs + Math.floor(spanMs * openRatio);
    // Keep data spread over 3 months but induce deep overlap for vertical-scroll stress.
    const overlapDurationDays = 10 + (idx % 4);
    const closeMs = Math.min(endMs, openMs + overlapDurationDays * 24 * 60 * 60 * 1000);
    return {
      id: `PERF-${String(idx + 1).padStart(5, "0")}`,
      displayName: `PERF-${idx + 1}`,
      group: `PERF-TOPIC-${idx + 1}`,
      openTime: new Date(openMs),
      closeTime: new Date(closeMs),
      destinationId: idx % 12 === 0 ? "UNALLOCATED" : `chute-${(idx % 3) + 1}`,
      color: idx % 2 === 0 ? "#0d9488" : "#ea580c",
    };
  });
}

function baseData(fixture: FixtureName, slotCount: number): HarnessData {
  const performanceStart = new Date("2025-01-01T00:00:00Z");
  const performanceEnd = new Date("2025-03-31T23:59:59Z");

  const data: HarnessData = {
    startTime: fixture === "performance" ? performanceStart : defaultStart,
    endTime: fixture === "performance" ? performanceEnd : defaultEnd,
    slots:
      fixture === "dense"
        ? denseSlots(slotCount)
        : fixture === "performance"
          ? performanceSlots(slotCount, performanceStart, performanceEnd)
        : fixture === "suggestions"
          ? suggestionSlots()
          : fixture === "topic-collapse"
            ? topicCollapseSlots()
            : coreSlots(),
    destinations: destinationsBase,
    destinationGroups: destinationGroupsBase,
    suggestions: [],
    verticalMarkers: [],
    markedRegion: null,
    isReadOnly: fixture === "readonly",
    topContentPortion: 0,
  };

  if (fixture === "markers") {
    data.verticalMarkers = [
      { id: "m-std", date: new Date(`${isoDay}T11:00:00Z`), color: "#e74c3c", label: "STD" },
      { id: "m-etd", date: new Date(`${isoDay}T11:30:00Z`), color: "#2ecc71", label: "ETD" },
    ];
    data.suggestions = [{ slotId: "LH123-20250101-F", alternativeDestinationId: "chute-3" }];
    data.markedRegion = {
      startTime: new Date(`${isoDay}T10:30:00Z`),
      endTime: new Date(`${isoDay}T12:30:00Z`),
      destinationId: "multiple",
    };
  }

  if (fixture === "suggestions") {
    data.suggestions = [{ slotId: "SUGGEST-100", alternativeDestinationId: "chute-3" }];
  }

  if (fixture === "topic-collapse") {
    data.topContentPortion = 0;
  }

  return data;
}

function cloneData(data: HarnessData): HarnessData {
  return {
    ...data,
    startTime: new Date(data.startTime),
    endTime: new Date(data.endTime),
    slots: data.slots.map((slot) => ({
      ...slot,
      openTime: new Date(slot.openTime),
      closeTime: new Date(slot.closeTime),
      deadline: slot.deadline ? new Date(slot.deadline) : undefined,
      secondaryDeadline: slot.secondaryDeadline ? new Date(slot.secondaryDeadline) : undefined,
    })),
    destinations: data.destinations.map((d) => ({ ...d })),
    destinationGroups: data.destinationGroups.map((g) => ({ ...g })),
    suggestions: data.suggestions.map((s) => ({ ...s })),
    verticalMarkers: data.verticalMarkers.map((m) => ({ ...m, date: new Date(m.date) })),
    markedRegion: data.markedRegion
      ? {
          ...data.markedRegion,
          startTime: new Date(data.markedRegion.startTime),
          endTime: new Date(data.markedRegion.endTime),
        }
      : null,
  };
}

function parseDataQuery(raw: string | null | undefined): Partial<HarnessData> | null {
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(raw);
    const parsed = JSON.parse(decoded) as Partial<HarnessData>;
    return parsed;
  } catch {
    return null;
  }
}

function fromQuery(query: QueryInput): HarnessData {
  const fixture = normalizeFixture(query.fixture ?? null);
  const slotCount = parseNumber(query.slots ?? null, 40);
  const data = baseData(fixture, slotCount);

  data.isReadOnly = parseBoolean(query.readOnly ?? null, data.isReadOnly);
  data.topContentPortion = Math.max(0, Math.min(0.5, parseNumber(query.topContentPortion ?? null, 0)));
  data.startTime = parseDate(query.startTime ?? null, data.startTime);
  data.endTime = parseDate(query.endTime ?? null, data.endTime);

  if (parseBoolean(query.suggestions ?? null, data.suggestions.length > 0) && data.suggestions.length === 0) {
    data.suggestions = [{ slotId: "LH123-20250101-F", alternativeDestinationId: "chute-2" }];
  }
  if (parseBoolean(query.markers ?? null, data.verticalMarkers.length > 0) && data.verticalMarkers.length === 0) {
    data.verticalMarkers = [{ id: "m-auto", date: new Date(`${isoDay}T11:45:00Z`), color: "#8e44ad", label: "AUTO" }];
  }
  if (parseBoolean(query.markedRegion ?? null, !!data.markedRegion) && !data.markedRegion) {
    data.markedRegion = {
      startTime: new Date(`${isoDay}T09:45:00Z`),
      endTime: new Date(`${isoDay}T12:15:00Z`),
      destinationId: "multiple",
    };
  }

  const custom = parseDataQuery(query.data ?? null);
  if (custom) {
    return cloneData({
      ...data,
      ...custom,
      startTime: custom.startTime ? new Date(custom.startTime) : data.startTime,
      endTime: custom.endTime ? new Date(custom.endTime) : data.endTime,
      slots: custom.slots
        ? custom.slots.map((slot) => ({
            ...slot,
            openTime: new Date(slot.openTime),
            closeTime: new Date(slot.closeTime),
            deadline: slot.deadline ? new Date(slot.deadline) : undefined,
            secondaryDeadline: slot.secondaryDeadline ? new Date(slot.secondaryDeadline) : undefined,
          }))
        : data.slots,
      verticalMarkers: custom.verticalMarkers
        ? custom.verticalMarkers.map((m) => ({ ...m, date: new Date(m.date) }))
        : data.verticalMarkers,
      markedRegion: custom.markedRegion
        ? {
            ...custom.markedRegion,
            startTime: new Date(custom.markedRegion.startTime),
            endTime: new Date(custom.markedRegion.endTime),
          }
        : data.markedRegion,
    });
  }

  return cloneData(data);
}

const harnessData = ref<HarnessData>(fromQuery(route.query as QueryInput));
const harnessEvents = ref<Record<string, unknown[]>>({});

function recordEvent(name: string, payload: unknown): void {
  const current = harnessEvents.value[name] ?? [];
  harnessEvents.value = {
    ...harnessEvents.value,
    [name]: [...current, payload],
  };
}

function logEvent(name: string, payload: unknown): void {
  recordEvent(name, payload);
  console.log(`[e2e-harness] ${name}`, payload);
}

function onChangeStartAndEndTime(start: Date, end: Date): void {
  harnessData.value = { ...harnessData.value, startTime: start, endTime: end };
  logEvent("onChangeStartAndEndTime", { start, end });
}

function onChangeDestinationId(slotId: string, destinationId: string, preview: boolean): void {
  if (!preview) {
    harnessData.value = {
      ...harnessData.value,
      slots: harnessData.value.slots.map((slot) =>
        slot.id === slotId ? { ...slot, destinationId } : slot,
      ),
    };
  }
  logEvent("onChangeDestinationId", { slotId, destinationId, preview });
}

function onChangeSlotTime(slotId: string, openTime: Date, closeTime: Date): void {
  harnessData.value = {
    ...harnessData.value,
    slots: harnessData.value.slots.map((slot) =>
      slot.id === slotId
        ? {
            ...slot,
            openTime,
            closeTime,
          }
        : slot,
    ),
  };
  logEvent("onChangeSlotTime", { slotId, openTime, closeTime });
}

function onClickOnSlot(slotId: string): void {
  logEvent("onClickOnSlot", { slotId });
}

function onHoverOnSlot(slotId: string): void {
  logEvent("onHoverOnSlot", { slotId });
}

function onDoubleClickOnSlot(slotId: string): void {
  logEvent("onDoubleClickOnSlot", { slotId });
}

function onContextClickOnSlot(slotId: string): void {
  logEvent("onContextClickOnSlot", { slotId });
}

function onSelectionChange(slotIds: string[]): void {
  logEvent("onSelectionChange", { slotIds: [...slotIds] });
}

function onChangeVerticalMarker(id: string, date: Date): void {
  harnessData.value = {
    ...harnessData.value,
    verticalMarkers: harnessData.value.verticalMarkers.map((marker) =>
      marker.id === id ? { ...marker, date } : marker,
    ),
  };
  logEvent("onChangeVerticalMarker", { id, date });
}

function onClickVerticalMarker(id: string): void {
  logEvent("onClickVerticalMarker", { id });
}

const testApi: HarnessApi = {
  getConfig: () => cloneData(harnessData.value),
  setConfig: (partial) => {
    harnessData.value = cloneData({ ...harnessData.value, ...partial });
    return cloneData(harnessData.value);
  },
  resetFromUrl: () => {
    harnessData.value = fromQuery(route.query as QueryInput);
    return cloneData(harnessData.value);
  },
  applyQuery: async (query) => {
    await router.replace({ query: { ...route.query, ...query } });
  },
  getEvents: () => ({ ...harnessEvents.value }),
  clearEvents: () => {
    harnessEvents.value = {};
  },
};

watch(
  () => route.fullPath,
  () => {
    harnessData.value = fromQuery(route.query as QueryInput);
  },
);

onMounted(() => {
  (window as Window & { __ganttE2eHarness?: HarnessApi }).__ganttE2eHarness = testApi;
});

onBeforeUnmount(() => {
  const w = window as Window & { __ganttE2eHarness?: HarnessApi };
  if (w.__ganttE2eHarness === testApi) {
    delete w.__ganttE2eHarness;
  }
});
</script>

<template>
  <div style="height: 100vh; width: 100%; margin: 0 auto">
    <GanttEditorComponent
      :isReadOnly="harnessData.isReadOnly"
      :startTime="harnessData.startTime"
      :endTime="harnessData.endTime"
      :slots="harnessData.slots"
      :destinations="harnessData.destinations"
      :destinationGroups="harnessData.destinationGroups"
      :suggestions="harnessData.suggestions"
      :verticalMarkers="harnessData.verticalMarkers"
      :markedRegion="harnessData.markedRegion"
      :topContentPortion="harnessData.topContentPortion"
      @onChangeStartAndEndTime="onChangeStartAndEndTime"
      @onChangeDestinationId="onChangeDestinationId"
      @onChangeSlotTime="onChangeSlotTime"
      @onClickOnSlot="onClickOnSlot"
      @onHoverOnSlot="onHoverOnSlot"
      @onDoubleClickOnSlot="onDoubleClickOnSlot"
      @onContextClickOnSlot="onContextClickOnSlot"
      @onSelectionChange="onSelectionChange"
      @onChangeVerticalMarker="onChangeVerticalMarker"
      @onClickVerticalMarker="onClickVerticalMarker"
    />
  </div>
</template>