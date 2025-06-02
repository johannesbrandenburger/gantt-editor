
import * as d3 from "d3";
import type { Settings } from "./types";

export function updateWeekdays(
    chartGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
    startDateTime: Date,
    endDateTime: Date,
    xScale: d3.ScaleTime<number, number, never>,
    height: number,
    settings: Settings
) {

    // Add weekday overlay if settings.overlayWeeks > 0 or timeframe is < 2 weeks
    const showWeekdayOverlay = settings.overlayWeeks > 0 || (endDateTime.getTime() - startDateTime.getTime()) < 1000 * 60 * 60 * 24 * 14;

    // Remove existing weekday elements
    chartGroup.selectAll('.weekday-line').remove();
    chartGroup.selectAll('.weekday-label').remove();

    // Generate dates for the weekday lines
    const days = d3.timeDay.range(startDateTime, endDateTime);
    const weekdayLines = showWeekdayOverlay ? days.filter(d => d.getHours() === 0) : [];

    // Add weekday lines
    chartGroup.selectAll('.weekday-line')
        .data(weekdayLines)
        .enter()
        .append('line')
        .attr('class', 'weekday-line')
        .attr('x1', d => xScale(d))
        .attr('x2', d => xScale(d))
        .attr('y1', 0)
        .attr('y2', height)
        .attr('stroke', '#008000')
        .attr('stroke-width', 2)
        .attr('stroke-opacity', 0.3)
        .style('pointer-events', 'none');

    // Add weekday labels at the top
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    chartGroup.selectAll('.weekday-label')
        .data(weekdayLines)
        .enter()
        .append('text')
        .attr('class', 'weekday-label')
        .attr('x', d => xScale(d) + 3)
        .attr('y', 10)
        .attr('text-anchor', 'start')
        .style('font-size', '10px')
        .style('fill', '#008000')
        .style('font-weight', 'bold')
        .style('pointer-events', 'none')
        .text(d => weekdays[d.getDay()]);
}