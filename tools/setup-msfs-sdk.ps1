param(
    [Parameter(Mandatory)]
    [string]$Url,

    [string]$Sha256 = ''
)

$ErrorActionPreference = 'Stop'

if (-not $env:RUNNER_TEMP) {
    throw 'RUNNER_TEMP is required; this script is intended for CI runners.'
}

$workDir = Join-Path $env:RUNNER_TEMP "msfs-sdk-$([guid]::NewGuid().ToString('N'))"
$archive = Join-Path $workDir 'msfs-sdk.zip'
$sdkRoot = Join-Path $workDir 'sdk'
New-Item -ItemType Directory -Path $sdkRoot -Force | Out-Null

Write-Host 'Downloading MSFS 2024 SDK archive...'
Invoke-WebRequest -Uri $Url -OutFile $archive

if ($Sha256) {
    $expected = $Sha256.Trim().ToLowerInvariant()
    $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash.ToLowerInvariant()
    if ($actual -ne $expected) {
        throw "MSFS SDK archive SHA-256 mismatch. Expected $expected, got $actual."
    }
    Write-Host 'MSFS SDK archive SHA-256 verified.'
}

Expand-Archive -LiteralPath $archive -DestinationPath $sdkRoot

# The commbus build needs the WASM toolchain (clang + wasi sysroot) and the
# command-line package tool.
$requiredPaths = @(
    'WASM/llvm/bin/clang++.exe',
    'WASM/wasi-sysroot',
    'Tools/bin/fspackagetool.exe'
)
$missing = $requiredPaths | Where-Object {
    -not (Test-Path -LiteralPath (Join-Path $sdkRoot $_))
}
if ($missing) {
    throw "Invalid MSFS 2024 SDK archive. Missing:`n$($missing -join "`n")"
}

"MSFS2024_SDK=$sdkRoot" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
Write-Host "MSFS 2024 SDK ready at $sdkRoot"
