# Compila el helper gc-perf-sensors (sensores de GPU/CPU para el overlay de rendimiento) y deja en
# resources/ el .exe junto a sus DLLs (LibreHardwareMonitorLib + HidSharp, que viajan como
# extraResources). Target .NET Framework 4.8 —incluido en Windows 10/11— compilado con el csc.exe
# que trae el propio Windows: ni el build ni el usuario necesitan el SDK de .NET moderno.
#
# Las librerias se descargan del NuGet a build/ (git-ignored) y se cachean, igual que hace
# build-controller-listen.ps1 con GameInput. Licencias: LibreHardwareMonitor MPL-2.0 y HidSharp
# Apache-2.0 (avisos en build/TERCEROS.txt), compatibles con la GPL-3.0 del repo.

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$src      = Join-Path $repoRoot "native\gc-perf-sensors\Program.cs"
$outDir   = Join-Path $repoRoot "resources"
$outExe   = Join-Path $outDir "gc-perf-sensors.exe"

if (-not (Test-Path $src)) { Write-Error "No existe el fuente: $src" }
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

# --- Librerias del NuGet en build/, cacheadas ------------------------------------------------------
$sdkDir = Join-Path $repoRoot "build\perf-sensors-sdk"

function Get-NugetLib([string]$package, [string]$version, [string]$libRelPath) {
    $pkgDir = Join-Path $sdkDir "$package.$version"
    $dll = Join-Path $pkgDir $libRelPath
    if (-not (Test-Path $dll)) {
        Write-Host "Descargando $package $version del NuGet..."
        New-Item -ItemType Directory -Force -Path $pkgDir | Out-Null
        $zip = Join-Path $pkgDir "$package.zip"
        $url = "https://api.nuget.org/v3-flatcontainer/$package/$version/$package.$version.nupkg"
        Invoke-WebRequest -Uri $url -OutFile $zip
        Expand-Archive -Path $zip -DestinationPath $pkgDir -Force
        if (-not (Test-Path $dll)) { Write-Error "No se encontro $libRelPath tras extraer $package" }
    }
    return $dll
}

$lhmDll = Get-NugetLib "librehardwaremonitorlib" "0.9.4" "lib\net472\LibreHardwareMonitorLib.dll"
$hidDll = Get-NugetLib "hidsharp" "2.1.0" "lib\net35\HidSharp.dll"

# --- Compilacion con el csc de .NET Framework ------------------------------------------------------
$csc = Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $csc)) { Write-Error "No se encontro csc.exe de .NET Framework en $csc" }

Write-Host "Compilando gc-perf-sensors con csc (.NET Framework 4.8)..."
& $csc /nologo /target:exe /platform:anycpu /optimize+ `
    /reference:"$lhmDll" `
    /out:"$outExe" `
    "$src"
if ($LASTEXITCODE -ne 0) { Write-Error "csc.exe fallo (codigo $LASTEXITCODE)" }

# El exe carga las DLLs desde su propia carpeta: viajan junto a el en resources/.
Copy-Item $lhmDll (Join-Path $outDir "LibreHardwareMonitorLib.dll") -Force
Copy-Item $hidDll (Join-Path $outDir "HidSharp.dll") -Force

# --- PresentMon (Intel, MIT): FPS reales por ETW ---------------------------------------------------
# No se compila: se descarga el binario oficial del release de GitHub (x64, ~0,9 MB) y se cachea.
#
# La 2.x es OBLIGATORIA, no un capricho de estar al dia: la 1.10 no contabiliza los frames que
# generan las tecnologias de multiplicacion (DLSS Frame Generation y equivalentes). Medido contra
# el overlay de Steam en RE Requiem con DLSS FG activo: la 1.10 reportaba ~19-61 fps (por debajo
# incluso de los 64 renderizados) mientras la 2.5.1 daba 133 fps, coincidiendo con los 128 que
# marcaba Steam como total con generacion de frames.
$pmVersion = "2.5.1"
$pmExe = Join-Path $outDir "gc-presentmon.exe"
$pmMarker = Join-Path $outDir "gc-presentmon.version"
$pmActual = if (Test-Path $pmMarker) { (Get-Content $pmMarker -Raw).Trim() } else { "" }
if ((-not (Test-Path $pmExe)) -or ($pmActual -ne $pmVersion)) {
    Write-Host "Descargando PresentMon $pmVersion..."
    $pmUrl = "https://github.com/GameTechDev/PresentMon/releases/download/v$pmVersion/PresentMon-$pmVersion-x64.exe"
    Invoke-WebRequest -Uri $pmUrl -OutFile $pmExe
    Set-Content -Path $pmMarker -Value $pmVersion -Encoding ascii
}

Write-Host "OK: $outExe (+ LibreHardwareMonitorLib.dll, HidSharp.dll) y $pmExe"
