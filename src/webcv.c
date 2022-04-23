#include <stddef.h>

#define OXIDATION +1
#define REDUCTION -1


// No stdlib included, declare utils imported from JS
double exp(double x);
double sqrt(double x);
void debug_i(size_t i);
void debug_f(double f);
void debug_p(void *p);


// Useful constants
static const double PI = 3.14159265359;
static const double F = 96485.33212;
static const double R = 8.314462618;
static const double T = 298.15;
static const double F_RT = F / (R * T);
static const double RT_F = (R * T) / F;


/*
 * ===========================================================================
 * Type definitions
 * ===========================================================================
 */

typedef struct {
    double k0;
    double kA_factor;
    double kB_factor;
    double Ei;
    double Ef;
    double sigma;
    double t_density;
    double h0;
    double gamma;
} Parameters;

typedef struct {
    double E0;
    double I_factor;
} Conversion;

typedef struct {
    size_t  length;
    double *E;
    double  dt;
} Time;

typedef struct {
    size_t  length;
    double *R;
} Space;

typedef struct {
    size_t  length;
    double *matrix_a;
    double *matrix_b;
    double *matrix_c;
    double *vector;
} Equations;

typedef struct {
    Parameters  params;
    Conversion  conversion;
    Time        time;
    Space       space;
    Equations   equations;
    size_t      index;
} Simulation;


/*
 * ===========================================================================
 * Rudimentary heap memory allocation
 * ===========================================================================
 */

static void *_heap = NULL;
static inline void *
get_next_aligned(void *p)
{
    // Aligns to next 8-byte boundary
    size_t addr = (size_t)p;
    size_t next = (addr + 0x07) & ~0x07;
    return (void *)next;
}
#define HEAP_INIT(ptr)            (_heap) = (ptr)
#define HEAP_ALLOC_START()        (_heap)
#define HEAP_ALLOC_END(ptr, len)  (_heap) = get_next_aligned((ptr) + (len))


/*
 * ===========================================================================
 * Implementation internals
 * ===========================================================================
 */

static void
init_time(Time *time, const Parameters *params)
{
    double dE;
    size_t length;

    dE = 1.0 / params->t_density;
    time->dt = dE / params->sigma;

    time->E = HEAP_ALLOC_START();

    // Forward sweep
    time->E[0] = params->Ei;
    length = 1;
    if (params->Ef > params->Ei) {
        while (time->E[length - 1] < params->Ef) {
            time->E[length] = time->E[length - 1] + dE;
            ++length;
        }
    } else {
        while (time->E[length - 1] > params->Ef) {
            time->E[length] = time->E[length - 1] - dE;
            ++length;
        }
    }

    // Reverse sweep
    for (size_t i = length; i > 0; i--) {
        time->E[length] = time->E[i - 1];
        ++length;
    }
    time->length = length;

    HEAP_ALLOC_END(time->E, length);
}


static void
init_space(Space *space, const Parameters *params, const Time *time)
{
    double dR;
    double limit;
    size_t length;

    dR = params->h0;
    limit = 1 + 6 * sqrt(time->dt * time->length);

    space->R = HEAP_ALLOC_START();

    // Calculate expanding grid
    space->R[0] = 1.0;
    length = 1;
    while (space->R[length - 1] < limit) {
        space->R[length] = space->R[length - 1] + dR;
        dR *= params->gamma;
        ++length;
    }
    space->length = length;

    HEAP_ALLOC_END(space->R, length);
}


static void
init_equations(Equations *equations, const Space *space, const Time *time)
{
    equations->length = space->length;

    equations->matrix_a = HEAP_ALLOC_START();
    HEAP_ALLOC_END(equations->matrix_a, equations->length);

    equations->matrix_b = HEAP_ALLOC_START();
    HEAP_ALLOC_END(equations->matrix_b, equations->length);

    equations->matrix_c = HEAP_ALLOC_START();
    HEAP_ALLOC_END(equations->matrix_c, equations->length);

    equations->vector = HEAP_ALLOC_START();
    HEAP_ALLOC_END(equations->vector, equations->length);

    double dt = time->dt;
    double *R = space->R;

    // We're solving the following equation:
    //
    // dc   2 dc   d2c
    // -- = - -- + ---
    // dt   r dr   dr2
    //
    // Each term can be approximated using the finite difference method:
    //
    // dc   c[t1] - c[t0]
    // -- = -------------
    // dt        dt
    //
    // 2 dc    2     (c[i+1] - c[i-1])
    // - -- = ---- * -------------------
    // r dr   r[i]   (r[i+1] - r[i-1])
    //
    // d2c   c[i+1]*(r[i] - r[i-1]) + c[i-1]*(r[i+1] - r[i]) - c[i]*(r[i+1] - r[i-1])
    // --- = ------------------------------------------------------------------------
    // dr2         1/2 * (r[i+1] - r[i-1]) * (r[i+1] - r[i]) * (r[i] - r[i-1])
    //
    for (size_t i = 1; i < space->length - 1; i++) {
        equations->matrix_a[i] =
            (-2 * dt * R[i-1]) / (R[i] * (R[i+1] - R[i-1]) * (R[i] - R[i-1]));
        equations->matrix_b[i] =
            1 + (2 * dt) / ((R[i+1] - R[i]) * (R[i] - R[i-1]));
        equations->matrix_c[i] =
            (-2 * dt * R[i+1]) / (R[i] * (R[i+1] - R[i-1]) * (R[i+1] - R[i]));
    }

    // Outer boundary - bulk concentration
    equations->matrix_a[space->length - 1] = 0.0;
    equations->matrix_b[space->length - 1] = 1.0;
    equations->matrix_c[space->length - 1] = 0.0;

    // Initialise bulk concentration everywhere
    for (size_t i = 0; i < equations->length; i++) {
        equations->vector[i] = 1.0;
    }
}


static void
update_equations(Equations *equations, double dR, double kA, double kB)
{
    // Bulter-Volmer equation at electrode surface:
    //
    // dc
    // -- = kA.c - kb.(1 - c)
    // dr
    //
    equations->matrix_a[0] = 0.0;
    equations->matrix_b[0] = 1 + dR * (kA + kB);
    equations->matrix_c[0] = -1.0;
    equations->vector[0] = dR * kB;
}


static void
solve_equations(Equations *equations)
{
    // Adapted from:
    // https://en.wikibooks.org/wiki/Algorithm_Implementation/Linear_Algebra/Tridiagonal_matrix_algorithm
    size_t n = equations->length;
    const double *a = equations->matrix_a;
    const double *b = equations->matrix_b;
    const double *c = equations->matrix_c;
    double *x = equations->vector;
    double *cprime = HEAP_ALLOC_START();

    cprime[0] = c[0] / b[0];
    x[0] = x[0] / b[0];

    for (size_t i = 1; i < n; i++) {
        const double m = 1.0 / (b[i] - a[i] * cprime[i - 1]);
        cprime[i] = c[i] * m;
        x[i] = (x[i] - a[i] * x[i - 1]) * m;
    }

    for (size_t i = n - 1; i-- > 0; ) {
        x[i] -= cprime[i] * x[i + 1];
    }
}


/*
 * ===========================================================================
 * Public API
 * ===========================================================================
 */

static Parameters  params;
static Conversion  conversion;
static Time        time;
static Space       space;
static Equations   equations;
static size_t      index;


void
webcv_init(
    void *heap_base,
    int redox,
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
    HEAP_INIT(heap_base);

    // Store simulation parameters
    switch (redox) {
    case OXIDATION:
        params.kA_factor = 1 - alpha;
        params.kB_factor = -alpha;
        break;
    case REDUCTION:
        params.kA_factor = -alpha;
        params.kB_factor = 1 - alpha;
        break;
    }
    params.k0 = k0 * (re / D);
    params.Ei = F_RT * (Ei - E0);
    params.Ef = F_RT * (Ef - E0);
    params.sigma = scanrate * F_RT * ((re * re) / D);
    params.t_density = t_density;
    params.h0 = h0;
    params.gamma = gamma;

    // Store values to convert outputs back again
    conversion.E0 = E0;
    conversion.I_factor = redox * 2 * PI * F * D * re * conc * 1e-6;

    init_time(&time, &params);
    init_space(&space, &params, &time);
    init_equations(&equations, &space, &time);

    index = 0;
}


int
webcv_next(double *Eout, double *Iout)
{
    double E;
    double I;
    double kA;
    double kB;

    E = time.E[index];
    kA = params.k0 * exp(E * params.kA_factor);
    kB = params.k0 * exp(E * params.kB_factor);

    update_equations(&equations, params.h0, kA, kB);
    solve_equations(&equations);

    I = (equations.vector[1] - equations.vector[0]) / params.h0;

    *Eout = (E * RT_F) + conversion.E0;
    *Iout = I * conversion.I_factor;

    ++index;
    return index == time.length;
}
