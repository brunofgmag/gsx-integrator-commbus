set(CMAKE_SYSTEM_NAME Generic)
set(CMAKE_SYSTEM_PROCESSOR wasm32)

if(DEFINED ENV{MSFS2024_SDK})
    file(TO_CMAKE_PATH "$ENV{MSFS2024_SDK}" MSFS_SDK)
elseif(DEFINED ENV{MSFS_SDK})
    file(TO_CMAKE_PATH "$ENV{MSFS_SDK}" MSFS_SDK)
else()
    message(FATAL_ERROR "Missing MSFS or MSFS 2024 SDK.")
endif()
set(MSFS_SDK "${MSFS_SDK}" CACHE PATH "Path to MSFS 2024 SDK")

find_program(MSFS_CLANGXX
    NAMES clang++ clang++.exe clang-cl clang-cl.exe
    PATHS "${MSFS_SDK}/WASM/llvm/bin" "${MSFS_SDK}/WASM/bin"
    NO_DEFAULT_PATH)
if(NOT MSFS_CLANGXX)
    find_program(MSFS_CLANGXX NAMES clang++ clang++.exe clang-cl clang-cl.exe)
endif()

find_program(MSFS_CLANG
    NAMES clang clang.exe clang-cl clang-cl.exe
    PATHS "${MSFS_SDK}/WASM/llvm/bin" "${MSFS_SDK}/WASM/bin"
    NO_DEFAULT_PATH)
if(NOT MSFS_CLANG)
    find_program(MSFS_CLANG NAMES clang clang.exe clang-cl clang-cl.exe)
endif()

if(NOT MSFS_CLANGXX)
    message(FATAL_ERROR "Missing MSFS CLang.")
endif()

set(CMAKE_C_COMPILER   "${MSFS_CLANG};--driver-mode=gcc")
set(CMAKE_CXX_COMPILER "${MSFS_CLANGXX};--driver-mode=g++")

find_program(MSFS_LLVM_AR
    NAMES llvm-ar llvm-ar.exe
    PATHS "${MSFS_SDK}/WASM/llvm/bin" "${MSFS_SDK}/WASM/bin"
    NO_DEFAULT_PATH)
if(MSFS_LLVM_AR)
    set(CMAKE_AR "${MSFS_LLVM_AR}" CACHE FILEPATH "llvm-ar do MSFS SDK")
endif()

set(CMAKE_C_COMPILER_TARGET   wasm32-unknown-wasi)
set(CMAKE_CXX_COMPILER_TARGET wasm32-unknown-wasi)
set(CMAKE_SYSROOT "${MSFS_SDK}/WASM/wasi-sysroot")

set(CMAKE_TRY_COMPILE_TARGET_TYPE STATIC_LIBRARY)

if(NOT CMAKE_MAKE_PROGRAM)
    find_program(NINJA_PROG
        NAMES ninja ninja.exe
        PATHS "$ENV{LOCALAPPDATA}/Programs/CLion/bin/ninja/win/x64")
    if(NINJA_PROG)
        set(CMAKE_MAKE_PROGRAM "${NINJA_PROG}" CACHE FILEPATH "ninja")
    endif()
endif()

execute_process(
    COMMAND "${MSFS_CLANGXX}" --driver-mode=g++ --print-resource-dir
    OUTPUT_VARIABLE _CLANG_RESOURCE_DIR
    OUTPUT_STRIP_TRAILING_WHITESPACE
    ERROR_QUIET
)

if(_CLANG_RESOURCE_DIR)
    set(_RT_SRC "${MSFS_SDK}/WASM/wasi-sysroot/lib/wasm32-wasi/libclang_rt.builtins-wasm32.a")
    set(_RT_DST_DIR "${_CLANG_RESOURCE_DIR}/lib/wasi")
    set(_RT_DST "${_RT_DST_DIR}/libclang_rt.builtins-wasm32.a")
    if(EXISTS "${_RT_SRC}" AND NOT EXISTS "${_RT_DST}")
        file(MAKE_DIRECTORY "${_RT_DST_DIR}")
        file(COPY_FILE "${_RT_SRC}" "${_RT_DST}")
        message(STATUS "libclang_rt: copiado para ${_RT_DST}")
    endif()
endif()

set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_PACKAGE ONLY)
