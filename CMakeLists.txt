cmake_minimum_required(VERSION 3.21)

project(gsx_integrator_commbus LANGUAGES CXX)

set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

set(MODULE_NAME "gsx-integrator-commbus")

if (NOT CMAKE_CXX_COMPILER_TARGET STREQUAL "wasm32-unknown-wasi")
    message(FATAL_ERROR
            "MSFS Toolchain not found:\n"
            "Use -DCMAKE_TOOLCHAIN_FILE=${CMAKE_SOURCE_DIR}/cmake/wasi-msfs-toolchain.cmake.\n")
endif ()

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if (NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
    set(CMAKE_BUILD_TYPE Release CACHE STRING "" FORCE)
endif ()

if (DEFINED ENV{MSFS2024_SDK})
    file(TO_CMAKE_PATH "$ENV{MSFS2024_SDK}" MSFS_SDK)
elseif (DEFINED ENV{MSFS_SDK})
    file(TO_CMAKE_PATH "$ENV{MSFS_SDK}" MSFS_SDK)
else ()
    message(FATAL_ERROR "Missing MSFS or MSFS 2024 SDK.")
endif ()

set(SIMCONNECT_WASM_LIB "${MSFS_SDK}/SimConnect SDK/lib/wasm/SimConnect.a"
        CACHE FILEPATH "SimConnect static lib (WASM)")

set(MSFS_WASI_CXX_INCLUDE "${MSFS_SDK}/WASM/wasi-sysroot/include/c++/v1")
set(MSFS_WASI_INCLUDE "${MSFS_SDK}/WASM/wasi-sysroot/include")
set(MSFS_CLANG_RESOURCE_INCLUDE "${MSFS_SDK}/WASM/llvm/lib/clang/15.0.1/include")

add_executable(${MODULE_NAME}
        src/Main.cpp
        src/Bridge.cpp
        src/Bridge.h
        src/Logger.h
)

target_include_directories(${MODULE_NAME} PRIVATE
        "${MSFS_SDK}/WASM/include"
        "${MSFS_SDK}/SimConnect SDK/include"
        "${MSFS_SDK}/WASM/wasi-sysroot/include"
        "${MSFS_SDK}/WASM/wasi-sysroot/include/c++/v1"
)

target_compile_definitions(${MODULE_NAME} PRIVATE _MSFS_WASM=1)

target_compile_options(${MODULE_NAME} PRIVATE
        "-isystem${MSFS_WASI_CXX_INCLUDE}"
        "-isystem${MSFS_WASI_INCLUDE}"
        "-isystem${MSFS_CLANG_RESOURCE_INCLUDE}"
        -stdlib=libc++
        -fno-exceptions
        -ffunction-sections
        -fdata-sections
        -fvisibility=hidden
        -fno-stack-protector
        -fms-extensions
        -fwritable-strings
        -fstack-size-section
        -mbulk-memory
        -mllvm;-wasm-disable-redzone
        $<$<CONFIG:Debug>:-O0;-g;-fstandalone-debug>
        $<$<CONFIG:Release>:-O2;-flto;-DNDEBUG>
        $<$<CONFIG:RelWithDebInfo>:-O2;-g;-fstandalone-debug>
)

target_link_options(${MODULE_NAME} PRIVATE
        -stdlib=libc++
        -Wl,--no-entry
        -mexec-model=reactor
        -Wl,--export=module_init
        -Wl,--export=module_deinit
        -Wl,--export=malloc
        -Wl,--export=free
        -Wl,--export-table
        -Wl,--allow-undefined
        -Wl,--gc-sections
        $<$<CONFIG:Debug>:-g>
        $<$<CONFIG:RelWithDebInfo>:-g>
        $<$<CONFIG:Release>:-flto>
        $<$<CONFIG:Release>:-Wl,--strip-debug>
)

file(TO_CMAKE_PATH "${SIMCONNECT_WASM_LIB}" SIMCONNECT_WASM_LIB_NORMALIZED)

if(EXISTS "${SIMCONNECT_WASM_LIB}"
        AND NOT SIMCONNECT_WASM_LIB_NORMALIZED MATCHES "/SimConnect SDK/lib/static/"
        AND NOT SIMCONNECT_WASM_LIB_NORMALIZED MATCHES "/SimConnect SDK/lib/SimConnect\\.lib$")
    target_link_libraries(${MODULE_NAME} PRIVATE "${SIMCONNECT_WASM_LIB}")
else()
    message(STATUS "SimConnect WASM lib not found: ${SIMCONNECT_WASM_LIB}; using --allow-undefined for host imports.")
endif()

set_target_properties(${MODULE_NAME} PROPERTIES
        SUFFIX ".wasm"
        OUTPUT_NAME "${MODULE_NAME}"
        RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/PackageSources/modules"
)
