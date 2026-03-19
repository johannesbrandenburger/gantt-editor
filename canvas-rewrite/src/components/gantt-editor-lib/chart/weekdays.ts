
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

    // Generate dates for the weekday lines
    const days = d3.timeDay.range(startDateTime, endDateTime);
    const weekdayLines = showWeekdayOverlay ? days.filter(d => d.getHours() === 0) : [];
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // Use proper D3 data join instead of remove + re-add to avoid DOM churn
    const lines = chartGroup.selectAll<SVGLineElement, Date>('.weekday-line')
        .data(weekdayLines, d => d.getTime().toString());

    lines.enter()
        .append('line')
        .attr('class', 'weekday-line')
        .attr('stroke', '#008000')
        .attr('stroke-width', 2)
        .attr('stroke-opacity', 0.3)
        .style('pointer-events', 'none')
        .attr('x1', d => xScale(d))
        .attr('x2', d => xScale(d))
        .attr('y1', 0)
        .attr('y2', height)
        .merge(lines)
        .attr('x1', d => xScale(d))
        .attr('x2', d => xScale(d))
        .attr('y1', 0)
        .attr('y2', height);

    lines.exit().remove();

    // Weekday labels
    const labels = chartGroup.selectAll<SVGTextElement, Date>('.weekday-label')
        .data(weekdayLines, d => d.getTime().toString());

    labels.enter()
        .append('text')
        .attr('class', 'weekday-label')
        .attr('text-anchor', 'start')
        .style('font-size', '10px')
        .style('fill', '#008000')
        .style('font-weight', 'bold')
        .style('pointer-events', 'none')
        .attr('x', d => xScale(d) + 3)
        .attr('y', 10)
        .text(d => weekdays[d.getDay()])
        .merge(labels)
        .attr('x', d => xScale(d) + 3)
        .attr('y', 10)
        .text(d => weekdays[d.getDay()]);

    labels.exit().remove();
}