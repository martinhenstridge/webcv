#include <stddef.h>

// No stdlib, so imported from JS.
double exp(double x);
double sqrt(double x);

// Debug util functions from JS.
void debug_i(size_t i);
void debug_f(double f);
void debug_p(void *p);


const double PI = 3.14159265359;
const double F = 96485.33212;
const double R = 8.314462618;
const double T = 298.15;

const double F_RT = F / (R * T);
const double RT_F = (R * T) / F;


typedef struct {
    void *next;
} Heap;

typedef struct {
    double K0;
    double alpha;
    double Ei;
    double Ef;
    double sigma;
    double DA_DB;
    double t_density;
    double h0;
    double gamma;
} Parameters;

typedef struct {
    double E0;
    double Ifactor;
} Conversion;

typedef struct {
    size_t  steps;
    double  dt;
    double *E;
    double *kA;
    double *kB;
} Time;

typedef struct {
    size_t  steps;
    double *R;
} Space;

typedef struct {
    Heap        heap;
    Parameters  params;
    Conversion  conversion;
    Time        time;
    Space       space;
    size_t      index;
} Simulation;


static inline void *
get_next_aligned(void *p)
{
    // Aligns to next 8-byte boundary
    size_t addr = (size_t)p;
    size_t next = (addr | 0x07) & ~0x07;
    return (void *)addr;
}


static void
init_time(Time *time, Heap *heap, const Parameters *params)
{
    double dE;
    size_t count;

    dE = 1 / params->t_density;

    // Calculate potential ramp
    time->E = heap->next;
    time->E[0] = params->Ei;
    count = 1;
    while (time->E[count - 1] < params->Ef) {
        time->E[count] = time->E[count - 1] + dE;
        ++count;
    }
    while (time->E[count - 1] > params->Ei) {
        time->E[count] = time->E[count - 1] - dE;
        ++count;
    }
    heap->next = get_next_aligned(time->E + count);

    // Calculate rate constants
    time->kA = heap->next;
    heap->next = get_next_aligned(time->kA + count);
    time->kB = heap->next;
    heap->next = get_next_aligned(time->kB + count);
    for (size_t i = 0; i < count; i++) {
        time->kA[i] = params->K0 * exp((1 - params->alpha) * time->E[i]);
        time->kB[i] = params->K0 * exp(-params->alpha * time->E[i]);
    }

    time->steps = count;
    time->dt = dE / params->sigma;
}


static void
init_space(Space *space, Heap *heap, const Parameters *params, const Time *time)
{
    double dR;
    double limit;
    size_t count;

    dR = params->h0;
    limit = 1 + 6 * sqrt(time->dt * time->steps);

    // "Allocate" memory on the heap
    space->R = heap->next;

    space->R[0] = 1;
    count = 1;
    while (space->R[count - 1] < limit) {
        space->R[count] = space->R[count - 1] + dR;
        dR *= params->gamma;
        ++count;
    }

    // Update the heap pointer
    heap->next = get_next_aligned(space->R + count);

    space->steps = count;
}


Simulation *
webcv_init(
    void *heap_base,
    double E0,
    double k0,
    double alpha,
    double Ei,
    double Ef,
    double re,
    double scanrate,
    double conc,
    double DA,
    double DB,
    double t_density,
    double h0,
    double gamma)
{
    Simulation *sim = heap_base;

    // Begin heap after the sim structure
    sim->heap.next = get_next_aligned(sim + 1);

    // Convert to dimensionless parameters
    sim->params.K0 = k0 * (re / DA);
    sim->params.alpha = alpha;
    sim->params.Ei = F_RT * (Ei - E0);
    sim->params.Ef = F_RT * (Ef - E0);
    sim->params.sigma = scanrate * F_RT * ((re * re) / DA);
    sim->params.DA_DB = DA / DB;
    sim->params.t_density = t_density;
    sim->params.h0 = h0;
    sim->params.gamma = gamma;

    // Store values to convert outputs back again
    sim->conversion.E0 = E0;
    sim->conversion.Ifactor = 2 * PI * F * DA * re * conc * 1e-6;

    init_time(&sim->time, &sim->heap, &sim->params);
    init_space(&sim->space, &sim->heap, &sim->params, &sim->time);

    sim->index = 0;
    return sim;
}

int
webcv_next(Simulation *sim, double *Eout, double *Iout)
{
    double E = sim->time.E[sim->index];
    double I = sim->time.kB[sim->index];

    *Eout = (E * RT_F) + sim->conversion.E0;
    *Iout = I * sim->conversion.Ifactor;

    sim->index += 1;
    return sim->index < sim->time.steps;
}
