

export const addSvgDefs = (
    svg: d3.Selection<SVGElement, unknown, null, undefined>
) => {

    if (svg.select("defs").select("#area-gradient-check-ins").empty()) {

        // Add gradient for check in charts
        const gradient = svg.append("defs")
            .append("linearGradient")
            .attr("id", "area-gradient-check-ins")
            .attr("x1", "0%")
            .attr("y1", "0%")
            .attr("x2", "100%")
            .attr("y2", "0%");

        const gradientColors = [
            "#ea6b66",
            "#ffcd28",
            "#ffb570",
            "#97d077",
            "#97d077",
            "#ffb570",
            "#ffcd28",
            "#ea6b66"
        ];
        gradientColors.forEach((color, i) => {
            gradient.append("stop")
                .attr("offset", `${(i / (gradientColors.length - 1)) * 100}%`)
                .attr("stop-color", color);
        });
    }


    // <svg height="10" width="10" xmlns="http://www.w3.org/2000/svg" version="1.1"> <defs> <pattern id="diagonal-stripe-2" patternUnits="userSpaceOnUse" width="10" height="10"> <image xlink:href="data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPScxMCcgaGVpZ2h0PScxMCc+CiAgPHJlY3Qgd2lkdGg9JzEwJyBoZWlnaHQ9JzEwJyBmaWxsPSd3aGl0ZScvPgogIDxwYXRoIGQ9J00tMSwxIGwyLC0yCiAgICAgICAgICAgTTAsMTAgbDEwLC0xMAogICAgICAgICAgIE05LDExIGwyLC0yJyBzdHJva2U9J2JsYWNrJyBzdHJva2Utd2lkdGg9JzInLz4KPC9zdmc+" x="0" y="0" width="10" height="10"> </image> </pattern> </defs> </svg>
    if (svg.select("defs").select("#diagonal-stripe-2").empty()) {
        // Add diagonal stripes pattern
        const pattern = svg.append("defs")
            .append("pattern")
            .attr("id", "diagonal-stripe-2")
            .attr("patternUnits", "userSpaceOnUse")
            .attr("width", "10")
            .attr("height", "10");

        pattern.append("image")
            .attr("xlink:href", "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPScxMCcgaGVpZ2h0PScxMCc+CiAgPHJlY3Qgd2lkdGg9JzEwJyBoZWlnaHQ9JzEwJyBmaWxsPSd3aGl0ZScvPgogIDxwYXRoIGQ9J00tMSwxIGwyLC0yCiAgICAgICAgICAgTTAsMTAgbDEwLC0xMAogICAgICAgICAgIE05LDExIGwyLC0yJyBzdHJva2U9J2JsYWNrJyBzdHJva2Utd2lkdGg9JzInLz4KPC9zdmc+")
            .attr("x", "0")
            .attr("y", "0")
            .attr("width", "10")
            .attr("height", "10");
    }
}