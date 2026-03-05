import * as d3 from "d3";

export const setupCurrentTime = (
    allocatedGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
    currentDateTime: Date,
    xScale: d3.ScaleTime<number, number, never>,
    allocatedGanttHeight: number,
    xScaleHeight: number,
    animationDuration: number,
    hide?: boolean
) => {
       // draw a line for the current time
       const currentTimeLine = allocatedGroup.selectAll<SVGLineElement, Date>(".current-time-line")
           .data(!hide ? [currentDateTime] : []);
       currentTimeLine.enter()
           .append("line")
           .attr("class", "current-time-line")
           .attr("stroke", "red")
           .attr("stroke-width", 1)
           .attr("stroke-dasharray", "5,5")
           .merge(currentTimeLine)
           .transition()
           .duration(animationDuration)
           .attr("x1", xScale(currentDateTime))
           .attr("x2", xScale(currentDateTime))
           .attr("y1", 0)
           .attr("y2", allocatedGanttHeight + xScaleHeight);
   
       // add a small rectangle with the current time on top of the line (low opacity, red)
       const currentTimeRect = allocatedGroup.selectAll<SVGRectElement, Date>(".current-time-rect")
           .data(!hide ? [currentDateTime] : []);
       currentTimeRect.enter()
           .append("rect")
           .attr("class", "current-time-rect")
           .attr("fill", "red")
           .attr("fill-opacity", 0.7)
           .merge(currentTimeRect)
           .transition()
           .duration(animationDuration)
           .attr("x", xScale(currentDateTime))
           .attr("y", 0)
           .attr("width", 40)
           .attr("height", xScaleHeight);
   
       // add a text with the current time
       const currentTimeText = allocatedGroup.selectAll<SVGTextElement, Date>(".current-time-text")
           .data(!hide ? [currentDateTime] : []);
       currentTimeText.enter()
           .append("text")
           .attr("class", "current-time-text")
           .attr("fill", "white")
           .attr("font-size", "12px")
           .attr("font-weight", "bold")
           .merge(currentTimeText)
           .transition()
           .duration(animationDuration)
           .attr("x", xScale(currentDateTime) + 5)
           .attr("y", 15)
           .text(d => d3.timeFormat("%H:%M %d.%m")(d));

        currentTimeLine.exit().remove();
        currentTimeRect.exit().remove();
        currentTimeText.exit().remove();
};