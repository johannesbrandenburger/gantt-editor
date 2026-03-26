export type GanttEditorSlot = {
    id: string,
    group: string, // flightId
    displayName: string,
    openTime: Date,
    closeTime: Date,
    destinationId: string,
    additionalData?: string,
    hoverData?: string,
    deadline?: Date,
    /** When set, overrides the default line color for the deadline (STD) marker. */
    deadlineColor?: string,
    secondaryDeadline?: Date,
    /** When set, overrides the default line color for the secondary (ETD) marker. */
    secondaryDeadlineColor?: string,
    readOnly?: boolean,
    color?: string
};
export type GanttEditorDestination = {
    id: string,
    displayName: string,
    active: boolean,
    groupId: string
};
export type GanttEditorDestinationGroup = {
    id: string,
    displayName: string,
    heightPortion: number
};
export type GanttEditorMarkedRegion = {
    startTime: Date,
    endTime: Date,
    destinationId: string | "multiple"
};
export type GanttEditorSuggestion = {
    slotId: string,
    alternativeDestinationId: string,
    alternativeDestinationDisplayName?: string,
};

export type GanttEditorSlotWithUiAttributes = GanttEditorSlot & {
    isConflict?: boolean;
    isCopied?: boolean;
    isPreview?: boolean;
}

export type GanttEditorXAxisOptions = {
    upper?: {
        tickFormat?: (domainValue: Date | d3.NumberValue) => string;
        ticks?: d3.TimeInterval;
    };
    lower?: {
        tickFormat?: (domainValue: Date | d3.NumberValue) => string;
        ticks?: d3.TimeInterval;
    };
};

export interface Topic {
    name: string;
    groupId: string;
    id: string;
    rows: Array<{
        id: string;
        name: string;
        isPreview?: boolean;
        slots: GanttEditorSlotWithUiAttributes[];
    }>;
    yStart: number;
    yEnd: number;
    isCollapsed: boolean;
    isInactive: boolean;
}

export interface ProcessedData {
    processedData_: Topic[];
    processedStartDateTime: Date;
    processedEndDateTime: Date;
}

export interface Settings {
    rowHeight: number;
    collapseGroups: boolean;
    overlayWeeks: number;
    groupBy: string;
    seperateByClasses: boolean;
    showSlotState: boolean;
    progressChartsDisplay: "Pie Chart" | "Bar Chart" | "None";
    showEventDots: boolean;
    showDeparture: string | null;
    showEventCharts: boolean;
    showBagStateCharts: boolean;
    editable: boolean;
    slotLimit: number;
    sortInFrontend: "None" | "First Open Time";
    overlayDays: number;
    showCheckInCharts: boolean;
    showTransferCharts: boolean;
    showBagStateTimeline: boolean;
    compactView: boolean;
}

export interface SlotText {
    x: number;
    text: string;
    textColor: string;
}

export interface SlotDefinition {
    x: number;
    y: number;
    width: number;
    height: number;
    fill: string;
    text: string;
    opacity: number;
    isCollapsed: boolean;
    id: string;
    slotData: GanttEditorSlotWithUiAttributes;
    isStartInView: boolean;
    isEndInView: boolean;
    isDraggable: boolean;
    isCopied?: boolean;
    isHighlightedByLabel?: boolean;
    newX?: number;
    newWidth?: number;
    newY?: number;
    dragStartX?: number;
    dragStartY?: number;
    originalX?: number;
    originalY?: number;
    originalWidth?: number;
    originalOpenTime?: Date;
    originalCloseTime?: Date;
    slotDuration?: number;
    element?: any;
    alternativeDestination?: {
        id: string;
        displayName: string;
    };
}

export interface SuggestionDefinition {
    x: number;
    y: number;
    text: string;
    slotId: string;
}

export interface TranslateFunction {
    (options: { x: number; y: number; width: number; height: number }): string;
}

export interface DisplayFunction {
    (options: { x: number; width: number, y: number }): string;
}

export interface TopicLabel {
    x: number;
    y: number;
    text: string;
    id: string;
    isInactive: boolean;
    isCollapsed: boolean;
    slotNames: string[];
}

export interface RowLabel {
    x: number;
    y: number;
    text: string;
    id: string;
}

export interface DepartureMarker {
    x1: number;
    x2: number;
    y: number;
    height: number;
    info: string;
    id: string;
    color: string;
    lineColor?: string;
    markerOpacity?: number;
    layer?: number;
    lineVisible: boolean;
    lineHeight: number;
    lineY: number;
}

export interface ChartDefinition {
    data: any[];
    metrics?: any;
    timeExtent: [Date, Date];
    x: number;
    y: number;
    width: number;
    height: number;
    id: string;
    slotId: string;
}

export interface ProgressChartDefinition {
    x: number;
    y: number;
    width: number;
    height: number;
    data: Array<{
        label: string;
        value: number;
        color: string;
    }>;
    id: string;
    slotId: string;
}

export interface EventDot {
    x: number;
    y: number;
    r: number;
    fill: string;
    id: string;
    data: any;
}

export interface EventChartDefinitions {
    [eventType: string]: {
        chartDefinition: ChartDefinition[];
        color: string;
        order?: number;
    };
}