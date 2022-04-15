const MARGIN = 80;
const WIDTH = 960 - 2 * MARGIN;
const HEIGHT = 480 - 2 * MARGIN;

const Ei = -0.3;
const Ef = +0.3;

let svg = d3.select("body").append("svg")
    .attr("width", WIDTH + 2 * MARGIN)
    .attr("height", HEIGHT + 2 * MARGIN)
    .append("g")
    .attr("transform", `translate(${MARGIN},${MARGIN})`);

let xscale = d3.scaleLinear().range([0, WIDTH]);
let yscale = d3.scaleLinear().range([HEIGHT, 0]);

let line = d3.line()
    .x(d => xscale(d.E))
    .y(d => yscale(d.I));

xscale.domain([Ei, Ef]);
yscale.domain([0, 0]);

let xaxis = svg.append("g")
    .attr("transform", `translate(0,${HEIGHT})`)
    .call(d3.axisBottom(xscale));

let yaxis = svg.append("g")
    .call(d3.axisLeft(yscale));


function update_plot(data) {
    yscale.domain(d3.extent(data, d => d.I));
    yaxis.call(d3.axisLeft(yscale));

    svg.selectAll(".line").remove();
    svg.append("path")
        .datum(data)
        .attr("class", "line")
        .attr("d", line);
}


async function get_wasm_instance(wasm, memory) {
    const { instance } = await WebAssembly.instantiateStreaming(
        fetch(wasm), {
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
    return instance;
}


async function main() {
    const memory = new WebAssembly.Memory({initial: 256});
    const instance = await get_wasm_instance("webcv.wasm", memory)
    const { __heap_base, webcv_init, webcv_next } = instance.exports;

    // Reserve memory at the start of the heap for communication between
    // JS and WASM. The remainder of the heap is for the exclusive use
    // of WASM.
    const SHARED_MEMORY_BYTES = 16;
    const shared_memory = new DataView(
        memory.buffer,
        __heap_base.value,
        SHARED_MEMORY_BYTES,
    );

    const ctx = webcv_init(
        __heap_base.value + SHARED_MEMORY_BYTES, // Start of private heap
        0.0,  // E0 [V]
        1.0,  // k0 [cm s-1]
        0.5,  // alpha [-]
        Ei,   // Ei [V]
        Ef,   // Ef [V]
        0.1,  // re [cm]
        0.1,  // scanrate [V s-1]
        1.0,  // conc [mM]
        1e-5, // D [cm2 s-1]
        1.0,  // t_density [-]
        1e-5, // h0 [-]
        1.1,  // gamma [-]
    );

    let data = [];
    let more = true;
    while (more) {
        more = webcv_next(
            ctx,
            shared_memory.byteOffset + 0,
            shared_memory.byteOffset + 8,
        );
        data.push({
            "E": shared_memory.getFloat64(0, true), // WASM is little endian
            "I": shared_memory.getFloat64(8, true), // WASM is little endian
        });
        update_plot(data);
    }
}

main();
