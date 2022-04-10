.RECIPEPREFIX = >

CC = clang
STACK_SIZE = $(shell expr 1024 \* 1024)

wasm:
> $(CC) \
>   --target=wasm32 \
>   -Wl,--no-entry \
>   -Wl,--export-all \
>   -Wl,--import-memory \
>   -Wl,--allow-undefined \
>   -Wl,-z,stack-size=$(STACK_SIZE) \
>   -nostdlib \
>   -O3 \
>   -o webcv.wasm \
>   src/webcv.c
