#!/bin/bash
#
# Script para compilar ViennaRNA a WebAssembly usando Emscripten
#
# Requisitos:
# 1. Emscripten SDK instalado (https://emscripten.org/docs/getting_started/downloads.html)
# 2. Ejecutar: source /path/to/emsdk/emsdk_env.sh
# 3. ViennaRNA source code descargado
#
# Uso:
#   ./build-wasm.sh [--clean] [--debug]
#

set -e

# ============================================================================
# CONFIGURACIÓN
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$PROJECT_DIR/build"
WASM_DIR="$PROJECT_DIR/wasm"
VIENNA_VERSION="2.6.4"
VIENNA_URL="https://www.tbi.univie.ac.at/RNA/download/sourcecode/2_6_x/ViennaRNA-${VIENNA_VERSION}.tar.gz"
VIENNA_SRC="$BUILD_DIR/ViennaRNA-${VIENNA_VERSION}"

# Flags de compilación
EMCC_FLAGS=(
    -O3
    -s WASM=1
    -s MODULARIZE=1
    -s EXPORT_NAME="ViennaRNA"
    -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","allocate","intArrayFromString","UTF8ToString"]'
    -s ALLOW_MEMORY_GROWTH=1
    -s INITIAL_MEMORY=33554432  # 32MB
    -s MAXIMUM_MEMORY=536870912 # 512MB
    -s NO_EXIT_RUNTIME=1
    -s FILESYSTEM=0
    -s ENVIRONMENT='web,worker'
    --no-entry
)

# Funciones a exportar
EXPORTED_FUNCTIONS=(
    "_vrna_fold"
    "_vrna_pf_fold"
    "_vrna_bpp"
    "_vrna_mfe"
    "_vrna_eval_structure"
    "_vrna_free"
    "_malloc"
    "_free"
)

DEBUG_MODE=0
CLEAN_BUILD=0

# ============================================================================
# PARSEAR ARGUMENTOS
# ============================================================================

while [[ $# -gt 0 ]]; do
    case $1 in
        --clean)
            CLEAN_BUILD=1
            shift
            ;;
        --debug)
            DEBUG_MODE=1
            shift
            ;;
        *)
            echo "Argumento desconocido: $1"
            exit 1
            ;;
    esac
done

# ============================================================================
# FUNCIONES AUXILIARES
# ============================================================================

log_info() {
    echo -e "\033[0;32m[INFO]\033[0m $1"
}

log_warn() {
    echo -e "\033[0;33m[WARN]\033[0m $1"
}

log_error() {
    echo -e "\033[0;31m[ERROR]\033[0m $1"
}

check_emscripten() {
    if ! command -v emcc &> /dev/null; then
        log_error "Emscripten (emcc) no encontrado."
        log_error "Instálalo desde: https://emscripten.org/docs/getting_started/downloads.html"
        log_error "Y ejecuta: source /path/to/emsdk/emsdk_env.sh"
        exit 1
    fi
    log_info "Emscripten encontrado: $(emcc --version | head -1)"
}

download_vienna() {
    if [[ ! -d "$VIENNA_SRC" ]]; then
        log_info "Descargando ViennaRNA ${VIENNA_VERSION}..."
        mkdir -p "$BUILD_DIR"
        cd "$BUILD_DIR"
        
        if command -v curl &> /dev/null; then
            curl -L -o "ViennaRNA-${VIENNA_VERSION}.tar.gz" "$VIENNA_URL"
        elif command -v wget &> /dev/null; then
            wget -O "ViennaRNA-${VIENNA_VERSION}.tar.gz" "$VIENNA_URL"
        else
            log_error "Se necesita curl o wget para descargar ViennaRNA"
            exit 1
        fi
        
        tar -xzf "ViennaRNA-${VIENNA_VERSION}.tar.gz"
        rm "ViennaRNA-${VIENNA_VERSION}.tar.gz"
        log_info "ViennaRNA descargado y extraído"
    else
        log_info "ViennaRNA ya existe en $VIENNA_SRC"
    fi
}

configure_vienna() {
    log_info "Configurando ViennaRNA para Emscripten..."
    cd "$VIENNA_SRC"
    
    # Limpiar si es necesario
    if [[ $CLEAN_BUILD -eq 1 ]]; then
        make distclean 2>/dev/null || true
    fi
    
    # Configurar con Emscripten
    emconfigure ./configure \
        --without-perl \
        --without-python \
        --without-forester \
        --without-kinfold \
        --without-rnalocmin \
        --without-gsl \
        --without-doc \
        --disable-lto \
        --disable-c11 \
        --disable-sse \
        --disable-openmp \
        CFLAGS="-O3 -fPIC" \
        CXXFLAGS="-O3 -fPIC"
}

build_vienna() {
    log_info "Compilando ViennaRNA con Emscripten..."
    cd "$VIENNA_SRC"
    
    # Solo compilar la librería core
    cd src/ViennaRNA
    emmake make -j$(nproc 2>/dev/null || echo 4) libRNA.la
    
    log_info "ViennaRNA compilado"
}

create_wrapper() {
    log_info "Creando wrapper C para WASM..."
    
    cat > "$BUILD_DIR/vienna_wrapper.c" << 'EOF'
/**
 * Wrapper C para exponer funciones de ViennaRNA a WebAssembly
 */

#include <stdlib.h>
#include <string.h>
#include <ViennaRNA/fold.h>
#include <ViennaRNA/part_func.h>
#include <ViennaRNA/utils/basic.h>

// Estructura para retornar resultados
typedef struct {
    char *structure;
    float mfe;
    float *bpp;
    int length;
} FoldResult;

// Cache de último resultado para evitar memory leaks
static FoldResult last_result = {NULL, 0.0f, NULL, 0};

void free_last_result() {
    if (last_result.structure) {
        free(last_result.structure);
        last_result.structure = NULL;
    }
    if (last_result.bpp) {
        free(last_result.bpp);
        last_result.bpp = NULL;
    }
}

// Plegado MFE
float rna_fold(const char *sequence, char *structure) {
    float mfe;
    mfe = vrna_fold(sequence, structure);
    return mfe;
}

// Plegado con función de partición
float rna_pf_fold(const char *sequence, char *structure) {
    vrna_ep_t *pl;
    float free_energy;
    
    free_energy = vrna_pf_fold(sequence, structure, &pl);
    free(pl);
    
    return free_energy;
}

// Wrapper completo que retorna puntero a estructura de resultado
FoldResult* fold_complete(const char *sequence) {
    int n = strlen(sequence);
    
    free_last_result();
    
    last_result.structure = (char*)malloc(n + 1);
    last_result.length = n;
    
    // Plegado MFE
    last_result.mfe = vrna_fold(sequence, last_result.structure);
    
    return &last_result;
}

// Getters para acceder a los resultados desde JS
const char* get_structure(FoldResult *result) {
    return result->structure;
}

float get_mfe(FoldResult *result) {
    return result->mfe;
}

int get_length(FoldResult *result) {
    return result->length;
}

// Limpieza
void free_result(FoldResult *result) {
    // No hacemos nada aquí porque reutilizamos last_result
}

// Allocar memoria para secuencia
char* allocate_sequence(int length) {
    return (char*)malloc(length + 1);
}

void free_sequence(char *ptr) {
    free(ptr);
}

// Evaluar energía de una estructura dada
float eval_structure(const char *sequence, const char *structure) {
    return vrna_eval_structure_simple(sequence, structure);
}
EOF

    log_info "Wrapper creado"
}

compile_wasm() {
    log_info "Compilando a WebAssembly..."
    
    mkdir -p "$WASM_DIR"
    
    # Construir lista de funciones exportadas
    EXPORT_STR=""
    for func in "${EXPORTED_FUNCTIONS[@]}"; do
        EXPORT_STR="${EXPORT_STR},'${func}'"
    done
    EXPORT_STR="[${EXPORT_STR:1}]"
    
    # Flags de debug si es necesario
    if [[ $DEBUG_MODE -eq 1 ]]; then
        EMCC_FLAGS+=(-g -s ASSERTIONS=2 -s SAFE_HEAP=1)
    fi
    
    # Compilar
    emcc \
        "$BUILD_DIR/vienna_wrapper.c" \
        "$VIENNA_SRC/src/ViennaRNA/.libs/libRNA.a" \
        -I"$VIENNA_SRC/src" \
        "${EMCC_FLAGS[@]}" \
        -s EXPORTED_FUNCTIONS="$EXPORT_STR" \
        -o "$WASM_DIR/vienna_rna.js"
    
    log_info "WASM compilado exitosamente"
    log_info "Archivos generados:"
    ls -lh "$WASM_DIR"/vienna_rna.*
}

create_typescript_loader() {
    log_info "Creando loader TypeScript..."
    
    cat > "$PROJECT_DIR/src/wasm-loader.ts" << 'EOF'
/**
 * Loader para el módulo WASM de ViennaRNA
 * Auto-generado por build-wasm.sh
 */

export interface ViennaRNAModule {
    ccall: (name: string, returnType: string, argTypes: string[], args: any[]) => any;
    cwrap: (name: string, returnType: string, argTypes: string[]) => Function;
    allocate: (data: number[], type: string, where: number) => number;
    UTF8ToString: (ptr: number) => string;
    _malloc: (size: number) => number;
    _free: (ptr: number) => void;
    HEAPU8: Uint8Array;
    HEAPF32: Float32Array;
    memory: WebAssembly.Memory;
}

let moduleInstance: ViennaRNAModule | null = null;
let modulePromise: Promise<ViennaRNAModule> | null = null;

export async function loadViennaRNAModule(): Promise<ViennaRNAModule> {
    if (moduleInstance) {
        return moduleInstance;
    }
    
    if (modulePromise) {
        return modulePromise;
    }
    
    modulePromise = (async () => {
        // @ts-ignore - Importación dinámica del módulo generado por Emscripten
        const ViennaRNA = await import('../wasm/vienna_rna.js');
        moduleInstance = await ViennaRNA.default();
        return moduleInstance;
    })();
    
    return modulePromise;
}

export function getViennaRNAModule(): ViennaRNAModule | null {
    return moduleInstance;
}
EOF

    log_info "Loader TypeScript creado"
}

# ============================================================================
# MAIN
# ============================================================================

main() {
    log_info "=== Build ViennaRNA WebAssembly ==="
    log_info "Directorio del proyecto: $PROJECT_DIR"
    
    # Verificar Emscripten
    check_emscripten
    
    # Limpiar si es necesario
    if [[ $CLEAN_BUILD -eq 1 ]]; then
        log_info "Limpiando build anterior..."
        rm -rf "$BUILD_DIR" "$WASM_DIR"
    fi
    
    # Descargar ViennaRNA
    download_vienna
    
    # Configurar
    configure_vienna
    
    # Compilar ViennaRNA
    build_vienna
    
    # Crear wrapper
    create_wrapper
    
    # Compilar a WASM
    compile_wasm
    
    # Crear loader TypeScript
    create_typescript_loader
    
    log_info "=== Build completado exitosamente ==="
    log_info ""
    log_info "Para usar el módulo WASM:"
    log_info "  1. Importa desde src/wasm-loader.ts"
    log_info "  2. O usa la clase ViennaRNAEngine de src/index.ts"
    log_info ""
    log_info "Archivos generados:"
    log_info "  - wasm/vienna_rna.wasm"
    log_info "  - wasm/vienna_rna.js"
}

main
