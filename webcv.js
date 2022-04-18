"use strict";

const MARGIN = 80;
const WIDTH = 960 - 2 * MARGIN;
const HEIGHT = 720 - 2 * MARGIN;

let svg = d3.select("#voltammogram").append("svg")
    .attr("width", WIDTH + 2 * MARGIN)
    .attr("height", HEIGHT + 2 * MARGIN)
    .append("g")
    .attr("transform", `translate(${MARGIN},${MARGIN})`);

let xscale = d3.scaleLinear().range([0, WIDTH]);
let yscale = d3.scaleLinear().range([HEIGHT, 0]);

let line = d3.line()
    .x(d => xscale(d.E))
    .y(d => yscale(d.I));

xscale.domain([0, 0]);
yscale.domain([0, 0]);

let xaxis = svg.append("g")
    .attr("transform", `translate(0,${HEIGHT})`)
    .call(d3.axisBottom(xscale));

let yaxis = svg.append("g")
    .call(d3.axisLeft(yscale));


function update_plot(data) {
    yscale.domain(d3.extent(data, d => 1.1 * d.I));
    yaxis.call(d3.axisLeft(yscale));

    svg.selectAll(".line").remove();
    svg.append("path")
        .datum(data)
        .attr("class", "line")
        .attr("d", line);
}


function WebCV(shared_memory, init_fn, next_fn) {
    this.shared_memory = shared_memory;
    this.init_fn = init_fn;
    this.next_fn = next_fn;
    this.ctx = null;
    this.data = [];
}


WebCV.prototype.run = function (
    E0,
    k0,
    alpha,
    Ei,
    Ef,
    re,
    scanrate,
    conc,
    D,
    t_density,
    h0,
    gamma,
) {
    console.log("Starting...");
    this.ctx = this.init_fn(
        this.shared_memory.byteOffset + this.shared_memory.byteLength,
        E0,
        k0,
        alpha,
        Ei,
        Ef,
        re,
        scanrate,
        conc,
        D,
        t_density,
        h0,
        gamma,
    );

    xscale.domain([Ei, Ef]);
    xaxis.call(d3.axisBottom(xscale));

    this.data = [];
    setTimeout(() => this.next());
}


WebCV.prototype.next = function () {
    let more = this.next_fn(
        this.ctx,
        this.shared_memory.byteOffset + 0,
        this.shared_memory.byteOffset + 8,
    );

    this.data.push({
        "E": this.shared_memory.getFloat64(0, true), // WASM is little endian
        "I": this.shared_memory.getFloat64(8, true), // WASM is little endian
    });
    update_plot(this.data);

    if (more) {
        setTimeout(() => this.next());
    } else {
        this.done();
    }
}


WebCV.prototype.done = function() {
    console.log("Done.");
}


async function load_webcv(url, pages) {
    const memory = new WebAssembly.Memory({initial: pages});
    const { instance } = await WebAssembly.instantiateStreaming(
        fetch(url), {
            env: {
                memory: memory,
                exp: Math.exp,
                sqrt: Math.sqrt,
                debug_i: arg => console.log(`wasm:int:${arg}`),
                debug_f: arg => console.log(`wasm:flt:${arg}`),
                debug_p: arg => console.log(`wasm:ptr:${arg}`),
            }
        }
    );
    const { __heap_base, webcv_init, webcv_next } = instance.exports;
    const shared_memory = new DataView(memory.buffer, __heap_base.value, 16);
    return new WebCV(shared_memory, webcv_init, webcv_next);
}


async function main() {
    const webcv = await load_webcv("webcv.wasm", 8);

    const params = document.getElementById("parameters");
    params.addEventListener("submit", function (evt) {
        evt.preventDefault();
        evt.stopPropagation();

        const inputs = evt.target.elements;
        webcv.run(
            inputs["E0"].value,
            inputs["k0"].value,
            inputs["alpha"].value,
            inputs["Ei"].value,
            inputs["Ef"].value,
            inputs["re"].value,
            inputs["scanrate"].value,
            inputs["conc"].value,
            inputs["D"].value,
            inputs["t_density"].value,
            inputs["h0"].value,
            inputs["gamma"].value,
        );
    });
}

main();
