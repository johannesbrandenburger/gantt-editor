import * as d3 from 'd3';

export const setupBrush = (
    chartGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
    onSelectedSomething: (selection: [[number, number], [number, number]]) => void,
    width: number,
    height: number
) => {

    // Add brush container for the entire chart area
    let brushGroup = chartGroup.select('.brush-group') as d3.Selection<SVGGElement, unknown, null, undefined>;
    if (brushGroup.empty()) {
        brushGroup = chartGroup.append("g")
            .attr("class", "brush-group") as d3.Selection<SVGGElement, unknown, null, undefined>;
    }

    // Create brush for the entire chart area
    const brush = d3.brush()
        .extent([[0, 0], [width, height]])
        .keyModifiers(true)
        .on("end", brushended);

    // Apply brush to group
    brushGroup.call(brush);

    function brushended(event: d3.D3BrushEvent<any>) {
        if (!event.selection) return; // Ignore empty selections

        // Extract just the x-coordinates from the brush selection
        const selection = event.selection as [[number, number], [number, number]];

        // Clear the brush
        brushGroup.call(brush.move, null);

        onSelectedSomething(selection);
    }

    // Style brush overlay and selection area
    chartGroup.selectAll(".selection")
        .attr("fill", "#69b3a2")
        .attr("fill-opacity", 0.2)
        .attr("stroke", "#69b3a2")
        .attr("stroke-opacity", 0.8);

    chartGroup.selectAll(".overlay")
        .style("cursor", "crosshair");

    // Style brush overlay and handles
    chartGroup.selectAll(".selection")
        .attr("fill", "#69b3a2")
        .attr("fill-opacity", 0.3)
        .attr("stroke", "#69b3a2");

};