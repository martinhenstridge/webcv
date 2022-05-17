"use strict";


/*
 * ============================================================================
 * Simulation
 * ============================================================================
 */

function Simulation(memory, instance) {
    const {
        __heap_base,
        webcv_init,
        webcv_next
    } = instance.exports;

    this.shared_memory = new DataView(memory.buffer, __heap_base.value, 16);
    this.webcv_init = webcv_init;
    this.webcv_next = webcv_next;
    this.timeout = null;
}

Simulation.prototype.start = function(params) {
    this.webcv_init(
        this.shared_memory.byteOffset + this.shared_memory.byteLength,
        params["redox"],
        params["E0"],
        params["k0"],
        params["alpha"],
        params["Ei"],
        params["Ef"],
        params["re"],
        params["scanrate"],
        params["conc"],
        params["D"],
        params["t_density"],
        params["h0"],
        params["gamma"],
    );
    this.timeout = setTimeout(() => this.next());
}

Simulation.prototype.next = function() {
    const done = this.webcv_next(
        this.shared_memory.byteOffset + 0,
        this.shared_memory.byteOffset + 8,
    );
    const E = this.shared_memory.getFloat64(0, true); // WASM is little endian
    const I = this.shared_memory.getFloat64(8, true); // WASM is little endian
    self.postMessage({ type: "datum", payload: { E, I } });

    if (done) {
        this.done();
    } else {
        this.timeout = setTimeout(() => this.next());
    }
}

Simulation.prototype.stop = function() {
    if (this.timeout) {
        clearTimeout(this.timeout);
        this.timeout = null;
    }
    this.done();
}

Simulation.prototype.done = function() {
    self.postMessage({ type: "done", payload: null });
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
                //debug_i: arg => console.log(`wasm:int:${arg}`),
                //debug_f: arg => console.log(`wasm:flt:${arg}`),
                //debug_p: arg => console.log(`wasm:ptr:${arg}`),
            }
        }
    );
    return instance;
}

let simulation;
self.onmessage = function(msg) {
    const { type, payload } = msg.data;
    switch (type) {
        case "load":
            const memory = new WebAssembly.Memory({ initial: 8 });
            instantiate("webcv.wasm", memory).then(function (instance) {
                simulation = new Simulation(memory, instance);
                simulation.done();
            });
            break;
        case "start":
            simulation.start(payload);
            break;
        case "stop":
            simulation.stop();
            break;
    }
}
