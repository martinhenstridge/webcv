const MARGIN = 50;
const WIDTH = 960 - 2 * MARGIN;
const HEIGHT = 480 - 2 * MARGIN;

const XMIN = 0.0;
const XMAX = 4 * Math.PI;

let svg = d3.select("body").append("svg")
    .attr("width", WIDTH + 2 * MARGIN)
    .attr("height", HEIGHT + 2 * MARGIN)
    .append("g")
    .attr("transform", `translate(${MARGIN},${MARGIN})`);

let xscale = d3.scaleLinear().range([0, WIDTH]);
let yscale = d3.scaleLinear().range([HEIGHT, 0]);

let line = d3.line()
    .x((d) => xscale(d[0]))
    .y((d) => yscale(d[1]));

xscale.domain([XMIN, XMAX]);
yscale.domain([0, 0]);

let xaxis = svg.append("g")
    .attr("transform", `translate(0,${HEIGHT})`)
    .call(d3.axisBottom(xscale));

let yaxis = svg.append("g")
    .call(d3.axisLeft(yscale));


function update(data) {
    yscale.domain(d3.extent(data, (d) => d[1]));
    yaxis.call(d3.axisLeft(yscale));

    svg.selectAll(".line").remove();
    svg.append("path")
        .data([data])
        .attr("class", "line")
        .attr("d", line);
}


async function main() {
    let DATA = [];
    for (x = XMIN; x <= XMAX; x += 0.01) {
        await new Promise(r => setTimeout(r, 10));
        let y = 1 - Math.cos(x);
        DATA.push([x, y]);
        update(DATA);
    }
}

main();
