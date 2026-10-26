$SimulatorAppId = '2537590'

function Get-SteamRoot {
    $candidates = @(
        $env:STEAM_COMPAT_CLIENT_INSTALL_PATH,
        (Join-Path $HOME '.local/share/Steam'),
        (Join-Path $HOME '.steam/steam')
    )
    $root = $candidates | Where-Object { $_ -and (Test-Path -LiteralPath (Join-Path $_ 'steamapps/libraryfolders.vdf')) } | Select-Object -First 1
    if (-not $root) {
        throw 'Steam was not found. Set STEAM_COMPAT_CLIENT_INSTALL_PATH to the Steam root.'
    }
    return $root
}

function Get-SimulatorLibrary([string]$SteamRoot) {
    $folders = Get-Content -LiteralPath (Join-Path $SteamRoot 'steamapps/libraryfolders.vdf') -Raw
    $libraries = [regex]::Matches($folders, '"path"\s+"([^"]+)"') | ForEach-Object { $_.Groups[1].Value }
    $library = $libraries | Where-Object { Test-Path -LiteralPath (Join-Path $_ "steamapps/appmanifest_$SimulatorAppId.acf") } | Select-Object -First 1
    if (-not $library) {
        throw "Microsoft Flight Simulator 2024 (app $SimulatorAppId) is not installed in any Steam library."
    }
    return $library
}

function Get-SimulatorExe([string]$Library) {
    $appManifest = Get-Content -LiteralPath (Join-Path $Library "steamapps/appmanifest_$SimulatorAppId.acf") -Raw
    $installDir = [regex]::Match($appManifest, '"installdir"\s+"([^"]+)"').Groups[1].Value
    $exe = Join-Path $Library "steamapps/common/$installDir/FlightSimulator2024.exe"
    if (-not (Test-Path -LiteralPath $exe)) {
        throw "FlightSimulator2024.exe not found at $exe"
    }
    return $exe
}

function Get-CompatToolName([string]$SteamRoot) {
    $config = Get-Content -LiteralPath (Join-Path $SteamRoot 'config/config.vdf') -Raw
    foreach ($appId in @($SimulatorAppId, '0')) {
        $match = [regex]::Match($config, '"CompatToolMapping"[\s\S]*?"' + $appId + '"\s*\{\s*"name"\s+"([^"]*)"')
        if ($match.Success -and $match.Groups[1].Value) {
            return $match.Groups[1].Value
        }
    }
    throw 'No Proton is set for Microsoft Flight Simulator 2024 in Steam. Set MSFS2024_PROTON to the proton script.'
}

function Get-ProtonScript([string]$SteamRoot) {
    if ($env:MSFS2024_PROTON) {
        return $env:MSFS2024_PROTON
    }
    $toolName = Get-CompatToolName $SteamRoot
    $toolDirs = @((Join-Path $SteamRoot 'compatibilitytools.d'), '/usr/share/steam/compatibilitytools.d')
    $manifests = $toolDirs | Where-Object { Test-Path -LiteralPath $_ } |
        ForEach-Object { Get-ChildItem -Path $_ -Filter compatibilitytool.vdf -Recurse -Depth 1 -File }
    foreach ($manifest in $manifests) {
        $match = [regex]::Match((Get-Content -LiteralPath $manifest.FullName -Raw), '"' + [regex]::Escape($toolName) + '"\s*\{[^}]*"install_path"\s+"([^"]+)"')
        if ($match.Success) {
            $proton = Join-Path $manifest.DirectoryName $match.Groups[1].Value 'proton'
            if (Test-Path -LiteralPath $proton) {
                return (Resolve-Path -LiteralPath $proton).Path
            }
        }
    }
    throw "Proton '$toolName' was not found in compatibilitytools.d. Set MSFS2024_PROTON to its proton script."
}

function ConvertTo-WinePath([string]$Path) {
    return 'Z:' + $Path.Replace('/', '\')
}

function Invoke-PackageToolUnderProton([string]$PackageTool, [string]$ProjectFile, [string[]]$Arguments) {
    $steamRoot = Get-SteamRoot
    $library = Get-SimulatorLibrary $steamRoot
    $simulatorExe = Get-SimulatorExe $library
    $proton = Get-ProtonScript $steamRoot

    $toolDir = Join-Path ([System.IO.Path]::GetTempPath()) "fspackagetool-$PID"
    New-Item -ItemType Directory -Force -Path $toolDir | Out-Null
    $toolCopy = Join-Path $toolDir 'fspackagetool.exe'
    Copy-Item -LiteralPath $PackageTool -Destination $toolCopy -Force
    Set-Content -LiteralPath (Join-Path $toolDir 'fspackagetool_overrideExePath.txt') -Value (ConvertTo-WinePath $simulatorExe) -NoNewline

    $variables = [ordered]@{
        STEAM_COMPAT_DATA_PATH           = Join-Path $library "steamapps/compatdata/$SimulatorAppId"
        STEAM_COMPAT_CLIENT_INSTALL_PATH = $steamRoot
        SteamAppId                       = $SimulatorAppId
        SteamGameId                      = $SimulatorAppId
    }
    $previous = @{}
    foreach ($name in $variables.Keys) {
        $previous[$name] = [Environment]::GetEnvironmentVariable($name)
        [Environment]::SetEnvironmentVariable($name, $variables[$name])
    }
    Write-Host "==> fspackagetool under $proton"
    try {
        & $proton run $toolCopy (ConvertTo-WinePath $ProjectFile) @Arguments | Out-Host
        return $LASTEXITCODE
    }
    finally {
        foreach ($name in $variables.Keys) {
            [Environment]::SetEnvironmentVariable($name, $previous[$name])
        }
        Remove-Item -Recurse -Force -LiteralPath $toolDir -ErrorAction SilentlyContinue
    }
}
