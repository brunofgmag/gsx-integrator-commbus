param(
    [ValidateSet('Debug', 'Release', 'RelWithDebInfo')]
    [string]$Config = 'Release',
    [string]$SdkRoot = ''
)

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot

# ---------------------------------------------------------------------------
# Resolve the MSFS 2024 SDK
# ---------------------------------------------------------------------------
if (-not $SdkRoot) {
    $SdkRoot = if ($env:MSFS2024_SDK) { $env:MSFS2024_SDK } else { $env:MSFS_SDK }
}
if (-not $SdkRoot) {
    throw 'MSFS 2024 SDK not found. Set MSFS2024_SDK or pass -SdkRoot <path>.'
}
# Make sure the CMake toolchain sees the SDK.
$env:MSFS2024_SDK = $SdkRoot

# ---------------------------------------------------------------------------
# 1) Build the WASM module (CMake + Ninja + wasi-msfs toolchain)
# ---------------------------------------------------------------------------
$cmakeCommand = Get-Command cmake -ErrorAction SilentlyContinue
if ($cmakeCommand) {
    $cmake = $cmakeCommand.Source
}
else {
    $cmakeCandidates = @(
        (Join-Path $env:ProgramFiles 'CMake\bin\cmake.exe'),
        (Join-Path $env:LOCALAPPDATA 'Programs\CLion\bin\cmake\win\x64\bin\cmake.exe')
    )
    $cmake = $cmakeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}
if (-not $cmake) {
    throw 'CMake was not found. Install CMake (and Ninja) or CLion.'
}

$preset = $Config.ToLowerInvariant()
Write-Host "==> Building WASM module (preset: $preset)"
& $cmake --preset $preset
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $cmake --build --preset $preset
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$Wasm = Join-Path $Root 'PackageSources\modules\gsx-integrator-commbus.wasm'
if (-not (Test-Path -LiteralPath $Wasm)) {
    throw "WASM module was not produced at $Wasm"
}
Write-Host "==> WASM built: $Wasm" -ForegroundColor Green

# ---------------------------------------------------------------------------
# 2) Assemble the package (fspackagetool: compiles SPB, copies html_ui + modules)
# ---------------------------------------------------------------------------
$RunningSimulator = Get-Process FlightSimulator2024 -ErrorAction SilentlyContinue
if ($RunningSimulator) {
    throw 'Close Microsoft Flight Simulator 2024 before running the command-line Package Tool.'
}

$PackageTool = Join-Path $SdkRoot 'Tools\bin\fspackagetool.exe'
if (-not (Test-Path -LiteralPath $PackageTool)) {
    throw "fspackagetool.exe not found at $PackageTool"
}

$ProjectFile = Join-Path $Root 'gsx-integrator-commbus.xml'
Write-Host "==> Packaging GSX Integrator CommBus Module"
& $PackageTool $ProjectFile -rebuild -mirroring -nopause
if ($LASTEXITCODE -ne 0) {
    throw "Package build failed (exit $LASTEXITCODE)."
}

$Output = Join-Path $Root 'Packages\gsx-integrator-commbus'
if (-not (Test-Path -LiteralPath $Output)) {
    throw "Expected package output was not created at $Output"
}

# Safety net: ensure the WASM is present in the built package (in case the
# 'modules' Copy asset group is not honored by the installed SDK version).
$PackagedModules = Join-Path $Output 'modules'
$PackagedWasm = Join-Path $PackagedModules 'gsx-integrator-commbus.wasm'
if (-not (Test-Path -LiteralPath $PackagedWasm)) {
    Write-Warning "WASM not found in package modules/. Copying manually and you may need to regenerate layout.json."
    New-Item -ItemType Directory -Force -Path $PackagedModules | Out-Null
    Copy-Item -LiteralPath $Wasm -Destination $PackagedWasm -Force
}

Write-Host "==> Package ready: $Output" -ForegroundColor Green
