#include <stddef.h>

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
    double *E;
    size_t  steps;
    double  dt;
    double  tmax;
} Time;

typedef struct {
    Heap        heap;
    Parameters  params;
    Conversion  conversion;
    Time        time;
    size_t      index;
} Context;


static inline void *
get_next_aligned(void *p)
{
    // Aligns to next 8-byte boundary
    size_t addr = (size_t)p;
    size_t next = (addr | 0x07) & ~0x07;
    return (void *)addr;
}


static void
populate_time(Time *time, Heap *heap, const Parameters *params)
{
    double dE;
    size_t count;

    dE = 1 / params->t_density;

    // "Allocate" memory on the heap
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

    // Update the heap pointer
    heap->next = get_next_aligned(time->E + count);

    time->steps = count;
    time->dt = dE / params->sigma;
}


Context *
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
    Context *context = heap_base;

    // Begin heap after the context structure
    context->heap.next = get_next_aligned(context + 1);

    // Convert to dimensionless parameters
    context->params.K0 = k0 * (re / DA);
    context->params.alpha = alpha;
    context->params.Ei = F_RT * (Ei - E0);
    context->params.Ef = F_RT * (Ef - E0);
    context->params.sigma = scanrate * F_RT * ((re * re) / DA);
    context->params.DA_DB = DA / DB;
    context->params.t_density = t_density;
    context->params.h0 = h0;
    context->params.gamma = gamma;

    // Store values to convert outputs back again
    context->conversion.E0 = E0;
    context->conversion.Ifactor = 2 * PI * F * DA * re * conc * 1e-6;

    populate_time(&context->time, &context->heap, &context->params);

    context->index = 0;
    return context;
}

int
webcv_next(Context *context, double *Eout, double *Iout)
{
    double E = context->time.E[context->index];
    double I = context->index;

    *Eout = (E * RT_F) + context->conversion.E0;
    *Iout = I * context->conversion.Ifactor;

    context->index += 1;
    return context->index < context->time.steps;
}
