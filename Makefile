www/webcv.wasm: src/webcv.c
	clang \
	--target=wasm32 \
	-Wl,--no-entry \
	-Wl,--export-all \
	-Wl,--import-memory \
	-Wl,--allow-undefined \
	-Wall \
	-Werror \
	-nostdlib \
	-Ofast \
	-o $@ \
	$^

webcv.wat: www/webcv.wasm
	wasm2wat $^ > $@
