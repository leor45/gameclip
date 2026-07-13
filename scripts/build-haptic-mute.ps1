# Compila el helper nativo gc-app-audio-mute con MSVC y deja el .exe en resources/.
#
# Requiere las Build Tools de Visual Studio (C++). Funciona tanto desde un "Developer Command
# Prompt" (cl.exe ya en PATH) como desde una PowerShell normal (localiza VS con vswhere e importa
# el entorno de vcvars). El binario resultante se commitea como artefacto reproducible.

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$src      = Join-Path $repoRoot "native\app-audio-mute\main.cpp"
$outDir   = Join-Path $repoRoot "resources"
$outExe   = Join-Path $outDir "gc-app-audio-mute.exe"

if (-not (Test-Path $src)) { Write-Error "No existe el fuente: $src" }
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

# Localiza cl.exe: si ya está en PATH, se usa; si no, se importa el entorno de vcvars vía vswhere.
$cl = Get-Command cl.exe -ErrorAction SilentlyContinue
if (-not $cl) {
    $vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
    if (Test-Path $vswhere) {
        $vsPath = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
        $vcvars = if ($vsPath) { Join-Path $vsPath "VC\Auxiliary\Build\vcvars64.bat" } else { $null }
        if ($vcvars -and (Test-Path $vcvars)) {
            # Importa las variables de entorno que deja vcvars64.bat a esta sesión de PowerShell.
            cmd /c "`"$vcvars`" && set" | ForEach-Object {
                if ($_ -match "^([^=]+)=(.*)$") { Set-Item -Path "env:$($matches[1])" -Value $matches[2] }
            }
            $cl = Get-Command cl.exe -ErrorAction SilentlyContinue
        }
    }
}

if ($cl) {
    Write-Host "Compilando gc-app-audio-mute con MSVC..."
    & cl.exe /nologo /std:c++17 /EHsc /O1 /MT /W3 `
        "$src" `
        /Fe:"$outExe" `
        /link ole32.lib
    if ($LASTEXITCODE -ne 0) { Write-Error "cl.exe falló (código $LASTEXITCODE)" }
    # Limpieza de los intermedios que deja cl (.obj).
    Get-ChildItem -Path (Get-Location) -Filter "main.obj" -ErrorAction SilentlyContinue | Remove-Item -Force
}
else {
    # Fallback: MinGW-w64 g++ (soporta __uuidof). Se busca en PATH y, si no, en la instalación de
    # WinLibs por winget y en rutas típicas (MinGW/MSYS2), para no depender de un PATH refrescado.
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
    # -static: enlaza libgcc/libstdc++/winpthread dentro del .exe para que funcione en una máquina
    # limpia (sin las DLLs del runtime de MinGW). -municode para que el entry point sea wmain.
    Write-Host "Compilando gc-app-audio-mute con g++ (MinGW): $gppExe"
    & $gppExe -std=c++17 -O2 -municode -static -static-libgcc -static-libstdc++ `
        -o "$outExe" "$src" -lole32
    if ($LASTEXITCODE -ne 0) { Write-Error "g++ falló (código $LASTEXITCODE)" }
}

Write-Host "OK: $outExe"
