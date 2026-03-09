import * as d3 from "d3";
import type { RowLabel, TopicLabel } from "./types";

type SlotNameLabelData = {
    id: string;
    x: number;
    y: number;
    slotNames: string[];
    isCollapsed: boolean;
};

const escapeHtml = (value: string): string => {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
};

export function updateGridlinesAndLabels(
    group: d3.Selection<SVGGElement, unknown, null, undefined>,
    topicLabelsDefinition: TopicLabel[],
    rowLabelsDefinition: RowLabel[],
    horizontalGridlinesDefinitions: { id: string; y: number }[],
    yScale: d3.ScaleBand<string>,
    margin: { top: number; right: number; bottom: number; left: number; },
    width: number,
    animationDuration: number,
    onSlotNameClick?: (slotName: string) => void,
    selectedSlotName?: string | null,
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

    // Update slot names below topic labels
    const slotNameLabels = group
        .selectAll<SVGForeignObjectElement, SlotNameLabelData>(`.topic-slot-names`)
        .data(topicLabelsDefinition.map(d => ({
            id: `${d.id}-slot-names`,
            // Keep some free space on the far left so topic-area margin-click collapse still works.
            x: d.x + 30,
            y: d.y + 1,
            slotNames: d.slotNames,
            isCollapsed: d.isCollapsed
        })), d => d.id);
    
    const slotNameLabelsEnter = slotNameLabels
        .enter()
        .append('foreignObject')
        .attr('class', 'topic-slot-names')
        .attr('width', 180)
        .attr('height', 60)
        .attr('opacity', 0)
        .attr('x', d => d.x)
        .attr('y', d => d.y);
        
    slotNameLabelsEnter
        .append('xhtml:div')
        .style('font-size', '10px')
        .style('color', '#666')
        .style('line-height', '1.2')
        .style('word-wrap', 'break-word')
        .style('overflow-wrap', 'break-word')
        .style('max-width', '180px')
        .style('pointer-events', 'none');
    
    const slotNameLabelsUpdate = slotNameLabelsEnter.merge(slotNameLabels);
    
    // Update content first (before transition)
    const slotNameContainers = slotNameLabelsUpdate.select('div')
        .html((d: SlotNameLabelData) => {
            if (d.slotNames.length === 0) return '';
            return d.slotNames
                .map((slotName) => {
                    const safeSlotName = escapeHtml(slotName);
                    const isSelected = selectedSlotName === slotName;
                    const selectedClass = isSelected ? ' is-selected' : '';
                    return `<span class="topic-slot-name${selectedClass}" data-slot-name="${safeSlotName}">${safeSlotName}</span>`;
                })
                .join(', ');
        });

    slotNameContainers.each(function () {
        const slotNames = d3.select(this).selectAll<HTMLSpanElement, unknown>('span.topic-slot-name');
        slotNames
            .style('pointer-events', 'all')
            .style('cursor', onSlotNameClick ? 'pointer' : 'default')
            .style('text-decoration', function () {
                return this.classList.contains('is-selected') ? 'underline' : 'none';
            })
            .style('text-decoration-thickness', function () {
                return this.classList.contains('is-selected') ? '2px' : '0';
            })
            .style('color', function () {
                return this.classList.contains('is-selected') ? '#b35a00' : '#666';
            })
            .style('font-weight', function () {
                return this.classList.contains('is-selected') ? '700' : '400';
            })
            .on('click', function (event) {
                event.stopPropagation();
                if (!onSlotNameClick) return;
                const slotName = this.getAttribute('data-slot-name');
                if (!slotName) return;
                onSlotNameClick(slotName);
            });
    });
    
    // Then apply transition
    slotNameLabelsUpdate
        .transition()
        .duration(animationDuration)
        .attr('x', d => d.x)
        .attr('y', d => d.y)
        .attr('opacity', d => d.isCollapsed ? 0 : 1);
    
    slotNameLabels
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