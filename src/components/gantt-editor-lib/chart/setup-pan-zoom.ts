import * as d3 from 'd3';

export const setupPanAndZoom = (
    chartGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
    xScale: d3.ScaleTime<number, number, never>,
    width: number,
    margin: { top: number; right: number; bottom: number; left: number; },
    unprocessedStartDateTime: Date,
    unprocessedEndDateTime: Date,
    changeStartAndEndDateTime: (startDateTime: Date, endDateTime: Date) => void,
    changeStartAndEndDateTimeWithoutFetch: (startDateTime: Date, endDateTime: Date) => void,

) => {
    let startPanX: number;
    let originalStartDateTime: Date;
    let originalEndDateTime: Date;
    let isPanning = false;

    // Prevent context menu from showing up during panning
    chartGroup.on('contextmenu', (event) => {
        event.preventDefault();
    });

    // Add zooming with mouse wheel + shift key
    chartGroup.on('wheel', (event) => {

        if (!event.shiftKey) return;

        event.preventDefault();

        // Get mouse position relative to chart
        const mouseX = event.clientX - margin.left;

        // Calculate time at mouse position with unprocessedEndDateTime and unprocessedStartDateTime
        const timeExtent = [unprocessedStartDateTime, unprocessedEndDateTime];

        const unprocessedScale = d3.scaleTime()
            .domain(timeExtent)
            .range([0, width]);
        const mouseTime = unprocessedScale.invert(mouseX);

        // Calculate zoom factor based on wheel delta
        const zoomFactor = event.deltaY > 0 ? 1.1 : 0.9;

        // Calculate new time range while keeping mouse position fixed
        const timeRange = unprocessedEndDateTime.getTime() - unprocessedStartDateTime.getTime();
        const mouseOffset = (mouseTime.getTime() - unprocessedStartDateTime.getTime()) / timeRange;

        const newTimeRange = timeRange * zoomFactor;
        const newStartDateTime = new Date(mouseTime.getTime() - (newTimeRange * mouseOffset));
        const newEndDateTime = new Date(newStartDateTime.getTime() + newTimeRange);

        // Update chart with new time range
        changeStartAndEndDateTime(newStartDateTime, newEndDateTime);
    });

    chartGroup.on('mousedown', (event: MouseEvent) => {
        // Only handle right mouse button or if shift key is pressed
        if (event.button === 2 || event.shiftKey) {
            event.preventDefault();
            isPanning = true;
            startPanX = event.clientX;
            originalStartDateTime = unprocessedStartDateTime;
            originalEndDateTime = unprocessedEndDateTime;

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
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);

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

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        }
    });
};