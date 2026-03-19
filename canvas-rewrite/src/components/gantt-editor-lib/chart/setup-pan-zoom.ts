import * as d3 from 'd3';

export const setupPanAndZoom = (
    chartGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
    xScale: d3.ScaleTime<number, number, never>,
    width: number,
    margin: { top: number; right: number; bottom: number; left: number; },
    unprocessedStartDateTimeParam: Date,
    unprocessedEndDateTimeParam: Date,
    changeStartAndEndDateTime: (startDateTime: Date, endDateTime: Date) => void,
    changeStartAndEndDateTimeWithoutFetch: (startDateTime: Date, endDateTime: Date) => void,
) => {
    let startPanX: number;
    let originalStartDateTime: Date;
    let originalEndDateTime: Date;
    let isPanning = false;

    // Store current dates on the DOM node so the closure always reads the latest values
    const node = chartGroup.node() as SVGGElement & { _panZoomDates?: { start: Date; end: Date } };
    node._panZoomDates = { start: unprocessedStartDateTimeParam, end: unprocessedEndDateTimeParam };
    const getDates = () => node._panZoomDates!;
    // NOTE: Do NOT capture getDates() into local variables here — the values
    // would become stale for later event-handler closures.  Always call
    // getDates() at the point of use so we read the latest dates stored on the
    // DOM node.

    
    // Store timeout and scroll data on the chartGroup to persist across renders
    type timeOut = ReturnType<typeof setTimeout>;
    const chartGroupNode = chartGroup.node() as SVGGElement & { _horizontalScrollData?: { timeout: timeOut | null; lastDates: { start: Date; end: Date } | null } };
    if (!chartGroupNode._horizontalScrollData) {
        chartGroupNode._horizontalScrollData = {
            timeout: null,
            lastDates: null
        };
    }
    const scrollData = chartGroupNode._horizontalScrollData;

    // Prevent context menu from showing up during panning
    chartGroup.on('contextmenu', (event) => {
        event.preventDefault();
    });

    // Add zooming with mouse wheel + shift key
    chartGroup.on('wheel', (event: WheelEvent) => {
        
        // horizontal scrolling through the timeline
        if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
            event.preventDefault();
            event.stopPropagation();
            originalStartDateTime = getDates().start;
            originalEndDateTime = getDates().end;
            const newStartDateTime = new Date(originalStartDateTime.getTime() + event.deltaX * 50000);
            const newEndDateTime = new Date(originalEndDateTime.getTime() + event.deltaX * 50000);
            
            // Store the new dates for the end listener
            scrollData.lastDates = { start: newStartDateTime, end: newEndDateTime };
            
            // Clear any existing timeout
            if (scrollData.timeout) {
                clearTimeout(scrollData.timeout);
            }
            
            // Update immediately without fetch
            changeStartAndEndDateTimeWithoutFetch(newStartDateTime, newEndDateTime);
            
            // Set a timeout to call the version with fetch when scrolling ends
            scrollData.timeout = setTimeout(() => {
                if (scrollData.lastDates) {
                    changeStartAndEndDateTime(scrollData.lastDates.start, scrollData.lastDates.end);
                    scrollData.lastDates = null;
                }
                scrollData.timeout = null;
            }, 150); // 150ms delay after scrolling stops
            
            return;
        }

        // Detect trackpad vs mouse wheel
        // Trackpads typically have smaller deltaY values and support fractional values
        const isTrackpad = Math.abs(event.deltaY) < 100 && event.deltaY % 1 !== 0;
        
        // Allow zooming with:
        // - Trackpad pinch gesture (browsers set ctrlKey=true for pinch-to-zoom)
        // - Mouse wheel + shift key (existing behavior)
        // Note: Regular trackpad vertical scrolling should NOT trigger zoom,
        // it should bubble up to allow the container to scroll through slots.
        const shouldZoom = (isTrackpad && event.ctrlKey) || (!isTrackpad && event.shiftKey);
        
        if (!shouldZoom) return;

        event.preventDefault();

        // Get mouse position relative to chart
        const mouseX = event.clientX - margin.left;

        // Calculate time at mouse position with current dates (read from stored ref to avoid stale closure)
        const currentDates = getDates();
        const timeExtent = [currentDates.start, currentDates.end];

        const unprocessedScale = d3.scaleTime()
            .domain(timeExtent)
            .range([0, width]);
        const mouseTime = unprocessedScale.invert(mouseX);

        // Calculate zoom factor based on wheel delta
        const zoomFactor = event.deltaY > 0 ? 1.1 : 0.9;

        // Calculate new time range while keeping mouse position fixed
        const timeRange = currentDates.end.getTime() - currentDates.start.getTime();
        const mouseOffset = (mouseTime.getTime() - currentDates.start.getTime()) / timeRange;

        const newTimeRange = timeRange * zoomFactor;
        const maxTimeRange = 4 * 24 * 60 * 60 * 1000;
        const constrainedTimeRange = Math.min(newTimeRange, maxTimeRange);
        const newStartDateTime = new Date(mouseTime.getTime() - (constrainedTimeRange * mouseOffset));
        const newEndDateTime = new Date(newStartDateTime.getTime() + constrainedTimeRange);

        // Update chart with new time range
        changeStartAndEndDateTime(newStartDateTime, newEndDateTime);
    });

    // Store active pan listeners on the DOM node so they can be cleaned up on
    // component unmount even if the mouseup never fires.
    type PanNode = SVGGElement & {
        _activePanMove?: (e: MouseEvent) => void;
        _activePanUp?: (e: MouseEvent) => void;
        _isPanning?: boolean;
    };
    const panNode = node as PanNode;

    // Clean up any leftover listeners from a previous setupPanAndZoom call,
    // but only if no pan is currently in progress. During a pan, the mousemove
    // handler triggers re-renders which call setupPanAndZoom again — we must
    // preserve the active listeners so mouseup can fire.
    if (!panNode._isPanning) {
        if (panNode._activePanMove) {
            document.removeEventListener('mousemove', panNode._activePanMove);
            panNode._activePanMove = undefined;
        }
        if (panNode._activePanUp) {
            document.removeEventListener('mouseup', panNode._activePanUp);
            panNode._activePanUp = undefined;
        }
    }

    chartGroup.on('mousedown', (event: MouseEvent) => {
        // Only handle right mouse button or if shift key is pressed
        if (event.button === 2 || event.shiftKey) {
            event.preventDefault();
            isPanning = true;
            panNode._isPanning = true;
            startPanX = event.clientX;
            originalStartDateTime = getDates().start;
            originalEndDateTime = getDates().end;

            // Add temporary event listeners for mousemove and mouseup
            const onMouseMove = (event: MouseEvent) => {
                if (!isPanning) return;

                const dx = event.clientX - startPanX;

                const unclampedScale = d3
                    .scaleTime()
                    .domain(xScale.domain())
                    .range(xScale.range())
                    .clamp(false);

                const timeShift =
                    unclampedScale.invert(dx).getTime() -
                    unclampedScale.invert(0).getTime();

                const newStartDateTime = new Date(originalStartDateTime.getTime() - timeShift);
                const newEndDateTime = new Date(originalEndDateTime.getTime() - timeShift);

                changeStartAndEndDateTimeWithoutFetch(newStartDateTime, newEndDateTime);
            };


            const onMouseUp = (event: MouseEvent) => {
                if (event.button === 2 || event.shiftKey) {
                    isPanning = false;
                    panNode._isPanning = false;
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                    panNode._activePanMove = undefined;
                    panNode._activePanUp = undefined;

                    // Only trigger the date change callback if we actually panned
                    if (event.clientX !== startPanX) {
                        const dx = event.clientX - startPanX;
                        const unclampedScale = d3
                            .scaleTime()
                            .domain(xScale.domain())
                            .range(xScale.range())
                            .clamp(false);

                        const timeShift = unclampedScale.invert(dx).getTime() - unclampedScale.invert(0).getTime();
                        const finalStartDateTime = new Date(originalStartDateTime.getTime() - timeShift);
                        const finalEndDateTime = new Date(originalEndDateTime.getTime() - timeShift);
                        changeStartAndEndDateTime(finalStartDateTime, finalEndDateTime);
                    }
                }
            };

            // Store references so they can be cleaned up on unmount
            panNode._activePanMove = onMouseMove;
            panNode._activePanUp = onMouseUp;
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        }
    });
};