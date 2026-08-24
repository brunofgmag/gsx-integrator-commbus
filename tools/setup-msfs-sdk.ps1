param(
    [Parameter(Mandatory)]
    [string]$Url,

    [string]$Sha256 = '',

    [string]$CacheDir = $env:MSFS_SDK_CACHE_DIR,

    [int]$Attempts = 5
)

$ErrorActionPreference = 'Stop'

function Get-ArchiveHash
{
    param([string]$Path)

    return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
}

function Test-Archive
{
    param([string]$Path, [string]$Expected)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf))
    {
        return $false
    }

    if (-not $Expected)
    {
        return (Get-Item -LiteralPath $Path).Length -gt 0
    }

    return (Get-ArchiveHash -Path $Path) -eq $Expected
}

function Save-Archive
{
    param([string]$Url, [string]$Destination, [int]$Attempts)

    $curl = (Get-Command curl.exe -ErrorAction SilentlyContinue).Source
    $previousSize = -1

    for ($attempt = 1; $attempt -le $Attempts; $attempt++)
    {
        try
        {
            if ($curl)
            {
                & $curl --location --fail --silent --show-error --continue-at - --output $Destination $Url
                if ($LASTEXITCODE -ne 0)
                {
                    throw "curl exited with $LASTEXITCODE."
                }
            }
            else
            {
                Invoke-WebRequest -Uri $Url -OutFile $Destination
            }

            return
        }
        catch
        {
            $size = if (Test-Path -LiteralPath $Destination) { (Get-Item -LiteralPath $Destination).Length } else { 0 }
            Write-Host "MSFS SDK download attempt $attempt of $Attempts stopped at $size bytes: $($_.Exception.Message)"

            if ($size -le $previousSize)
            {
                Write-Host 'No progress since the previous attempt; discarding the partial file and starting over.'
                Remove-Item -LiteralPath $Destination -Force -ErrorAction SilentlyContinue
                $size = 0
            }

            $previousSize = $size

            if ($attempt -eq $Attempts)
            {
                throw
            }

            Start-Sleep -Seconds ([math]::Min(30, [math]::Pow(2, $attempt)))
        }
    }
}

if (-not $env:RUNNER_TEMP)
{
    throw 'RUNNER_TEMP is required; this script is intended for CI runners.'
}

$expected = if ($Sha256) { $Sha256.Trim().ToLowerInvariant() } else { '' }

$archiveDir = if ($CacheDir) { $CacheDir } else { Join-Path $env:RUNNER_TEMP "msfs-sdk-$([guid]::NewGuid().ToString('N'))" }
New-Item -ItemType Directory -Path $archiveDir -Force | Out-Null
$archive = Join-Path $archiveDir 'msfs-sdk.zip'
$partial = "$archive.part"

if (Test-Archive -Path $archive -Expected $expected)
{
    Write-Host "MSFS SDK archive reused from $archiveDir."
}
else
{
    if (Test-Path -LiteralPath $archive)
    {
        Write-Host 'Cached MSFS SDK archive does not match the expected hash; discarding it.'
        Remove-Item -LiteralPath $archive -Force
    }

    Write-Host 'Downloading MSFS SDK archive...'
    Save-Archive -Url $Url -Destination $partial -Attempts $Attempts

    if (-not (Test-Archive -Path $partial -Expected $expected))
    {
        $actual = Get-ArchiveHash -Path $partial
        Remove-Item -LiteralPath $partial -Force
        throw "MSFS SDK archive SHA-256 mismatch. Expected $expected, got $actual."
    }

    if ($expected)
    {
        Write-Host 'MSFS SDK archive SHA-256 verified.'
    }

    Move-Item -LiteralPath $partial -Destination $archive -Force
}

$sdkRoot = Join-Path $env:RUNNER_TEMP "msfs-sdk-$([guid]::NewGuid().ToString('N'))/sdk"
New-Item -ItemType Directory -Path $sdkRoot -Force | Out-Null

Expand-Archive -LiteralPath $archive -DestinationPath $sdkRoot

# The commbus build needs the WASM toolchain (clang + wasi sysroot), the
# command-line package tool, and the EFB sample, whose efb_api and vendored
# msfs-sdk are what the EFB app is built against. The whole Samples tree is
# 4.9 GB; these two folders are 3.3 MB of it.
$requiredPaths = @(
    'WASM/llvm/bin/clang++.exe',
    'WASM/wasi-sysroot',
    'Tools/bin/fspackagetool.exe',
    'Samples/DevmodeProjects/EFB/PackageSources/efb_api',
    'Samples/DevmodeProjects/EFB/PackageSources/vendor'
)
$missing = $requiredPaths | Where-Object {
    -not (Test-Path -LiteralPath (Join-Path $sdkRoot $_))
}
if ($missing)
{
    throw "Invalid MSFS 2024 SDK archive. Missing:`n$($missing -join "`n")"
}

if ($env:GITHUB_ENV)
{
    "MSFS2024_SDK=$sdkRoot" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
}

Write-Host "MSFS 2024 SDK ready at $sdkRoot"
