"use strict";

const MARGIN = 60;
const WIDTH = 960 - 2 * MARGIN;
const HEIGHT = 720 - 2 * MARGIN;

let simulation;
let controls;
let plot;


/*
 * ============================================================================
 * Controls
 * ============================================================================
 */

function Controls(params, submit, cancel) {
    this.inputs = params.getElementsByTagName("input");
    this.submit = submit;
    this.cancel = cancel;

    params.addEventListener("submit", (evt) => {
        evt.preventDefault();
        evt.stopPropagation();

        const inputs = evt.target.elements;
        simulation.init(
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

        simulation.kill();
    });
}

Controls.prototype.enabled = function(enabled) {
    this.cancel.disabled = enabled;
    this.submit.disabled = !enabled;
    for (let i = 0; i < this.inputs.length; i++) {
        this.inputs[i].disabled = !enabled;
    }
}


/*
 * ============================================================================
 * Plot
 * ============================================================================
 */

function Plot(target) {
    this.svg = d3.select(target)
      .append("svg")
        .attr("width", WIDTH + 2 * MARGIN)
        .attr("height", HEIGHT + 2 * MARGIN)
      .append("g")
        .attr("transform", `translate(${MARGIN},${MARGIN})`);

    this.xscale = d3.scaleLinear()
        .range([0, WIDTH])
        .domain([0, 0]);

    this.yscale = d3.scaleLinear()
        .range([HEIGHT, 0])
        .domain([0, 0]);

    this.xaxis = this.svg
      .append("g")
        .attr("transform", `translate(0,${HEIGHT})`)
        .call(d3.axisBottom(this.xscale));

    this.yaxis = this.svg
      .append("g")
        .call(d3.axisLeft(this.yscale));

    this.line = d3.line()
        .x(d => this.xscale(d.E))
        .y(d => this.yscale(d.I));
}

Plot.prototype.init = function(xi, xf) {
    this.xscale.domain(d3.extent([xi, xf]));
    this.xaxis.call(d3.axisBottom(this.xscale));
    this.update([]);
}

Plot.prototype.update = function(data) {
    this.yscale.domain(d3.extent(data, d => 1.1 * d.I));
    this.yaxis.call(d3.axisLeft(this.yscale).ticks(10, ".1e"));

    this.svg.selectAll(".line").remove();
    this.svg
      .append("path")
        .datum(data)
        .attr("class", "line")
        .attr("d", this.line);
}


/*
 * ============================================================================
 * Simulation
 * ============================================================================
 */

function Simulation(memory, heap_base, webcv_init, webcv_next) {
    this.shared_memory = new DataView(memory.buffer, heap_base.value, 16);
    this.webcv_init = webcv_init;
    this.webcv_next = webcv_next;
    this.data = [];
    this.timeout = null;
}


Simulation.prototype.init = function(
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

    controls.enabled(false);
    plot.init(Ei, Ef);

    this.webcv_init(
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
    this.running = true;
    this.timeout = setTimeout(() => this.next());

    redraw(performance.now());
}


Simulation.prototype.next = function() {
    let done = this.webcv_next(
        this.shared_memory.byteOffset + 0,
        this.shared_memory.byteOffset + 8,
    );

    this.data.push({
        "E": this.shared_memory.getFloat64(0, true), // WASM is little endian
        "I": this.shared_memory.getFloat64(8, true), // WASM is little endian
    });

    if (done) {
        this.done();
    } else {
        this.timeout = setTimeout(() => this.next());
    }
}


Simulation.prototype.kill = function() {
    console.log("Killing...");
    if (this.timeout) {
        clearTimeout(this.timeout);
        this.timeout = null;
    }
    this.done();
}


Simulation.prototype.done = function() {
    this.running = false;
    controls.enabled(true);
    console.log("Done.")
}


/*
 * ============================================================================
 * Orchestration
 * ============================================================================
 */

async function instantiate(url, memory) {
    const { instance } = await WebAssembly.instantiateStreaming(
        fetch(url), {
            env: {
                memory: memory,
                exp: Math.exp,
                debug_i: arg => console.log(`wasm:int:${arg}`),
                debug_f: arg => console.log(`wasm:flt:${arg}`),
                debug_p: arg => console.log(`wasm:ptr:${arg}`),
            }
        }
    );
    return instance;
}


function redraw(timestamp) {
    plot.update(simulation.data);
    if (simulation.running) {
        window.requestAnimationFrame(redraw);
    }
}


async function main() {
    const params = document.getElementById("parameters");
    const submit = document.getElementById("submit-button");
    const cancel = document.getElementById("cancel-button");
    const holder = document.getElementById("voltammogram");

    const memory = new WebAssembly.Memory({ initial: 8 });
    const instance = await instantiate("webcv.wasm", memory);
    const {
        __heap_base,
        webcv_init,
        webcv_next
    } = instance.exports;

    simulation = new Simulation(memory, __heap_base, webcv_init, webcv_next);
    controls = new Controls(params, submit, cancel);
    plot = new Plot(holder);

    controls.enabled(true);
}


main();
