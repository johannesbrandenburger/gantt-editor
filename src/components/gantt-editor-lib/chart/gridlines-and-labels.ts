import * as d3 from "d3";
import type { RowLabel, TopicLabel } from "./types";

export function updateGridlinesAndLabels(
    group: d3.Selection<SVGGElement, unknown, null, undefined>,
    topicLabelsDefinition: TopicLabel[],
    rowLabelsDefinition: RowLabel[],
    horizontalGridlinesDefinitions: { id: string; y: number }[],
    yScale: d3.ScaleBand<string>,
    margin: { top: number; right: number; bottom: number; left: number; },
    width: number,
    animationDuration: number,
) {

    // Update topic and row labels on data SVG
    const topicLabels = group
        .selectAll<SVGTextElement, TopicLabel>(`.topic-label`)
        .data(topicLabelsDefinition, d => d.id);
    
    topicLabels
        .enter()
        .append('text')
        .attr('class', 'topic-label')
        .attr('font-weight', 'bold')
        .attr('opacity', 0)
        .attr('x', d => d.x)
        .attr('y', d => d.y)
        .merge(topicLabels)
        .transition()
        .duration(animationDuration)
        .attr('x', d => d.x)
        .attr('y', d => d.y)
        .attr('opacity', 1)
        .text(d => (d.isInactive ? ' ⚠️' : '') + d.text + (d.isCollapsed ? ' ►' : ' ▼')) // TODO: use mdi-arrow-expand-vertical or mdi-unfold-less-horizontal
        .attr('fill', d => d.isInactive ? 'red' : 'black')
    
    topicLabels
        .exit()
        .transition()
        .duration(animationDuration)
        .attr('opacity', 0)
        .remove();

    const rowLabels = group
        .selectAll<SVGTextElement, RowLabel>(`.row-label`)
        .data(rowLabelsDefinition, d => d.id);
    
    rowLabels
        .enter()
        .append('text')
        .attr('class', 'row-label')
        .attr('opacity', 0)
        .attr('x', d => d.x)
        .attr('y', d => d.y)
        .merge(rowLabels)
        .transition()
        .duration(animationDuration)
        .attr('x', d => d.x)
        .attr('y', d => d.y)
        .attr('opacity', 1)
        .text(d => d.text);
    
    rowLabels
        .exit()
        .transition()
        .duration(animationDuration)
        .attr('opacity', 0)
        .remove();

    // Update horizontal gridlines on data SVG
    const gridLines = group
        .selectAll<SVGLineElement, RowLabel>(`.horizontal-grid`)
        .data(horizontalGridlinesDefinitions, d => `${d.id}-gridline`);

    gridLines
        .enter()
        .append('line')
        .attr('class', 'horizontal-grid')
        .merge(gridLines)
        .transition()
        .duration(animationDuration)
        .attr('x1', -margin.left)
        .attr('x2', width)
        .attr('y1', d => d.y)
        .attr('y2', d => d.y)
        .attr('stroke', '#dee2e6')
        .attr('stroke-width', 1)
        .attr('opacity', 0.5);
    
    gridLines
        .exit()
        .transition()
        .duration(animationDuration)
        .attr('opacity', 0)
        .remove();


}