import * as d3 from 'd3';
import { textSize, mapSlotToStateColor } from '../helpers';
import { addSlotToRows, processData } from './process-data';
import { createSlotPath } from './slot-path';
import { setupBrush } from './setup-brush';
import { updateGridlinesAndLabels } from './gridlines-and-labels';
import { updateDepartureMarker, getSharedHoverTooltip, showSharedHoverTooltip, hideSharedHoverTooltip } from './departuremarker';
import { updateWeekdays } from './weekdays';
import { setupPanAndZoom } from './setup-pan-zoom';
import type { Topic, ProcessedData, Settings, SlotText, SlotDefinition, TranslateFunction, DisplayFunction, TopicLabel, RowLabel, DepartureMarker, ChartDefinition, ProgressChartDefinition, EventDot, EventChartDefinitions, SuggestionDefinition, GanttEditorSlotWithUiAttributes, GanttEditorXAxisOptions } from './types';
import { updateAxis } from './axis';
import { addSvgDefs } from './svg-defs';
import { setupCurrentTime } from './current-time';
import { updateSuggestionButtons } from './suggestion-buttons';
import type { GanttEditorDestination, GanttEditorDestinationGroup, GanttEditorSlot } from './types';


// NOTE: this is still prototype code and not really ready for production use
export function updateChart(
    updateChartProps: {
        xAxisSvgRef: SVGElement,
        data: Array<GanttEditorSlotWithUiAttributes>,
        destinationData: Array<GanttEditorDestination>,
        processedData: Topic[],
        windowWidth: number,
        startDateTime: Date,
        endDateTime: Date,
        onItemChanged: (item: { id: string;[key: string]: any }, wasSuggestion?: boolean) => void,
        onChangeStartAndEndDateTime: (start: Date, end: Date) => void,
        settings: any,
        clipboardUpdate: () => void,
        openAllocationDetails: (allocationId: string) => void,
        animationDuration?: number,
        markedRegion: { destinationId: string; timeInterval: { start: number; end: number } } | null;
        suggestions: {
            id: string;
            alternativeDestination: string;
            alternativeDestinationDisplayName: string;
        }[],
        destinationGroups: Array<GanttEditorDestinationGroup>,
        svgRefs: Map<string, SVGElement>;
        heights: Map<string, number>;
        isReadOnly: boolean;
        onHoverOnSlot?: (slotId: string) => void;
        onDoubleClickOnSlot?: (slotId: string) => void;
        onContextClickOnSlot?: (slotId: string) => void;
        xAxisOptions?: GanttEditorXAxisOptions;
        lazyRendering?: boolean;
    },
): void {

    const svgs = new Map<string, d3.Selection<SVGElement, unknown, null, undefined>>();
    let {
        xAxisSvgRef,
        data,
        destinationData,
        processedData,
        windowWidth,
        startDateTime,
        endDateTime,
        onItemChanged,
        onChangeStartAndEndDateTime,
        settings,
        clipboardUpdate,
        openAllocationDetails,
        markedRegion,
    } = updateChartProps;
    let animationDuration = updateChartProps.animationDuration === undefined ? 200 : updateChartProps.animationDuration;

    settings = {
        groupBy: "destinationId" as keyof NonNullable<GanttEditorSlotWithUiAttributes>,
        rowHeight: 40,
        progressChartsDisplay: "None",
        collapseGroups: false,
        editable: true,
        ...settings,
    };

    const margin = { top: 40, right: 60, bottom: 40, left: 200 };
    const width = windowWidth - margin.left - margin.right - 10;
    const slotOpacity = (settings.collapseGroups || settings.overlayWeeks > 0) ? 0.4 : 1;

    // Process data into hierarchical structure
    const unprocessedStartDateTime = new Date(startDateTime);
    const unprocessedEndDateTime = new Date(endDateTime);

    if (!processedData || processedData.length === 0) {
        const { processedData_, processedStartDateTime, processedEndDateTime } = processData(data, destinationData, startDateTime, endDateTime, settings) as ProcessedData;
        startDateTime = processedStartDateTime;
        endDateTime = processedEndDateTime;
        processedData = processedData_;
    }

    const currentDateTime = new Date();

    const containerMap = new Map<string, HTMLElement>();
    for (const group of updateChartProps.destinationGroups) {
        const container = document.getElementById(`${group.id}-gantt-container`);
        if (!container) continue;
        containerMap.set(group.id, container);
    }

    // const timeExtent = d3.extent([ ...data.map(d => d.openTime), ...data.map(d => d.closeTime) ]);
    const timeExtent: [Date, Date] = [startDateTime, endDateTime];

    const xScale = d3.scaleTime()
        .domain(timeExtent)
        .range([0, width])
        .clamp(true);
    const xScaleHeight = 20;

    const yScaleMap = new Map<string, d3.ScaleBand<string> & { gap: () => number, height: number }>();

    // const yScale = d3.scaleBand()
    //     .domain(d3.range(allocatedTotalRows).map(d => d.toString()))
    //     .range([0, allocatedGanttHeight - margin.top - margin.bottom])
    //     .padding(0.3) as d3.ScaleBand<string> & { gap: () => number };
    // yScale.gap = () => yScale.step() - yScale.bandwidth();
    for (const group of updateChartProps.destinationGroups) {
        const groupTotalRows = processedData.filter(t => t.groupId === group.id).filter(t => !t.isCollapsed).reduce((acc, topic) => acc + topic.rows.length, 0) + processedData.filter(t => t.groupId === group.id).length;
        const groupHeight = settings.rowHeight * groupTotalRows + margin.top + margin.bottom;
        const yScale = d3.scaleBand()
            .domain(d3.range(groupTotalRows).map(d => d.toString()))
            .range([0, groupHeight - margin.top - margin.bottom])
            .padding(0.3) as d3.ScaleBand<string> & { gap: () => number, height: number };
        yScale.gap = () => yScale.step() - yScale.bandwidth();
        yScale.height = groupHeight;
        yScaleMap.set(group.id, yScale);
    }

    // Setup x-axis SVG
    const xAxisSvg = d3.select(xAxisSvgRef);
    xAxisSvg
        .attr('width', width + margin.left + margin.right)

    // dynamically create SVGs for each destination group
    for (const group of updateChartProps.destinationGroups) {
        const svgRef = updateChartProps.svgRefs.get(group.id);
        if (!svgRef) continue;
        const svg = d3.select(svgRef);
        // const height = updateChartProps.heights.get(group.id);
        const height = yScaleMap.get(group.id)?.height;
        if (!height) continue;
        svg
            .attr('width', width + margin.left + margin.right)
            .attr('height', height);
        svgs.set(group.id, svg);
    }

    // Setup x-axis container if it doesn't exist
    let xAxisGroup = xAxisSvg.select('.x-axis-group') as d3.Selection<SVGGElement, unknown, null, undefined>;

    if (xAxisGroup.empty()) {
        xAxisGroup = xAxisSvg
            .append('g')
            .attr('class', 'x-axis-group')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        // date should be on top
        xAxisGroup.append('g').attr('class', 'x-axis-date').attr('transform', `translate(0,${-20})`);
        xAxisGroup.append('g').attr('class', 'x-axis');
    }

    const groupMap = new Map<string, d3.Selection<SVGGElement, unknown, null, undefined>>();
    for (const group of updateChartProps.destinationGroups) {
        let groupGroup = svgs.get(group.id)?.select(`.${group.id}-group`) as d3.Selection<SVGGElement, unknown, null, undefined>;
        if (groupGroup.empty()) {
            groupGroup = svgs.get(group.id)!
                .append('g')
                .attr('class', `${group.id}-group`)
                .attr('transform', `translate(${margin.left},0)`);
            addSvgDefs(svgs.get(group.id)!);
        }
        groupMap.set(group.id, groupGroup);
    }

    const changeStartAndEndDateTime = (newStartDateTime: Date, newEndDateTime: Date): void => {
        updateChart({ ...updateChartProps, startDateTime: newStartDateTime, endDateTime: newEndDateTime, animationDuration: 0 });
        onChangeStartAndEndDateTime(newStartDateTime, newEndDateTime);
    }
    const changeStartAndEndDateTimeWithoutFetch = (newStartDateTime: Date, newEndDateTime: Date): void => {
        updateChart({ ...updateChartProps, startDateTime: newStartDateTime, endDateTime: newEndDateTime, animationDuration: 0 });
    }
    let hideCurrentTime = (startDateTime > currentDateTime || endDateTime < currentDateTime);

    for (const group of updateChartProps.destinationGroups) {
        setupCurrentTime(groupMap.get(group.id)!, currentDateTime, xScale, yScaleMap.get(group.id)!.height, xScaleHeight, animationDuration, hideCurrentTime);
    }

    // Generate flat structures for D3 data binding
    type GroupDefs = {
        topicLabelsDefinition: TopicLabel[],
        rowLabelsDefinition: RowLabel[],
        departureMarkerDefinition: DepartureMarker[],
        slotDefinition: SlotDefinition[],
        horizontalGridlinesDefinitions: { y: number; id: string }[],
        suggestionDefinition: SuggestionDefinition[],
        currentY: number,
    }
    const groupDefsMap = new Map<string, GroupDefs>();
    for (const group of updateChartProps.destinationGroups) {
        groupDefsMap.set(group.id, {
            topicLabelsDefinition: [],
            rowLabelsDefinition: [],
            departureMarkerDefinition: [],
            slotDefinition: [],
            horizontalGridlinesDefinitions: [],
            suggestionDefinition: [],
            currentY: 15, // TODO: check
        });
    }

    // Pre-build a Map of suggestion slot IDs for O(1) lookup inside the slot loop
    const suggestionsMap = new Map<string, { alternativeDestination: string; alternativeDestinationDisplayName: string }>();
    for (const s of updateChartProps.suggestions) {
        suggestionsMap.set(s.id, s);
    }

    processedData.forEach((topic, topicIndex) => {

        const defs = groupDefsMap.get(topic.groupId)!;
        let currentY = defs?.currentY;
        const yScale = yScaleMap.get(topic.groupId)!;

        topic.yStart = currentY;
        defs.horizontalGridlinesDefinitions.push({ y: currentY, id: `gridline-${topic.id}` });

        const slotNames = topic.rows.flatMap(row =>
            row.slots.map(slot => slot.displayName)
        );

        defs.topicLabelsDefinition.push({
            x: -margin.left + 10,
            y: currentY + yScale.step() - (yScale.bandwidth() / 2),
            text: settings.groupBy === "destinationId" ? `${topic.name}` : `Flight ${topic.name}`,
            id: `${topic.name}`,
            isInactive: topic.isInactive,
            isCollapsed: topic.isCollapsed,
            slotNames: slotNames,
        });

        if (topic.rows.length === 0) {
            currentY += yScale.step();
            defs.currentY = currentY;
        }

        topic.yEnd = currentY; // at least one row for the topic

        // Add rows for this topic
        topic.rows.forEach((row) => {
            // if (!topic.isCollapsed) {
            //     defs.horizontalGridlinesDefinitions.push({ y: currentY, id: `gridline-${row.id}` });
            //     defs.rowLabelsDefinition.push({
            //         x: -margin.left + 20,
            //         y: currentY + yScale.step() - (yScale.bandwidth() / 2),
            //         text: row.name,
            //         id: `row-${topic.name}-${row.name}`
            //     });
            // }

            // Add slots for this row
            row.slots.forEach(slot => {
                const isStartInView = slot.openTime >= timeExtent[0] && slot.openTime <= timeExtent[1];
                const isEndInView = slot.closeTime >= timeExtent[0] && slot.closeTime <= timeExtent[1];
                const openTime = slot.openTime; // d3.max([slot.openTime, timeExtent[0]]);
                const closeTime = slot.closeTime; // d3.min([slot.closeTime, timeExtent[1]]);
                let slotWidth = xScale(closeTime) - xScale(openTime);

                if (slotWidth <= 0) return;

                // slot color given by parents or default to state color
                let slotColor = slot.color;
                if (slotColor === undefined || slotColor === null) {
                    slotColor = mapSlotToStateColor(slot);
                }
                if (slot.isPreview) {
                    slotColor = "url(#diagonal-stripe-2)";
                }
                const slotText = slot.displayName;
                const x = isStartInView ? xScale(openTime) : 0;
                const x2 = isEndInView ? xScale(closeTime) : width;
                slotWidth = x2 - x;
                const y = currentY + (0.5 * yScale.gap());

                defs.slotDefinition.push({
                    x: x,
                    y: y,
                    width: slotWidth,
                    height: yScale.bandwidth(),
                    fill: slotColor || "lightgrey",
                    text: slotText,
                    id: `slot-${slot.id}`,
                    opacity: topic.isCollapsed ? 0.4 : 1,
                    isCollapsed: topic.isCollapsed,
                    slotData: slot,
                    isStartInView,
                    isEndInView,
                    isDraggable: isStartInView && isEndInView,
                    isCopied: slot.isCopied
                });

                // add a departure marker for indicating the departure time of a corresponding flight
                if (!settings.collapseGroups
                    && slot.deadline
                    && !settings.compactView
                    && !topic.isCollapsed
                ) {
                    let departureDate = new Date(slot.deadline);
                    if (departureDate) {
                        departureDate = new Date(departureDate);

                        // check if visible
                        if (!(departureDate < timeExtent[0] || departureDate > timeExtent[1])) {
                            const departureX = xScale(departureDate);
                            const departureText = slot.hoverData
                            defs.departureMarkerDefinition.push({
                                x1: x + slotWidth,
                                x2: departureX,
                                y: y,
                                height: yScale.bandwidth(),
                                lineHeight: yScale.step(),
                                lineY: currentY,
                                info: departureText || "",
                                id: `departure-${slot.id}`,
                                color: slotColor!,
                                lineVisible: departureX < x + slotWidth,
                            });
                        }
                    }
                }

                // add a suggestion button
                const suggestion = suggestionsMap.get(slot.id);
                const alternativeDestinationId = suggestion?.alternativeDestination;
                if (alternativeDestinationId && !topic.isCollapsed) {
                    const alternativeDestinationDisplayname = (destinationData.find(d => d.id === alternativeDestinationId)?.displayName || suggestion?.alternativeDestinationDisplayName || alternativeDestinationId)!;
                    defs.suggestionDefinition.push({
                        x: xScale(openTime) - 20,
                        y: y + (0.5 * yScale.gap()),
                        text: `Move to alternative destination ${alternativeDestinationDisplayname}`,
                        slotId: slot.id,
                    });
                }
            });

            currentY += yScale.step();
            defs.currentY = currentY;
            topic.yEnd = currentY;
        });

    });

    const scrollToDestination = (topic: Topic) => {
        const topicY = topic.yStart + (topic.yEnd - topic.yStart) / 2;
        const group = groupMap.get(topic.groupId);
        if (!group) return;
        const groupContainer = containerMap.get(topic.groupId);
        if (!groupContainer) return;
        const allocatedCurrentVisibleHeight = groupContainer?.clientHeight || 0;
        const scrollTarget = topicY - (allocatedCurrentVisibleHeight / 2);
        groupContainer.scrollTo({ top: scrollTarget, behavior: "smooth" });
    }

    const markIntervalOnDestination = (topic: Topic | null, timeInterval: { start: number; end: number }) => {

        // Add a highlighted rectangle to mark the interval on the topic
        const startX = xScale(timeInterval.start);
        const endX = xScale(timeInterval.end);
        const width = endX - startX;

        if (width <= 0) return; // No visible interval
        let yStart = topic?.yStart || 0;

        const groupId = topic ? topic.groupId : groupMap.keys().next().value; // if no topic, use the first group (TODO: mabe all groups later)
        if (!groupId) return;
        const group = groupMap.get(groupId);
        if (!group) return;

        // topic?.yEnd or the maximum yEnd of all topics in the group
        let yEnd = topic?.yEnd || Math.max(...processedData.filter(t => t.groupId === groupId).map(t => t.yEnd));

        group.append("rect")
            .attr("class", "interval-marker")
            .attr("x", startX)
            .attr("y", yStart)
            .attr("width", width)
            .attr("height", yEnd - yStart)
            .attr("fill", "rgba(255, 255, 0, 0.2)")
            .attr("stroke", "rgba(255, 215, 0, 0.8)")
            .attr("stroke-width", 2)
            .attr("rx", 4)
            .attr("ry", 4)
            .attr("pointer-events", "none") // Allow clicks to pass through
            .attr("opacity", 0.7)
            .style("animation", "interval-marker-pulse 3s ease-in-out infinite");
    }

    const markIntervalComplete = (timeInterval: { start: number; end: number }) => {
        markIntervalOnDestination(null, timeInterval);
    }

    groupMap.forEach((group) => {
        // Interrupt any running transitions before removing to prevent leaked callbacks
        group.selectAll(".interval-marker").interrupt().remove();
    });

    if (updateChartProps.markedRegion) {
        const { destinationId, timeInterval } = updateChartProps.markedRegion;
        if (destinationId && timeInterval) {
            if (destinationId === "multiple") {
                markIntervalComplete(timeInterval);
            } else {
                const topic = processedData.find(t => t.id === destinationId);
                if (topic) {
                    scrollToDestination(topic);
                    markIntervalOnDestination(topic, timeInterval);
                }
            }
        }
    }

    const clearClipboard = () => {
        console.log("Clearing clipboard");
        localStorage.setItem("pointerClipboard", "[]");
        clipboardUpdate();
        processedData.forEach(topic => {
            topic.rows.forEach(row => {
                row.slots.forEach(s => {
                    s.isCopied = false;
                })
            })
        })
        // Also clear isCopied on original data items so it persists through processData
        data.forEach(d => { d.isCopied = false; });
        // remove the preview slots
        processedData.forEach(topic => {
            topic.rows.forEach((row) => {
                row.slots = row.slots.filter((slot) => !slot.isPreview);
            });
            topic.rows = topic.rows.filter((row) => row.slots.length > 0);
        });
        // updateChart(xAxisSvgRef, data, destinationData, processedData, windowWidth, startDateTime, endDateTime, onItemChanged, onChangeStartAndEndDateTime, settings, clipboardUpdate, openAllocationDetails, updateChartProps);
        updateChart({ ...updateChartProps, processedData }); // TODO: processedData not needed
    }

    updateAxis(
        xAxisGroup,
        animationDuration,
        xScale,
        0,
        clearClipboard,
        updateChartProps.xAxisOptions
    )

    groupMap.forEach((group, groupId) => {
        const defs = groupDefsMap.get(groupId)!;
        updateGridlinesAndLabels(
            group,
            defs.topicLabelsDefinition,
            defs.rowLabelsDefinition,
            defs.horizontalGridlinesDefinitions,
            yScaleMap.get(groupId)!,
            margin,
            width,
            animationDuration
        );
    });

    const moveClipboardToTopic = (topicId: string) => {
        if (updateChartProps.isReadOnly) return;
        const clipboard = JSON.parse(localStorage.getItem("pointerClipboard") || "[]") as GanttEditorSlot[];

        if (clipboard.length === 0) return;

        clipboard.forEach((slotData: GanttEditorSlot) => {
            console.log("Pasting slot", slotData, "into topic", topicId);
            slotData.destinationId = topicId;
            let item = data.find((d) => d.id === slotData.id);
            if (!item) return;
            item.destinationId = topicId;
            item.isCopied = false;
            onItemChanged({ id: slotData.id, [settings.groupBy]: topicId });
        });
        localStorage.setItem("pointerClipboard", "[]");
        updateChart({ ...updateChartProps, processedData: [] })
        clipboardUpdate();
    }

    const collapseTopic = (topicId: string) => {
        let collapsedTopics = JSON.parse(localStorage.getItem("collapsedTopics") || "[]") as string[];
        if (collapsedTopics.includes(topicId)) {
            collapsedTopics = collapsedTopics.filter((t) => t !== topicId);
        } else {
            collapsedTopics.push(topicId);
        }
        localStorage.setItem("collapsedTopics", JSON.stringify(collapsedTopics));
        updateChart({ ...updateChartProps, processedData: [] })
    };

    // Track which topic is currently being previewed to avoid redundant re-renders
    let lastPreviewTopicId: string | null = null;

    const previewClipboardPaste = (topicId: string) => {
        if (updateChartProps.isReadOnly) return;
        const clipboard = JSON.parse(localStorage.getItem("pointerClipboard") || "[]") as GanttEditorSlot[];
        if (clipboard.length === 0) return;
        // Skip if we're already showing a preview for this exact topic
        if (lastPreviewTopicId === topicId) return;
        lastPreviewTopicId = topicId;

        // update the chart with  preview data
        const processedDataWithPreview = processedData.map((topic) => {

            // remove all the other isPreview slots and rows
            topic.rows.forEach((row) => {
                row.slots = row.slots.filter((slot) => !slot.isPreview);
            });
            topic.rows = topic.rows.filter((row) => row.slots.length > 0);

            // add the slots from the clipboard to the topic rows
            if (topic.id === topicId) {
                clipboard
                    .map((s: GanttEditorSlot) => { return { ...s, openTime: new Date(s.openTime), closeTime: new Date(s.closeTime) } })
                    .sort((a, b) => b.openTime.getTime() - a.openTime.getTime())
                    .forEach((s: GanttEditorSlot) => {
                        const slotData = data.find((d) => d.id === s.id);
                        if (!slotData) return;
                        if (slotData[settings.groupBy as keyof typeof slotData] == topic.id) return; // already in the topic
                        let newSlotData = { ...slotData };
                        newSlotData.destinationId = topic.id;
                        newSlotData.isPreview = true;
                        newSlotData.isCopied = false;
                        newSlotData.id = newSlotData.id + "-preview";
                        // to the first row
                        addSlotToRows(topic.rows, newSlotData, topic.id, false);
                    });
            }
            return topic;
        });

        // update the chart with the preview data
        updateChart({ ...updateChartProps, processedData: processedDataWithPreview });
    };

    const updateTopicAreas = (
        group: d3.Selection<SVGGElement, unknown, null, undefined>,
        data: Topic[],
    ) => {
        // just add transparent rectangles for each topic which can be colored later
        const topicAreas = group.selectAll<SVGRectElement, Topic>('.topic-area')
            .data(data, d => d.name);
        topicAreas.enter()
            .append('rect')
            .attr('class', `topic-area`)
            .attr('x', -margin.left)
            .attr('y', d => d.yStart)
            .attr('width', width + margin.left + margin.right)
            .attr('height', d => d.yEnd - d.yStart)
            .attr('fill', 'transparent')
            .merge(topicAreas as any)
            // click event to the topic areas to paste the clipboard content into this topic
            .on("click", (event, d) => {
                console.log("Clicked on topic area", d.name);
                if (d3.pointer(event)[0] < 0) {
                    collapseTopic(d.id);
                    return;
                }
                if (!updateChartProps.isReadOnly) {
                    moveClipboardToTopic(d.id);
                }
            })
            .on("mouseover", (event, d) => {
                if (!updateChartProps.isReadOnly) {
                    previewClipboardPaste(d.id);
                }
            })
            .transition()
            .duration(animationDuration)
            .attr('y', d => d.yStart)
            .attr('height', d => d.yEnd - d.yStart);
        topicAreas.exit().remove();
    }

    const addSlotToClipboard = (slotData: GanttEditorSlot) => {
        if (updateChartProps.isReadOnly || !slotData || slotData.readOnly) return;
        const pointerClipboard = JSON.parse(localStorage.getItem("pointerClipboard") || "[]");
        let isCopied = false;
        if (pointerClipboard.find((slot: GanttEditorSlot) => slot.id === slotData?.id)) {
            // remove the slot from the clipboard
            const newClipboard = pointerClipboard.filter((slot: GanttEditorSlot) => slot.id !== slotData?.id);
            localStorage.setItem("pointerClipboard", JSON.stringify(newClipboard));
        } else {
            // add the slot to the clipboard
            pointerClipboard.push(slotData);
            localStorage.setItem("pointerClipboard", JSON.stringify(pointerClipboard));
            isCopied = true;
        }
        clipboardUpdate();
        // update the chart to display the slots as copied
        // Set isCopied on both the processedData slots AND the original data items
        // so the flag persists when processData creates shallow copies
        processedData.forEach(topic => {
            topic.rows.forEach(row => {
                row.slots.forEach(s => {
                    if (s.id == slotData.id) {
                        s.isCopied = isCopied;
                    }
                })
            })
        })
        const dataItem = data.find(d => d.id === slotData.id);
        if (dataItem) {
            dataItem.isCopied = isCopied;
        }
        updateChart(updateChartProps);
    }

    const onSelectedSomethingWrapper = (def: GroupDefs) => {
        return (selection: [[number, number], [number, number]]) => {
            if (updateChartProps.isReadOnly) return;
            // all slots that are in the selection should be added to the clipboard
            console.log("Selected something", selection);
            const slots = def.slotDefinition.filter((slot) => {
                const x = slot.x; const x2 = slot.x + slot.width; const y = slot.y; const y2 = slot.y + slot.height;
                const xIsMatching = selection[0][0] <= x && x2 <= selection[1][0];
                const yIsMatching = selection[0][1] <= y && y2 <= selection[1][1];
                return xIsMatching && yIsMatching && !slot.slotData.readOnly;
            });
            slots.forEach((slot) => {
                addSlotToClipboard(slot.slotData);
            });
        }
    }

    groupMap.forEach((group, groupId) => {
        const defs = groupDefsMap.get(groupId)!;
        setupBrush(group, onSelectedSomethingWrapper(defs), width, yScaleMap.get(groupId)!.height);
        updateTopicAreas(group, processedData.filter(d => d.groupId === groupId));
    });

    const updateSlots = (
        group: d3.Selection<SVGGElement, unknown, null, undefined>,
        slotDefinitions: SlotDefinition[],
        yScale: d3.ScaleBand<string> & { gap: () => number },
    ) => {

        // Update slots (bars) with resize handles
        const slots = group
            .selectAll<SVGGElement, SlotDefinition>(".slot-group")
            .data(slotDefinitions, d => d.id);

        // Enter new slots and add children
        const slotsEnter = slots.enter()
            .append("g")
            .attr("class", "slot-group")
            .attr("opacity", 1)
            .attr("transform", d => `translate(${d.x},${d.y})`)
            .attr("pointer-events", d => d.slotData.isPreview ? "none" : null);

        slotsEnter.append("path")
            .attr("class", "slot-box");

        slotsEnter.append("foreignObject")
            .attr("class", "slot-text")
            .attr("x", 0)
            .attr("y", 0)
            .attr("width", d => d.width)
            .attr("height", yScale.bandwidth())
            .append("xhtml:div")
            .style("width", "100%")
            .style("padding-left", "5px")
            .style("height", "100%")
            .style("display", "flex")
            .style("justify-content", "flex-start")
            .style("align-items", "center")
            .style("overflow", "hidden")
            .style("text-overflow", "ellipsis")
            .style("white-space", "nowrap")
            .style("font-size", "12px")
            .style("font-weight", "bold")
            .style("color", "white")
            .html(d => d.text);

        slotsEnter.append("rect")
            .attr("class", "slot-resize-handle-left")
            .attr("width", 8).attr("rx", 4).attr("ry", 4)
            .style("cursor", updateChartProps.isReadOnly ? "default" : "ew-resize")
            .style("fill", "rgba(255,255,255,0.3)");

        slotsEnter.append("rect")
            .attr("class", "slot-resize-handle-right")
            .attr("width", 8).attr("rx", 4).attr("ry", 4)
            .style("cursor", updateChartProps.isReadOnly ? "default" : "ew-resize")
            .style("fill", "rgba(255,255,255,0.3)");


        // Hover delay mechanism – store on the group node so a fresh updateSlots
        // call can cancel any pending timeout from the previous call's closure.
        type GroupWithHover = SVGGElement & {
            _hoverTimeout?: ReturnType<typeof setTimeout> | null;
            _isResizingSlot?: boolean;
        };
        const groupNode = group.node() as GroupWithHover;
        // Cancel any pending hover timeout from a previous updateSlots call
        if (groupNode._hoverTimeout) {
            clearTimeout(groupNode._hoverTimeout);
            groupNode._hoverTimeout = null;
        }
        const HOVER_DELAY = 500;
        const hoverTooltip = getSharedHoverTooltip();
        const isResizeHandleTarget = (target: EventTarget | null): boolean => {
            if (!(target instanceof Element)) return false;
            return target.closest(".slot-resize-handle-left, .slot-resize-handle-right") !== null;
        };

        // Update the slots section to include both drag and resize
        const slotsUpdate = slots.merge(slotsEnter as any)
            .on("mouseover", function (event, d) {
                if (groupNode._hoverTimeout) {
                    clearTimeout(groupNode._hoverTimeout);
                }

                if (groupNode._isResizingSlot) {
                    hideSharedHoverTooltip(hoverTooltip);
                    return;
                }

                if (isResizeHandleTarget(event.target)) {
                    hideSharedHoverTooltip(hoverTooltip);
                } else {
                    showSharedHoverTooltip(hoverTooltip, event, d.slotData.hoverData);
                }

                // Set a new timeout for the hover event
                groupNode._hoverTimeout = setTimeout(() => {
                    if (updateChartProps.onHoverOnSlot) {
                        updateChartProps.onHoverOnSlot(d.slotData.id);
                    }
                }, HOVER_DELAY);
            })
            .on("mouseout", function () {
                // Clear the timeout when mouse leaves
                if (groupNode._hoverTimeout) {
                    clearTimeout(groupNode._hoverTimeout);
                    groupNode._hoverTimeout = null;
                }

                hideSharedHoverTooltip(hoverTooltip);
            })
            .on("mousemove", function (event, d) {
                if (groupNode._isResizingSlot) {
                    hideSharedHoverTooltip(hoverTooltip);
                    return;
                }

                if (isResizeHandleTarget(event.target)) {
                    hideSharedHoverTooltip(hoverTooltip);
                    return;
                }

                showSharedHoverTooltip(hoverTooltip, event, d.slotData.hoverData);
            })
            .on("click", function (event, d) {

                const slotData = data.find(slot => slot.id === d.slotData.id);
                if (!slotData) return;

                if (!updateChartProps.isReadOnly && !d.slotData.readOnly) {
                    const pointerClipboard = JSON.parse(localStorage.getItem("pointerClipboard") || "[]");
                    const multipleSelect = (event.ctrlKey || event.metaKey)
                    if (pointerClipboard.length === 0 || multipleSelect) {
                        addSlotToClipboard(slotData);
                    } else {
                        moveClipboardToTopic(slotData.destinationId);
                    }
                };

                // only add it to the clipboard if the clipboard is empty or the control key is pressed
                openAllocationDetails(d.slotData.id);
            })
            .on("dblclick", function (event, d) {
                if (updateChartProps.onDoubleClickOnSlot) {
                    updateChartProps.onDoubleClickOnSlot(d.slotData.id);
                }
            })
            .on("contextmenu", function (event, d) {
                event.preventDefault();
                if (updateChartProps.onContextClickOnSlot) {
                    updateChartProps.onContextClickOnSlot(d.slotData.id);
                }
            });

        const dragStartLeftRight = (event: d3.D3DragEvent<Element, any, any>, d: SlotDefinition): void => {
            event.sourceEvent.stopPropagation();
            groupNode._isResizingSlot = true;
            if (groupNode._hoverTimeout) {
                clearTimeout(groupNode._hoverTimeout);
                groupNode._hoverTimeout = null;
            }
            hideSharedHoverTooltip(hoverTooltip);
            d.dragStartX = event.x;
            d.originalX = d.x;
            d.originalWidth = d.width;
            d.originalOpenTime = d.slotData.openTime;
            d.originalCloseTime = d.slotData.closeTime;
        }

        const draggingLeft = (event: d3.D3DragEvent<Element, any, any>, d: SlotDefinition): void => {
            if (d.slotData.readOnly) return;
            const dx = d.dragStartX !== undefined ? (event.x - d.dragStartX) : 0;
            d.originalX = d.originalX || d.x;
            d.originalWidth = d.originalWidth || d.width;
            d.newX = Math.min(d.originalX + d.originalWidth - 10, d.originalX + dx); // minimum width
            d.newWidth = d.originalWidth - (d.newX - d.originalX);
            const newOpenTime = xScale.invert(d.newX);

            const slot = d3.select<SVGGElement, SlotDefinition>(d.element.parentNode);
            slot.select('.slot-box')
                .attr('d', d => createSlotPath({ ...d.slotData, openTime: newOpenTime }, startDateTime, endDateTime, d.y, d.height, xScale))
                .attr('transform', `translate(${dx},0)`);

            slot.select('.slot-resize-handle-left')
                .attr('x', d.newX - 8);
        }

        const draggingRight = (event: d3.D3DragEvent<Element, any, any>, d: SlotDefinition): void => {
            if (d.slotData.readOnly) return;
            const dx = d.dragStartX !== undefined ? (event.x - d.dragStartX) : 0;
            d.originalWidth = d.originalWidth || d.width;
            d.newX = d.originalX;
            d.newWidth = Math.max(10, Math.min(width - d.x, d.originalWidth + dx));
            const endX = d.x + d.newWidth;
            const newCloseTime = xScale.invert(endX);

            const slot = d3.select<SVGGElement, SlotDefinition>(d.element.parentNode);
            slot.select('.slot-box')
                .attr('d', d => createSlotPath({ ...d.slotData, closeTime: newCloseTime }, startDateTime, endDateTime, d.y, d.height, xScale))
            slot.select('.slot-resize-handle-right')
                .attr('x', d.x + d.newWidth - 8);
        }

        const dragLeftRightEnd = (event: d3.D3DragEvent<Element, any, any>, d: SlotDefinition): void => {
            groupNode._isResizingSlot = false;
            hideSharedHoverTooltip(hoverTooltip);
            if (d.slotData.readOnly) return;
            const slot = d3.select<SVGGElement, SlotDefinition>(d.element.parentNode);
            slot.select('.slot-box').attr('transform', `translate(0,0)`);
            d.newX = d.newX || d.x;
            d.newWidth = d.newWidth || d.width;
            d.x = d.newX;
            d.width = d.newWidth;
            d.slotData.openTime = xScale.invert(d.newX);
            d.slotData.closeTime = xScale.invert(d.newX + d.newWidth);
            let slotData = data.find(slot => slot.id === d.slotData.id);

            if (!slotData) return;
            slotData.openTime = d.slotData.openTime;
            slotData.closeTime = d.slotData.closeTime;
            onItemChanged({ id: slotData.id, openTime: slotData.openTime, closeTime: slotData.closeTime });
            updateChart({ ...updateChartProps, processedData: [], animationDuration: 0 })
        }
        const dragResizeHandleLeft = d3.drag<Element, SlotDefinition, any>()
            .on('start', function (event, d) { d.element = this; dragStartLeftRight(event, d) })
            .on('drag', function (event, d) { d.element = this; draggingLeft(event, d) })
            .on('end', function (event, d) { d.element = this; dragLeftRightEnd(event, d) });

        const dragResizeHandleRight = d3.drag<Element, SlotDefinition, any>()
            .on('start', function (event, d) { d.element = this; dragStartLeftRight(event, d) })
            .on('drag', function (event, d) { d.element = this; draggingRight(event, d) })
            .on('end', function (event, d) { d.element = this; dragLeftRightEnd(event, d) });

        slotsUpdate.transition()
            .duration(animationDuration)
            .attr("opacity", 1)
            .attr("transform", d => `translate(${d.x},${d.y})`);

        slotsUpdate.select(".slot-box")
            .transition()
            .duration(animationDuration)
            .attr("d", d => createSlotPath(d.slotData, startDateTime, endDateTime, d.y, d.height, xScale))
            .attr("fill", d => d.fill)
            .attr("stroke-opacity", 1)
            .attr("fill-opacity", d => d.opacity)
            .attr("class", d => `slot-box ${d.isCopied ? "copied" : ""}`)

        slotsUpdate.select(".slot-text")
            .transition()
            .duration(animationDuration)
            .attr("display", d => d.isCollapsed ? "none" : null)
            .attr("x", 0)
            .attr("y", 0)
            .attr("width", d => d.width)
            .attr("height", yScale.bandwidth());
        slotsUpdate.select(".slot-text > div")
            .html(d => d.text)
            .style("color", "white");

        slotsUpdate.select(".slot-resize-handle-left")
            .style("display", d => (d.isStartInView && !d.slotData.readOnly && !updateChartProps.isReadOnly) ? null : "none")
            .attr("x", d => -4)
            .attr("y", d => 0)
            .attr("height", d => d.height)
            .style("opacity", 0)
            .call(updateChartProps.isReadOnly ? function () { } : dragResizeHandleLeft as any);

        slotsUpdate.select(".slot-resize-handle-right")
            .style("display", d => (d.isEndInView && !d.slotData.readOnly && !updateChartProps.isReadOnly) ? null : "none")
            .attr("x", d => 0 + d.width - 4)
            .attr("y", d => 0)
            .attr("height", d => d.height)
            .style("opacity", 0)
            .call(updateChartProps.isReadOnly ? function () { } : dragResizeHandleRight as any);

        // Remove old slots
        slots.exit().remove();
    }

    const applySuggestion = (slotId: string) => {
        if (!slotId) return;
        const slotData = data.find(slot => slot.id === slotId);
        const suggestion = updateChartProps.suggestions.find(s => s.id === slotId);
        if (!slotData || !suggestion) return;
        slotData.destinationId = suggestion.alternativeDestination;
        updateChart({...updateChartProps, processedData: []})
        onItemChanged({ id: slotData.id, [settings.groupBy]: suggestion.alternativeDestination }, true);
    }

    // Lazy rendering: only render vertically visible slots for better performance
    const lazyRenderingEnabled = updateChartProps.lazyRendering === true;

    groupMap.forEach((group, groupId) => {
        const defs = groupDefsMap.get(groupId)!;
        const yScale = yScaleMap.get(groupId)!;
        const container = containerMap.get(groupId);

        if (lazyRenderingEnabled && container) {
            // Filter items to only include those within the visible scroll viewport
            const filterVisible = <T extends { y: number }>(
                items: T[],
                scrollTop: number,
                viewHeight: number,
                buffer: number,
                getHeight: (item: T) => number
            ): T[] => {
                return items.filter(item => {
                    const itemBottom = item.y + getHeight(item);
                    return itemBottom > scrollTop - buffer && item.y < scrollTop + viewHeight + buffer;
                });
            };

            const renderVisibleSlots = (anim: number = 0) => {
                const scrollTop = container.scrollTop;
                const viewHeight = container.clientHeight;
                const buffer = 500; // 500px buffer above and below viewport

                const visibleSlots = filterVisible(
                    defs.slotDefinition, scrollTop, viewHeight, buffer,
                    (s) => s.height
                );
                const visibleDepartures = defs.departureMarkerDefinition.filter(d => {
                    const top = d.lineY;
                    const bottom = d.lineY + d.lineHeight;
                    return bottom > scrollTop - buffer && top < scrollTop + viewHeight + buffer;
                });
                const visibleSuggestions = filterVisible(
                    defs.suggestionDefinition, scrollTop, viewHeight, buffer,
                    () => 20
                );

                updateSlots(group, visibleSlots, yScale);
                updateDepartureMarker(group, visibleDepartures, anim, textSize);
                updateSuggestionButtons(group, visibleSuggestions, anim, textSize, applySuggestion);
            };

            // Initial render of visible slots
            renderVisibleSlots(animationDuration);

            // Set up throttled scroll listener using requestAnimationFrame
            type ContainerWithLazy = HTMLElement & {
                _lazyScrollHandler?: EventListener;
                _lazyRafId?: number;
            };
            const containerNode = container as ContainerWithLazy;
            if (containerNode._lazyScrollHandler) {
                container.removeEventListener('scroll', containerNode._lazyScrollHandler);
            }
            const scrollHandler = () => {
                if (containerNode._lazyRafId) cancelAnimationFrame(containerNode._lazyRafId);
                containerNode._lazyRafId = requestAnimationFrame(() => renderVisibleSlots(0));
            };
            containerNode._lazyScrollHandler = scrollHandler;
            container.addEventListener('scroll', scrollHandler, { passive: true });
        } else {
            // Standard rendering: render all slots at once
            updateSlots(group, defs.slotDefinition, yScale);
            updateDepartureMarker(group, defs.departureMarkerDefinition, animationDuration, textSize);
            updateSuggestionButtons(group, defs.suggestionDefinition, animationDuration, textSize, applySuggestion);

            // Clean up any existing lazy scroll listeners
            if (container) {
                type ContainerWithLazy = HTMLElement & { _lazyScrollHandler?: EventListener };
                const containerNode = container as ContainerWithLazy;
                if (containerNode._lazyScrollHandler) {
                    container.removeEventListener('scroll', containerNode._lazyScrollHandler);
                    containerNode._lazyScrollHandler = undefined;
                }
            }
        }

        setupPanAndZoom(
            group,
            xScale,
            width,
            margin,
            startDateTime,
            endDateTime,
            changeStartAndEndDateTime,
            changeStartAndEndDateTimeWithoutFetch
        );
        updateWeekdays(group, startDateTime, endDateTime, xScale, yScale.height, settings);
    });
    (() => {
        const firstGroup = groupMap.get(groupMap.keys().next().value!);
        if (!firstGroup) return;
    })()
}
