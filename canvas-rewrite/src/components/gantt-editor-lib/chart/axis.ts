import * as d3 from "d3";
import type { GanttEditorXAxisOptions } from "./types";

export function updateAxis(
    xAxisGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
    animationDuration: number,
    xScale: d3.ScaleTime<number, number, never>,
    fullChartHeight: number,
    clearClipboard: () => void,
    xAxisOptions?: GanttEditorXAxisOptions,
) {

    const timeFormatter = (domainValue: Date | d3.NumberValue): string => {
        if (domainValue instanceof Date) {
            return d3.timeFormat('%H:%M')(domainValue);
        }
        return '';
    };

    const dateFormatter = (domainValue: Date | d3.NumberValue): string => {
        if (domainValue instanceof Date) {
            return d3.timeFormat('%d.%m.')(domainValue);
        }
        return '';
    };

    let xAxisUpperTickFormat: (domainValue: Date | d3.NumberValue) => string = xAxisOptions?.upper?.tickFormat || dateFormatter;
    let xAxisLowerTickFormat: (domainValue: Date | d3.NumberValue) => string = xAxisOptions?.lower?.tickFormat || timeFormatter;

    const dateAxisSelection = xAxisGroup.select<SVGGElement>('.x-axis-date');
    const dateAxis = d3.axisTop(xScale).tickFormat(xAxisUpperTickFormat)
    if (xAxisOptions?.upper?.ticks) {
        dateAxis.ticks(xAxisOptions?.upper?.ticks);
    } else {
        dateAxis.ticks(d3.timeDay.every(1));
    }
    dateAxisSelection.call(dateAxis);

    const timeAxisSelection = xAxisGroup.select<SVGGElement>('.x-axis');
    const timeAxis = d3.axisTop(xScale).tickFormat(xAxisLowerTickFormat);
    if (xAxisOptions?.lower?.ticks) {
        timeAxis.ticks(xAxisOptions?.lower?.ticks);
    } else {
        // nothing: default ticks will be used
    }
    timeAxisSelection.call(timeAxis);

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