.RECIPEPREFIX = >

CC = clang

wasm:
> $(CC) \
>   --target=wasm32 \
>   -Wl,--no-entry \
>   -Wl,--export-all \
>   -Wl,--import-memory \
>   -Wl,--allow-undefined \
>   -Wall \
>   -Werror \
>   -nostdlib \
>   -O3 \
>   -o webcv.wasm \
>   src/webcv.c
