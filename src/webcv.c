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
    double t_density;
    double h0;
    double gamma;
} Parameters;

typedef struct {
    double E0;
    double Ifactor;
} Conversion;

typedef struct {
    size_t  length;
    double  dt;
    double *E;
    double *kA;
    double *kB;
} Time;

typedef struct {
    size_t  length;
    double *R;
} Space;

typedef struct {
    size_t  length;
    double *Ma;
    double *Mb;
    double *Mc;
    double *C;
} Equations;

typedef struct {
    Heap        heap;
    Parameters  params;
    Conversion  conversion;
    Time        time;
    Space       space;
    Equations   equations;
    size_t      index;
} Simulation;


static inline void *
get_next_aligned(void *p)
{
    // Aligns to next 8-byte boundary
    size_t addr = (size_t)p;
    size_t next = (addr + 0x07) & ~0x07;
    return (void *)next;
}


static void
init_time(Time *time, Heap *heap, const Parameters *params)
{
    double dE;
    size_t length;

    dE = 1.0 / params->t_density;

    // Calculate potential ramp
    time->E = heap->next;
    time->E[0] = params->Ei;
    length = 1;
    while (time->E[length - 1] < params->Ef) {
        time->E[length] = time->E[length - 1] + dE;
        ++length;
    }
    while (time->E[length - 1] > params->Ei) {
        time->E[length] = time->E[length - 1] - dE;
        ++length;
    }
    heap->next = get_next_aligned(time->E + length);

    // Calculate rate constants
    time->kA = heap->next;
    heap->next = get_next_aligned(time->kA + length);
    time->kB = heap->next;
    heap->next = get_next_aligned(time->kB + length);
    for (size_t i = 0; i < length; i++) {
        time->kA[i] = params->K0 * exp((1 - params->alpha) * time->E[i]);
        time->kB[i] = params->K0 * exp(-params->alpha * time->E[i]);
    }

    time->length = length;
    time->dt = dE / params->sigma;
}


static void
init_space(Space *space, Heap *heap, const Parameters *params, const Time *time)
{
    double dR;
    double limit;
    size_t length;

    dR = params->h0;
    limit = 1 + 6 * sqrt(time->dt * time->length);

    // Calculate expanding grid
    space->R = heap->next;
    space->R[0] = 1;
    length = 1;
    while (space->R[length - 1] < limit) {
        space->R[length] = space->R[length - 1] + dR;
        dR *= params->gamma;
        ++length;
    }
    heap->next = get_next_aligned(space->R + length);

    space->length = length;
}


static void
init_equations(Equations *equations, Heap *heap, const Space *space)
{
    equations->length = space->length;

    equations->Ma = heap->next;
    heap->next = get_next_aligned(equations->Ma + equations->length);
    equations->Mb = heap->next;
    heap->next = get_next_aligned(equations->Mb + equations->length);
    equations->Mc = heap->next;
    heap->next = get_next_aligned(equations->Mc + equations->length);
    equations->C = heap->next;
    heap->next = get_next_aligned(equations->C + equations->length);

    // Placeholder values...
    for (size_t i = 0; i < equations->length; i++) {
        equations->Ma[i] = 1;
        equations->Mb[i] = 10;
        equations->Mc[i] = 1;
        equations->C[i] = 1;
    }
}


static void
update_equations(Equations *equations)
{
}


static void
solve_equations(const Equations *equations, Heap *heap)
{
    // Adapted from:
    // https://en.wikibooks.org/wiki/Algorithm_Implementation/Linear_Algebra/Tridiagonal_matrix_algorithm
    size_t length = equations->length;
    double *a = equations->Ma;
    double *b = equations->Mb;
    double *c = equations->Mc;
    double *x = equations->C;
    double *cprime = heap->next;

    cprime[0] = c[0] / b[0];
    x[0] = x[0] / b[0];

    for (size_t i = 1; i < length; i++) {
        double m = 1.0 / (b[i] - a[i] * cprime[i - 1]);
        cprime[i] = c[i] * m;
        x[i] = (x[i] - a[i] * x[i - 1]) * m;
    }

    for (size_t i = length - 1; i-- > 0; ) {
        x[i] -= cprime[i] * x[i + 1];
    }
    x[0] -= cprime[0] * x[1];
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
    double D,
    double t_density,
    double h0,
    double gamma)
{
    Simulation *sim = heap_base;

    // Begin heap after the sim structure
    sim->heap.next = get_next_aligned(sim + 1);

    // Convert to dimensionless parameters
    sim->params.K0 = k0 * (re / D);
    sim->params.alpha = alpha;
    sim->params.Ei = F_RT * (Ei - E0);
    sim->params.Ef = F_RT * (Ef - E0);
    sim->params.sigma = scanrate * F_RT * ((re * re) / D);
    sim->params.t_density = t_density;
    sim->params.h0 = h0;
    sim->params.gamma = gamma;

    // Store values to convert outputs back again
    sim->conversion.E0 = E0;
    sim->conversion.Ifactor = 2 * PI * F * D * re * conc * 1e-6;

    init_time(&sim->time, &sim->heap, &sim->params);
    init_space(&sim->space, &sim->heap, &sim->params, &sim->time);
    init_equations(&sim->equations, &sim->heap, &sim->space);

    sim->index = 0;
    return sim;
}

int
webcv_next(Simulation *sim, double *Eout, double *Iout)
{
    double E;
    double I;

    E = sim->time.E[sim->index];

    update_equations(&sim->equations);
    solve_equations(&sim->equations, &sim->heap);

    I = (sim->equations.C[1] - sim->equations.C[0]) / sim->params.h0;

    *Eout = (E * RT_F) + sim->conversion.E0;
    *Iout = I * sim->conversion.Ifactor;

    sim->index += 1;
    return sim->index < sim->time.length;
}
