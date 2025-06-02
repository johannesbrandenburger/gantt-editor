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

    const departureMarker = chartGroup
        .selectAll<SVGRectElement, DepartureMarker>(".departure-marker")
        .data(departureMarkerDefinition.filter(d => !d.lineVisible), d => `departure-marker-${d.id}`);
    departureMarker.enter()
        .append("rect")
        .attr("class", "departure-marker")
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
        .merge(departureMarker) // Merge enter + update selections
        .transition()
        .duration(ANIMATION_DURATION)
        .attr("fill", d => d.color)
        .attr("x", d => d.x1)
        .attr("width", d => d.x2 - d.x1)
        .attr("y", d => d.y)
        .attr("height", d => d.height)
        .attr("opacity", 0.5);
    departureMarker.exit()
        .transition()
        .duration(ANIMATION_DURATION)
        .attr("opacity", 0)
        .remove();

    const departureMarkerEndline = chartGroup
        .selectAll<SVGRectElement, DepartureMarker>(".departure-marker-endline")
        .data(departureMarkerDefinition.filter(d => d.lineVisible), d => `departure-marker-endline-${d.id}`);

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
        .merge(departureMarkerEndline) // Merge enter + update selections
        .transition()
        .attr("display", d => (d.lineVisible ? "block" : "none"))
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

}