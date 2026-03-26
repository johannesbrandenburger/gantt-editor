import * as d3 from "d3";
import { getSharedHoverTooltip, showSharedHoverTooltip, hideSharedHoverTooltip } from "./departuremarker";

export interface VerticalMarkerRenderModel {
    id: string;
    x: number;
    color: string;
    label: string;
    draggable: boolean;
}

export function updateVerticalMarkers(
    chartGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
    xScale: d3.ScaleTime<number, number, never>,
    chartHeight: number,
    width: number,
    markers: Array<{ id: string; date: Date; color?: string; label?: string; draggable?: boolean }>,
    animationDuration: number,
    handlers: {
        isReadOnly: boolean;
        onChange: (id: string, date: Date) => void;
        onClick: (id: string) => void;
    }
): void {
    const tooltip = getSharedHoverTooltip();
    const domain = xScale.domain();
    const start = domain[0].getTime();
    const end = domain[1].getTime();

    const models: VerticalMarkerRenderModel[] = [];
    for (const m of markers) {
        const t = new Date(m.date).getTime();
        if (Number.isNaN(t)) continue;
        if (t < start || t > end) continue;
        const x = xScale(new Date(m.date));
        models.push({
            id: m.id,
            x,
            color: m.color ?? "#16a34a",
            label: m.label ?? "",
            draggable: m.draggable !== false && !handlers.isReadOnly,
        });
    }

    chartGroup
        .selectAll<SVGGElement, number>(".gantt-vertical-marker-layer")
        .data([0])
        .join("g")
        .attr("class", "gantt-vertical-marker-layer");

    const layer = chartGroup.select<SVGGElement>(".gantt-vertical-marker-layer");

    const dragBehavior = d3.drag<SVGRectElement, VerticalMarkerRenderModel>()
        .filter((event: MouseEvent, d) => d.draggable && event.button === 0)
        .on("start", function (event) {
            event.sourceEvent?.stopPropagation?.();
        })
        .on("drag", function (event, d) {
            const [mx] = d3.pointer(event, chartGroup.node());
            const cx = Math.max(0, Math.min(width, mx));
            const g = d3.select(this.parentNode as SVGGElement);
            g.select(".gantt-vertical-marker-line")
                .attr("x1", cx)
                .attr("x2", cx);
            d3.select(this)
                .attr("x", cx - 7);
            g.select(".gantt-vertical-marker-handle")
                .attr("cx", cx);
        })
        .on("end", function (event, d) {
            const [mx] = d3.pointer(event, chartGroup.node());
            const cx = Math.max(0, Math.min(width, mx));
            handlers.onChange(d.id, xScale.invert(cx));
        });

    const markerGroups = layer
        .selectAll<SVGGElement, VerticalMarkerRenderModel>(".gantt-vertical-marker")
        .data(models, (d) => d.id);

    const entered = markerGroups
        .enter()
        .append("g")
        .attr("class", "gantt-vertical-marker");

    entered
        .append("line")
        .attr("class", "gantt-vertical-marker-line")
        .attr("stroke-width", 2)
        .attr("pointer-events", "none");

    entered
        .append("rect")
        .attr("class", "gantt-vertical-marker-hit")
        .attr("pointer-events", "all")
        .attr("fill", "transparent");

    entered
        .append("circle")
        .attr("class", "gantt-vertical-marker-handle")
        .attr("r", 6)
        .attr("pointer-events", "none");

    const merged = entered.merge(markerGroups);

    merged.each(function (d: VerticalMarkerRenderModel) {
        d3.select(this).select<SVGRectElement>(".gantt-vertical-marker-hit").datum(d);
    });

    merged
        .select<SVGLineElement>(".gantt-vertical-marker-line")
        .attr("stroke", (d) => d.color)
        .transition()
        .duration(animationDuration)
        .attr("x1", (d) => d.x)
        .attr("x2", (d) => d.x)
        .attr("y1", 0)
        .attr("y2", chartHeight);

    merged
        .select<SVGCircleElement>(".gantt-vertical-marker-handle")
        .attr("fill", (d) => d.color)
        .attr("stroke", "#fff")
        .attr("stroke-width", 1)
        .style("display", (d) => (d.draggable ? null : "none"))
        .transition()
        .duration(animationDuration)
        .attr("cx", (d) => d.x)
        .attr("cy", 12);

    merged
        .select<SVGRectElement>(".gantt-vertical-marker-hit")
        .attr("y", 0)
        .attr("width", 14)
        .attr("height", chartHeight)
        .attr("cursor", (d) => (d.draggable ? "ew-resize" : "default"))
        .on("mousemove", (event: MouseEvent, d: VerticalMarkerRenderModel) => {
            if (d.label) showSharedHoverTooltip(tooltip, event, d.label);
        })
        .on("mouseout", () => {
            hideSharedHoverTooltip(tooltip);
        })
        .on("click", function (event: MouseEvent, d: VerticalMarkerRenderModel) {
            event.stopPropagation();
            handlers.onClick(d.id);
        })
        .transition()
        .duration(animationDuration)
        .attr("x", (d) => d.x - 7);

    merged.select<SVGRectElement>(".gantt-vertical-marker-hit").call(dragBehavior as never);

    markerGroups.exit().remove();
}
