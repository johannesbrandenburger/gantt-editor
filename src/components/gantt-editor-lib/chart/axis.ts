import * as d3 from "d3";

export function updateAxis(
    xAxisGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
    animationDuration: number,
    xScale: d3.ScaleTime<number, number, never>,
    fullChartHeight: number,
    clearClipboard: () => void,
) {
    // Update x-axis and gridlines on x-axis SVG
    xAxisGroup.select('.x-axis')
        .transition()
        .duration(animationDuration)
        .call(d3.axisTop(xScale)
            .tickFormat(d3.timeFormat('%H:%M') as any) as any);

    xAxisGroup.select('.x-axis-date')
        .transition()
        .duration(animationDuration)
        .call(d3.axisTop(xScale)
            .ticks(d3.timeDay.every(1))
            .tickFormat(d3.timeFormat('%d.%m.') as any) as any)

    // not show the domain line
    xAxisGroup.select('.x-axis-date')
        .selectAll('path')
        .attr('stroke', 'none')
    xAxisGroup.select('.x-axis-date')
        .selectAll('line')
        .attr('stroke', 'none');
    xAxisGroup.select('.x-axis-date')
        .selectAll('text')
        .attr('transform', 'translate(0, 6)');

    const clipboard = JSON.parse(localStorage.getItem("pointerClipboard") || "[]");
    if (clipboard.length > 0) {

        let clearClipboardButton = xAxisGroup.select<SVGGElement>('.clear-clipboard-button');
        if (clearClipboardButton.empty()) {
            clearClipboardButton = xAxisGroup.append("g").attr("class", "clear-clipboard-button")
                .attr("transform", `translate(-190,-30)`)
                .attr("style", "cursor: pointer;")
                .attr("pointer-events", "all")

            clearClipboardButton.append("rect")
                .attr("width", 100)
                .attr("height", 30)
                .attr("rx", 1)
                .attr("ry", 1)
                .attr("fill", "#f0f0f0")
                .on("click", function (event, d) {
                    clearClipboard();
                })

            clearClipboardButton.append("text")
                .attr("fill", "black")
                .text("Clear Clipboard")
                .attr("x", 50)
                .attr("y", 15)
                .attr("text-anchor", "middle")
                .attr("dominant-baseline", "middle")
                .attr("font-size", "12px")
                .attr("font-weight", "bold")

            clearClipboardButton.on("click", () => {
                clearClipboard();
            })
            clearClipboardButton.on("mouseover", () => {
                clearClipboardButton.select("rect").attr("fill", "#e0e0e0");
            });
            clearClipboardButton.on("mouseout", () => {
                clearClipboardButton.select("rect").attr("fill", "#f0f0f0");
            });

            // clear clipboard on ESC key press
            d3.select(document).on("keydown.clearClipboard", (event) => {
                if (event.key === "Escape" || event.keyCode === 27) {
                    clearClipboard();
                }
            });
        }
    } else {
        xAxisGroup.select<SVGGElement>('.clear-clipboard-button').remove();
        // Remove ESC key listener when clipboard is empty
        d3.select(document).on("keydown.clearClipboard", null);
    }

}