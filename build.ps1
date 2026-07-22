param(
    [ValidateSet('Debug', 'Release', 'RelWithDebInfo')]
    [string]$Config = 'Release',
    [string]$SdkRoot = '',
    [switch]$NoSim
)

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot

if (-not $SdkRoot) {
    $SdkRoot = if ($env:MSFS2024_SDK) { $env:MSFS2024_SDK } else { $env:MSFS_SDK }
}
if (-not $SdkRoot) {
    throw 'MSFS 2024 SDK not found. Set MSFS2024_SDK or pass -SdkRoot <path>.'
}
$env:MSFS2024_SDK = $SdkRoot

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

# Default: fspackagetool (compiles SPB, copies html_ui + modules).
# -NoSim: copy files + prebuilt SPB and generate manifest.json/layout.json
$Output = Join-Path $Root 'Packages\gsx-integrator-commbus'

if ($NoSim) {
    Write-Host "==> Packaging GSX Integrator CommBus Module (no simulator, prebuilt SPB)"
    $Spb = Join-Path $Root 'tools\prebuilt\gsx-integrator-commbus.spb'
    if (-not (Test-Path -LiteralPath $Spb)) {
        throw "Prebuilt SPB not found at $Spb. Build once locally with fspackagetool (./build.ps1 without -NoSim), then commit Packages/gsx-integrator-commbus/InGamePanels/gsx-integrator-commbus.spb to tools/prebuilt/."
    }

    Remove-Item -Recurse -Force -Path $Output -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force -Path (Join-Path $Output 'InGamePanels') | Out-Null
    Copy-Item -Recurse -Force (Join-Path $Root 'PackageSources\html_ui') (Join-Path $Output 'html_ui')
    Copy-Item -Recurse -Force (Join-Path $Root 'PackageSources\modules') (Join-Path $Output 'modules')
    Copy-Item -Force $Spb (Join-Path $Output 'InGamePanels\gsx-integrator-commbus.spb')

    $files = Get-ChildItem -Recurse -File -Path $Output |
        Sort-Object { $_.FullName.Substring($Output.Length + 1).ToLowerInvariant() }
    $content = @(foreach ($f in $files) {
        [ordered]@{
            path = $f.FullName.Substring($Output.Length + 1).Replace('\', '/').ToLowerInvariant()
            size = $f.Length
            date = $f.LastWriteTimeUtc.ToFileTimeUtc()
        }
    })
    $totalSize = ($files | Measure-Object -Property Length -Sum).Sum

    [xml]$Def = Get-Content -LiteralPath (Join-Path $Root 'PackageDefinitions\gsx-integrator-commbus.xml')
    $manifest = [ordered]@{
        dependencies                  = @()
        content_type                  = $Def.AssetPackage.ItemSettings.ContentType
        title                         = $Def.AssetPackage.ItemSettings.Title
        manufacturer                  = $Def.AssetPackage.ItemSettings.Manufacturer
        creator                       = $Def.AssetPackage.ItemSettings.Creator
        package_version               = $Def.AssetPackage.Version
        minimum_game_version          = '1.7.35'
        minimum_compatibility_version = '7.26.0.214'
        export_type                   = 'Community'
        builder                       = 'Microsoft Flight Simulator 2024'
        package_order_hint            = $Def.AssetPackage.PackageOrderHint
        release_notes                 = [ordered]@{ neutral = [ordered]@{ LastUpdate = ''; OlderHistory = '' } }
        total_package_size            = [string]$totalSize
    }
    $manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $Output 'manifest.json') -Encoding utf8NoBOM
    [ordered]@{ content = $content } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $Output 'layout.json') -Encoding utf8NoBOM
}
else {
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
}

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
