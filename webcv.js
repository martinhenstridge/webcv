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


function WebCV(shared_memory, init_fn, next_fn, submit_btn, cancel_btn) {
    this.shared_memory = shared_memory;
    this.init_fn = init_fn;
    this.next_fn = next_fn;
    this.submit_btn = submit_btn;
    this.cancel_btn = cancel_btn;
    this.data = [];
    this.timeout = null;
    this.ctx = null;
}


WebCV.prototype.start = function (
    redox,
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

    this.submit_btn.disabled = true;
    this.cancel_btn.disabled = false;

    this.ctx = this.init_fn(
        this.shared_memory.byteOffset + this.shared_memory.byteLength,
        redox,
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

    this.data = [];
    this.timeout = setTimeout(() => this.next());

    xscale.domain(d3.extent([Ei, Ef]));
    xaxis.call(d3.axisBottom(xscale));
    update_plot(this.data);
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
        this.timeout = setTimeout(() => this.next());
    } else {
        this.done();
    }
}


WebCV.prototype.stop = function () {
    console.log("Stopping...");
    if (this.timeout) {
        clearTimeout(this.timeout);
        this.timeout = null;
    }
    this.done();
}


WebCV.prototype.done = function () {
    this.submit_btn.disabled = false;
    this.cancel_btn.disabled = true;
    console.log("Done.")
}


async function load_webcv(url, pages, submit_btn, cancel_btn) {
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
    return new WebCV(shared_memory, webcv_init, webcv_next, submit_btn, cancel_btn);
}


async function main() {
    const params = document.getElementById("parameters");
    const submit = document.getElementById("submit-button");
    const cancel = document.getElementById("cancel-button");

    const webcv = await load_webcv("webcv.wasm", 8, submit, cancel);

    params.addEventListener("submit", (evt) => {
        evt.preventDefault();
        evt.stopPropagation();

        const inputs = evt.target.elements;
        webcv.start(
            inputs["redox"].value,
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

    cancel.addEventListener("click", (evt) => {
        evt.preventDefault();
        evt.stopPropagation();

        webcv.stop();
    });

    submit.disabled = false;
    cancel.disabled = true;
}

main();
