#include <stddef.h>

void debug_i(size_t i);
void debug_f(double f);
void debug_p(void *p);

typedef struct {
    void   *base;
    size_t  size;
} Heap;

typedef struct {
    double Emin;
    double Emax;
} Parameters;

typedef struct {
    Heap       heap;
    Parameters params;
    double     Ecurr;
} Context;


Context *
webcv_init(void *heap_base, size_t heap_size, double Emin, double Emax)
{
    Context *context = heap_base;

    context->heap.base = heap_base;
    context->heap.size = heap_size;
    context->params.Emin = Emin;
    context->params.Emax = Emax;
    context->Ecurr = Emin;

    return context;
}

int
webcv_next(Context *context, double *Eout, double *Iout)
{
    *Eout = context->Ecurr;
    *Iout = context->Ecurr * context->Ecurr;

    context->Ecurr += 0.01;
    return (context->Ecurr < context->params.Emax);
}
