"use strict";


/*
 * ============================================================================
 * Form
 * ============================================================================
 */

function Form(params, submit, cancel) {
    this.inputs = params.getElementsByTagName("input");
    this.submit = submit;
    this.cancel = cancel;
}

Form.prototype.locked = function(locked) {
    this.cancel.disabled = !locked;
    this.submit.disabled = locked;
    for (let i = 0; i < this.inputs.length; i++) {
        this.inputs[i].disabled = locked;
    }
}


/*
 * ============================================================================
 * Plot
 * ============================================================================
 */

function Plot(target) {
    const MARGIN = 60;
    const WIDTH = 960 - 2 * MARGIN;
    const HEIGHT = 720 - 2 * MARGIN;

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
        .x(d => this.xscale(d["E"]))
        .y(d => this.yscale(d["I"]));
}

Plot.prototype.init = function(lval, rval) {
    this.xscale.domain(d3.extent([lval, rval]));
    this.xaxis.call(d3.axisBottom(this.xscale));
    this.update([]);
}

Plot.prototype.update = function(data) {
    this.yscale.domain(d3.extent(data, d => 1.1 * d["I"]));
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
 * Orchestration
 * ============================================================================
 */

window.onload = async function() {
    // Spawn worker
    const worker = new Worker("worker.js");

    // Lookup DOM elements of interest
    const params = document.getElementById("parameters");
    const submit = document.getElementById("submit-button");
    const cancel = document.getElementById("cancel-button");
    const holder = document.getElementById("voltammogram");

    // Instantiate controller objects
    const form = new Form(params, submit, cancel);
    const plot = new Plot(holder);

    // Track simulation state
    let running = false;
    let data = [];

    // Animation loop
    function replot(timestamp) {
        plot.update(data);
        if (running) {
            window.requestAnimationFrame(replot);
        }
    }

    // Register 'submit' click handler
    params.addEventListener("submit", (evt) => {
        evt.preventDefault();
        evt.stopPropagation();

        const inputs = evt.target.elements;
        const params = {
            redox: inputs["redox"].value,
            E0: inputs["E0"].value,
            k0: inputs["k0"].value,
            alpha: inputs["alpha"].value,
            Ei: inputs["Ei"].value,
            Ef: inputs["Ef"].value,
            re: inputs["re"].value,
            scanrate: inputs["scanrate"].value,
            conc: inputs["conc"].value,
            D: inputs["D"].value,
            t_density: inputs["t_density"].value,
            h0: inputs["h0"].value,
            gamma: inputs["gamma"].value,
        };
        worker.postMessage({ type: "start", payload: params });

        plot.init(params["Ei"], params["Ef"]);
        form.locked(true);

        running = true;
        data = [];
        replot();
    });

    // Register 'cancel' click handler
    cancel.addEventListener("click", (evt) => {
        evt.preventDefault();
        evt.stopPropagation();

        worker.postMessage({ type: "stop", payload: null });
    });

    // Register handler for messages from worker
    worker.onmessage = function(msg) {
        const { type, payload } = msg.data;
        switch (type) {
            case "done":
                form.locked(false);
                running = false;
                break;
            case "datum":
                data.push(payload);
                break;
        }
    }

    // Initialise worker, ready to receive requests
    worker.postMessage({ type: "load", payload: null });
}
