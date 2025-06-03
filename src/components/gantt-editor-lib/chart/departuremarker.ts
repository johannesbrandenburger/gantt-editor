import * as d3 from "d3";
import type { DepartureMarker } from "./types";

export const updateDepartureMarker = (
    chartGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
    departureMarkerDefinition: DepartureMarker[],
    ANIMATION_DURATION: number,
    textSize: (text: string) => { width: number; height: number; }
) => {

    let tooltip = d3.select("body").select<HTMLDivElement>(".departure-marker-tooltip");
    if (tooltip.empty()) {
        tooltip = d3.select("body")
            .append("div")
            .attr("class", "departure-marker-tooltip")
            .style("position", "absolute")
            .style("visibility", "hidden")
            .style("background-color", "white")
            .style("border", "1px solid #ddd")
            .style("border-radius", "4px")
            .style("padding", "8px")
            .style("pointer-events", "none")
            .style("z-index", "1000")
            .style("color", "black")
    }

    const departureMarkerEndline = chartGroup
        .selectAll<SVGRectElement, DepartureMarker>(".departure-marker-endline")
        .data(departureMarkerDefinition, d => `departure-marker-endline-${d.id}`);

    departureMarkerEndline.enter()
        .append("rect")
        .attr("class", "departure-marker-endline")
        .attr("fill", "black")
        .attr("opacity", 0)
        .on("mousemove", (event, d) => {
            tooltip
                .html(d.info)
                .style("visibility", "visible")
                .style("left", `${event.pageX + 10}px`)
                .style("top", `${event.pageY - 50}px`);
        })
        .on("mouseout", (event, d) => {
            tooltip.style("visibility", "hidden");
        })
        .attr("x", d => d.x1)
        .attr("width", 2)
        .attr("y", d => d.lineY)
        .attr("height", d => d.lineHeight)
        .merge(departureMarkerEndline)
        .transition()
        .duration(ANIMATION_DURATION)
        .attr("x", d => d.x2-1)
        .attr("width", d => 2)
        .attr("y", d => d.lineY)
        .attr("height", d => d.lineHeight)
        .attr("opacity", 1);
    departureMarkerEndline.exit()
        .transition()
        .duration(ANIMATION_DURATION)
        .attr("opacity", 0)
        .remove();

    const departureMarkerDashedLine = chartGroup
        .selectAll<SVGLineElement, DepartureMarker>(".departure-marker-dashed-line")
        .data(departureMarkerDefinition.filter(d => !d.lineVisible), d => `departure-marker-dashed-line-${d.id}`);

    departureMarkerDashedLine.enter()
        .append("line")
        .attr("class", "departure-marker-dashed-line")
        .attr("stroke", "gray")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "3,3")
        .attr("opacity", 0)
        .on("mousemove", (event, d) => {
            tooltip
                .html(d.info)
                .style("visibility", "visible")
                .style("left", `${event.pageX + 10}px`)
                .style("top", `${event.pageY - 50}px`);
        })
        .on("mouseout", (event, d) => {
            tooltip.style("visibility", "hidden");
        })
        .attr("x1", d => d.x1)
        .attr("x2", d => d.x1)
        .attr("y1", d => d.lineY + d.lineHeight / 2)
        .attr("y2", d => d.lineY + d.lineHeight / 2)
        .merge(departureMarkerDashedLine)
        .transition()
        .duration(ANIMATION_DURATION)
        .attr("x1", d => d.x1)
        .attr("x2", d => d.x2)
        .attr("y1", d => d.lineY + d.lineHeight / 2)
        .attr("y2", d => d.lineY + d.lineHeight / 2)
        .attr("opacity", 1);
    departureMarkerDashedLine.exit()
        .transition()
        .duration(ANIMATION_DURATION)
        .attr("opacity", 0)
        .remove();

    const departureMarkerHoverArea = chartGroup
        .selectAll<SVGRectElement, DepartureMarker>(".departure-marker-hover-area")
        .data(departureMarkerDefinition, d => `departure-marker-hover-area-${d.id}`);

    departureMarkerHoverArea.enter()
        .append("rect")
        .attr("class", "departure-marker-hover-area")
        .attr("fill", "transparent")
        .attr("opacity", 0)
        .on("mousemove", (event, d) => {
            tooltip
                .html(d.info)
                .style("visibility", "visible")
                .style("left", `${event.pageX + 10}px`)
                .style("top", `${event.pageY - 50}px`);
        })
        .on("mouseout", (event, d) => {
            tooltip.style("visibility", "hidden");
        })
        .on("click", function(event) {
            // Allow click events to pass through by temporarily disabling pointer events
            // and re-dispatching the event to the element below
            const element = this as SVGRectElement;
            element.style.pointerEvents = 'none';
            const elementBelow = document.elementFromPoint(event.clientX, event.clientY);
            element.style.pointerEvents = '';
            
            if (elementBelow && elementBelow !== element) {
                elementBelow.dispatchEvent(new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    clientX: event.clientX,
                    clientY: event.clientY
                }));
            }
        })
        .merge(departureMarkerHoverArea)
        .transition()
        .duration(ANIMATION_DURATION)
        .attr("x", d => d.x2 < d.x1 ? d.x2 + 4 : d.x1 + 4)
        .attr("width", d => d.x2 < d.x1 ? d.x1 - d.x2 - 8 : d.x2 - d.x1) // leave a little space for the resize handle
        .attr("y", d => d.lineY)
        .attr("height", d => d.lineHeight)
        .attr("opacity", 1);
    departureMarkerHoverArea.exit()
        .transition()
        .duration(ANIMATION_DURATION)
        .attr("opacity", 0)
        .remove();

}