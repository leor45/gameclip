# Compila el helper nativo gc-controller-listen con MSVC (o g++ MinGW de fallback) y deja el .exe en
# resources/. Descarga la cabecera de GameInput del NuGet Microsoft.GameInput a build/ (git-ignored)
# —no se vendoriza: GameClip es GPL-3.0 y la licencia del redistribuible de Microsoft no permite
# redistribuir su fuente bajo copyleft—. El .exe enlaza GameInput dinámicamente en runtime.

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$src      = Join-Path $repoRoot "native\gc-controller-listen\main.cpp"
$outDir   = Join-Path $repoRoot "resources"
$outExe   = Join-Path $outDir "gc-controller-listen.exe"

if (-not (Test-Path $src)) { Write-Error "No existe el fuente: $src" }
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

# --- Cabecera de GameInput (NuGet) en build/, cacheada ---------------------------------------------
$giVersion = "3.3.221"
$sdkDir    = Join-Path $repoRoot "build\gameinput-sdk"
$giInclude = Join-Path $sdkDir "native\include"
$giHeader  = Join-Path $giInclude "GameInput.h"
if (-not (Test-Path $giHeader)) {
    Write-Host "Descargando cabecera de GameInput ($giVersion) del NuGet..."
    New-Item -ItemType Directory -Force -Path $sdkDir | Out-Null
    $zip = Join-Path $sdkDir "microsoft.gameinput.zip"
    $url = "https://api.nuget.org/v3-flatcontainer/microsoft.gameinput/$giVersion/microsoft.gameinput.$giVersion.nupkg"
    Invoke-WebRequest -Uri $url -OutFile $zip
    Expand-Archive -Path $zip -DestinationPath $sdkDir -Force
    if (-not (Test-Path $giHeader)) { Write-Error "No se encontró GameInput.h tras extraer el NuGet" }
}

# --- Compilación -----------------------------------------------------------------------------------
# Localiza cl.exe: si ya está en PATH, se usa; si no, se importa el entorno de vcvars vía vswhere.
$cl = Get-Command cl.exe -ErrorAction SilentlyContinue
if (-not $cl) {
    $vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
    if (Test-Path $vswhere) {
        $vsPath = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
        $vcvars = if ($vsPath) { Join-Path $vsPath "VC\Auxiliary\Build\vcvars64.bat" } else { $null }
        if ($vcvars -and (Test-Path $vcvars)) {
            cmd /c "`"$vcvars`" && set" | ForEach-Object {
                if ($_ -match "^([^=]+)=(.*)$") { Set-Item -Path "env:$($matches[1])" -Value $matches[2] }
            }
            $cl = Get-Command cl.exe -ErrorAction SilentlyContinue
        }
    }
}

if ($cl) {
    Write-Host "Compilando gc-controller-listen con MSVC..."
    & cl.exe /nologo /std:c++17 /EHsc /O1 /MT /W3 `
        /I"$giInclude" `
        "$src" `
        /Fe:"$outExe" `
        /link hid.lib setupapi.lib ole32.lib
    if ($LASTEXITCODE -ne 0) { Write-Error "cl.exe falló (código $LASTEXITCODE)" }
    Get-ChildItem -Path (Get-Location) -Filter "main.obj" -ErrorAction SilentlyContinue | Remove-Item -Force
}
else {
    # Fallback: MinGW-w64 g++. Se busca en PATH y, si no, en la instalación de WinLibs por winget y
    # en rutas típicas (MinGW/MSYS2), para no depender de un PATH refrescado.
    $gppExe = (Get-Command g++.exe -ErrorAction SilentlyContinue).Source
    if (-not $gppExe) {
        $candidatos = @(
            (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages\BrechtSanders.WinLibs*\mingw64\bin\g++.exe'),
            'C:\mingw64\bin\g++.exe',
            'C:\msys64\mingw64\bin\g++.exe'
        )
        $gppExe = $candidatos |
            ForEach-Object { Get-ChildItem $_ -ErrorAction SilentlyContinue } |
            Select-Object -First 1 -ExpandProperty FullName
    }
    if (-not $gppExe) {
        Write-Error "No se encontró ni MSVC (cl.exe/vswhere) ni g++ (MinGW). Instala uno de los dos para compilar el helper."
    }
    # -static: enlaza libgcc/libstdc++/winpthread dentro del .exe (para máquina limpia). GameInput por
    # carga dinámica: no se enlaza su .lib. -municode para que el entry point sea main con args ANSI.
    Write-Host "Compilando gc-controller-listen con g++ (MinGW): $gppExe"
    & $gppExe -std=c++17 -O2 -static -static-libgcc -static-libstdc++ `
        -I"$giInclude" `
        -o "$outExe" "$src" -lhid -lsetupapi -lole32
    if ($LASTEXITCODE -ne 0) { Write-Error "g++ falló (código $LASTEXITCODE)" }
}

Write-Host "OK: $outExe"
