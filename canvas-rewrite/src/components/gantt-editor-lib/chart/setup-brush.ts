import * as d3 from 'd3';

export const setupBrush = (
    chartGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
    onSelectedSomething: (selection: [[number, number], [number, number]]) => void,
    width: number,
    height: number
) => {

    // Remove any existing brush group to avoid stacking
    chartGroup.select('.brush-group').remove();
    chartGroup.select('.brush-capture-overlay').remove();

    // We implement a custom brush that only activates when Meta (Cmd) or Ctrl
    // is held during mousedown. This avoids z-order conflicts with slot elements
    // since we don't need to raise/lower a D3 brush overlay.

    // Add an invisible capture overlay as the FIRST child of the chart group.
    // This ensures mousedown events within the chart area reach our handler,
    // even in regions where no other elements exist (empty space).
    // It is lowered below everything else so it doesn't intercept normal clicks.
    const captureOverlay = chartGroup.insert("rect", ":first-child")
        .attr("class", "brush-capture-overlay")
        .attr("x", 0)
        .attr("y", 0)
        .attr("width", width)
        .attr("height", height)
        .attr("fill", "transparent")
        .style("pointer-events", "all");

    // Create a group for the selection rectangle visual
    const brushGroup = chartGroup.append("g")
        .attr("class", "brush-group") as d3.Selection<SVGGElement, unknown, null, undefined>;

    // Keep the brush group lowered so it doesn't intercept any events
    brushGroup.lower();

    // Selection rectangle (hidden by default)
    const selectionRect = brushGroup.append("rect")
        .attr("class", "brush-selection")
        .attr("fill", "#69b3a2")
        .attr("fill-opacity", 0.3)
        .attr("stroke", "#69b3a2")
        .attr("stroke-opacity", 0.8)
        .attr("display", "none")
        .style("pointer-events", "none");

    // Custom brush implementation using mousedown on the chart group
    chartGroup.on("mousedown.customBrush", function (event: MouseEvent) {
        // Only activate brush when Meta or Ctrl is held and it's a left click
        if (!(event.metaKey || event.ctrlKey) || event.button !== 0) return;

        // Don't start brush if the click target is a slot element or resize handle
        const target = event.target as Element;
        if (target.closest('.slot-group') || target.closest('.slot-resize-handle-left') || target.closest('.slot-resize-handle-right')) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        // Get the chart group's coordinate transform
        const svgNode = chartGroup.node()!;
        const ctm = svgNode.getScreenCTM()!;

        // Calculate start position in local SVG coordinates
        const startX = (event.clientX - ctm.e) / ctm.a;
        const startY = (event.clientY - ctm.f) / ctm.d;

        // Clamp to chart bounds
        const clampX = (v: number) => Math.max(0, Math.min(width, v));
        const clampY = (v: number) => Math.max(0, Math.min(height, v));

        const sx = clampX(startX);
        const sy = clampY(startY);

        // Raise the brush group so the selection rectangle renders on top
        brushGroup.raise();

        // Show selection rectangle
        selectionRect
            .attr("display", null)
            .attr("x", sx)
            .attr("y", sy)
            .attr("width", 0)
            .attr("height", 0);

        const onMouseMove = (moveEvent: MouseEvent) => {
            const currentX = clampX((moveEvent.clientX - ctm.e) / ctm.a);
            const currentY = clampY((moveEvent.clientY - ctm.f) / ctm.d);

            const x = Math.min(sx, currentX);
            const y = Math.min(sy, currentY);
            const w = Math.abs(currentX - sx);
            const h = Math.abs(currentY - sy);

            selectionRect
                .attr("x", x)
                .attr("y", y)
                .attr("width", w)
                .attr("height", h);
        };

        const onMouseUp = (upEvent: MouseEvent) => {
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);

            const endX = clampX((upEvent.clientX - ctm.e) / ctm.a);
            const endY = clampY((upEvent.clientY - ctm.f) / ctm.d);

            // Hide the selection rectangle
            selectionRect.attr("display", "none");

            // Lower the brush group again
            brushGroup.lower();

            // Only process if the user actually dragged (not just a click)
            const dx = Math.abs(endX - sx);
            const dy = Math.abs(endY - sy);
            if (dx > 3 || dy > 3) {
                const x0 = Math.min(sx, endX);
                const y0 = Math.min(sy, endY);
                const x1 = Math.max(sx, endX);
                const y1 = Math.max(sy, endY);
                onSelectedSomething([[x0, y0], [x1, y1]]);
            }
        };

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
    });
};
