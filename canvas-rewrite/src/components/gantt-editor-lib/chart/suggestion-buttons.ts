import * as d3 from "d3";
import type { SuggestionDefinition } from "./types";

export const updateSuggestionButtons = (
    chartGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
    suggestionDefinition: SuggestionDefinition[],
    ANIMATION_DURATION: number,
    textSize: (text: string) => { width: number; height: number; },
    applySuggestion: (slotId: string) => void,
) => {

    let tooltip = d3.select<HTMLDivElement, unknown>("body div.suggestion-tooltip");
    if (tooltip.empty()) {
        tooltip = d3.select("body")
            .append("div")
            .attr("class", "suggestion-tooltip")
            .style("position", "absolute")
            .style("max-width", "200px")
            .style("visibility", "hidden")
            .style("background-color", "rgba(255, 255, 255, 0.9)") // Slightly transparent white
            .style("border", "1px solid #ccc")
            .style("border-radius", "4px")
            .style("padding", "8px")
            .style("font-size", "14px")
            .style("color", "#333")
            .style("box-shadow", "0 2px 5px rgba(0,0,0,0.2)")
            .style("pointer-events", "none")
            .style("z-index", "10");
    }

    const buttons = chartGroup
        .selectAll<SVGTextElement, SuggestionDefinition>(".suggestion-button")
        .data(suggestionDefinition, d => d.slotId);

    const buttonsEnter = buttons.enter()
        .append("text")
        .attr("class", "suggestion-button")
        .attr("opacity", 0)
        .attr("x", d => d.x)
        .attr("y", d => d.y + 10)
        .attr("font-size", "18px")
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .style("cursor", "pointer")
        .style("fill", "#f0ad4e")
        .text("💡");

    // Rebind event handlers on the merged selection (enter + update) so that
    // reused elements always use the latest applySuggestion closure and data.
    buttons.merge(buttonsEnter)
        .on("click", (event, d) => {
            event.stopPropagation();
            tooltip.style("visibility", "hidden");
            applySuggestion(d.slotId);
        })
        .on("mouseover", (event, d) => {
            tooltip
                .html(d.text)
                .style("visibility", "visible");
            // Make the icon slightly larger on hover
            d3.select(event.currentTarget).transition().duration(100).attr("font-size", "30px");
        })
        .on("mousemove", (event, d) => {
            tooltip
                .style("left", `${event.pageX - tooltip.node()!.getBoundingClientRect().width - 15}px`)
                .style("top", `${event.pageY - 15}px`);
        })
        .on("mouseout", (event, d) => {
            tooltip.style("visibility", "hidden");
            d3.select(event.currentTarget).transition().duration(100).attr("font-size", "18px");
        })
        .transition()
        .duration(ANIMATION_DURATION)
        .attr("opacity", 1)
        .attr("x", d => d.x)
        .attr("y", d => d.y + 10);

    buttons.exit()
        .transition()
        .duration(ANIMATION_DURATION)
        .attr("opacity", 0) // Fade out
        .remove();
}
