# Compila el helper gc-perf-sensors (sensores de GPU/CPU para el overlay de rendimiento) y deja en
# resources/ el .exe junto a sus DLLs y su .config (todo viaja como extraResources). Target .NET
# Framework 4.8 —incluido en Windows 10/11— compilado con el csc.exe que trae el propio Windows: ni
# el build ni el usuario necesitan el SDK de .NET moderno.
#
# Las librerias se descargan del NuGet a build/ (git-ignored) y se cachean, igual que hace
# build-controller-listen.ps1 con GameInput. Licencias en build/TERCEROS.txt, todas compatibles con
# la GPL-3.0 del repo.
#
# LibreHardwareMonitor 0.9.6 (feb-2026), NO 0.9.4. El motivo no es estar al dia: la 0.9.4 embebe el
# driver ring0 WinRing0, que Windows Defender marca desde septiembre de 2025 como
# VulnerableDriver:WinNT/Winring0.G y HackTool:Win32/Winring0, poniendo en cuarentena a las apps que
# lo cargan. La 0.9.6 lo cambio por PawnIO (modulos Pawn sandboxeados, embebidos como recursos
# LibreHardwareMonitor.Resources.PawnIo.*.bin). Verificado sobre los binarios: la 0.9.4 contiene las
# cadenas WinRing0.gz/WinRing0x64.gz y la 0.9.6 ninguna.
#
# El salto 0.9.4 -> 0.9.6 NO es cambiar un numero. Tres cosas cambian con el:
#   1. El paquete ya no trae lib/net472. Ahora hay ref/<tfm>/ (solo para compilar) y
#      runtimes/win-<arch>/lib/<tfm>/ (la implementacion real). Se compila contra el primero y se
#      envia el segundo.
#   2. Las dependencias pasaron de una (HidSharp) a seis mas transitivas: hay que enviarlas todas.
#   3. Sin binding redirects el .exe compila pero no arranca (ver native/gc-perf-sensors/App.config).
#
# PawnIO se instala aparte (https://pawnio.eu) y solo hace falta para la temperatura de CPU, que se
# lee de los MSR (anillo 0). Todo lo de GPU va por NVAPI/ADL y funciona sin el. Si falta, la app
# avisa con un enlace y esa unica metrica queda en «—»; ver src/main/perf-metrics/pawnio.ts.

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

$lhmVersion = "0.9.6"

# Se compila contra el ensamblado de REFERENCIA y se envia el de IMPLEMENTACION (especifico de
# arquitectura). Enviar el de referencia daria un TypeLoadException en runtime: no tiene codigo.
$lhmRef = Get-NugetLib "librehardwaremonitorlib" $lhmVersion "ref\net472\LibreHardwareMonitorLib.dll"
$lhmDll = Get-NugetLib "librehardwaremonitorlib" $lhmVersion "runtimes\win-x64\lib\net472\LibreHardwareMonitorLib.dll"

# Cierre de dependencias de LHM 0.9.6 para net472, con versiones FIJADAS. Se envia entero (aunque con
# solo GPU+CPU habilitados la carga perezosa de .NET no llegue a tocar algunas) porque el ahorro
# serian unos cientos de KB sobre un portable de 93 MB y el precio un FileNotFoundException en la
# maquina de otro usuario cuyo hardware si entre por esa rama.
#
# DOS EXCEPCIONES DELIBERADAS, que el .nuspec pide y aqui NO se envian:
#   - RAMSPDToolkit-NDD → lectura de SPD de la RAM por SMBus. Contiene las cadenas WinRing0 e
#     IWinRing0Driver: NO es el driver embebido (no hay .sys ni recurso .gz, solo una interfaz para
#     hablar con un WinRing0 que ya exista, muy distinto del LibreHardwareMonitor.Resources.WinRing0.gz
#     de la 0.9.4), pero enviarlo ensuciaria la comprobacion de mas abajo, que vale justamente por ser
#     tonta y sin matices.
#   - DiskInfoToolkit → informacion de discos, 903 KB.
# Las dos sirven a grupos que este helper NUNCA habilita: Program.cs pone IsGpuEnabled e IsCpuEnabled
# y nada mas, asi que ni el grupo de memoria ni el de almacenamiento llegan a abrirse. Verificado
# ejecutando el helper sin ellas, con y sin elevacion.
$deps = @(
    @{ id = "system.memory";                             version = "4.6.3";  lib = "lib\netstandard2.0\System.Memory.dll" },
    @{ id = "system.runtime.compilerservices.unsafe";    version = "6.1.2";  lib = "lib\netstandard2.0\System.Runtime.CompilerServices.Unsafe.dll" },
    @{ id = "system.numerics.vectors";                   version = "4.6.1";  lib = "lib\netstandard2.0\System.Numerics.Vectors.dll" },
    @{ id = "system.buffers";                            version = "4.6.1";  lib = "lib\netstandard2.0\System.Buffers.dll" },
    @{ id = "hidsharp";                                  version = "2.6.4";  lib = "lib\netstandard2.0\HidSharp.dll" },
    @{ id = "system.management";                         version = "10.0.2"; lib = "lib\netstandard2.0\System.Management.dll" },
    @{ id = "system.codedom";                            version = "10.0.2"; lib = "lib\netstandard2.0\System.CodeDom.dll" },
    @{ id = "system.threading.accesscontrol";            version = "10.0.3"; lib = "lib\netstandard2.0\System.Threading.AccessControl.dll" },
    @{ id = "system.security.accesscontrol";             version = "6.0.1";  lib = "lib\netstandard2.0\System.Security.AccessControl.dll" },
    @{ id = "system.security.principal.windows";         version = "5.0.0";  lib = "lib\netstandard2.0\System.Security.Principal.Windows.dll" }
)

# --- Compilacion con el csc de .NET Framework ------------------------------------------------------
$csc = Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $csc)) { Write-Error "No se encontro csc.exe de .NET Framework en $csc" }

# /platform:x64 (antes anycpu): la implementacion de LHM 0.9.6 es especifica de arquitectura y
# enviamos la de win-x64. Con anycpu el proceso podria arrancar como 32-bit y cargar una DLL x64 →
# BadImageFormatException. Fijarlo hace explicito lo que ya es cierto: el resto del portable es x64.
Write-Host "Compilando gc-perf-sensors con csc (.NET Framework 4.8, x64)..."
& $csc /nologo /target:exe /platform:x64 /optimize+ `
    /reference:"$lhmRef" `
    /out:"$outExe" `
    "$src"
if ($LASTEXITCODE -ne 0) { Write-Error "csc.exe fallo (codigo $LASTEXITCODE)" }

# Limpiar las DLLs de una build anterior ANTES de copiar. Todas las .dll de resources/ son de este
# helper (los otros helpers son .exe sueltos), asi que barrerlas es seguro — y necesario: sin esto,
# quien hubiera compilado con la lista vieja se quedaria con RAMSPDToolkit-NDD.dll suelta, que la
# comprobacion de WinRing0 rechaza y que el glob de electron-builder.yml se llevaria al portable.
Get-ChildItem $outDir -Filter *.dll -File | Remove-Item -Force

# El exe carga las DLLs desde su propia carpeta: viajan junto a el en resources/.
Copy-Item $lhmDll (Join-Path $outDir "LibreHardwareMonitorLib.dll") -Force
foreach ($dep in $deps) {
    $dll = Get-NugetLib $dep.id $dep.version $dep.lib
    Copy-Item $dll (Join-Path $outDir (Split-Path -Leaf $dep.lib)) -Force
}

# El .config con los binding redirects: SIN EL, el .exe compila pero no arranca (LHM referencia
# System.Memory 4.0.5.0 y el paquete envia 4.0.2.0). csc no lo genera; se mantiene a mano.
$appConfig = Join-Path $repoRoot "native\gc-perf-sensors\App.config"
if (-not (Test-Path $appConfig)) { Write-Error "Falta el App.config de los binding redirects: $appConfig" }
Copy-Item $appConfig "$outExe.config" -Force

# Red de seguridad del motivo de todo esto: que no se cuele WinRing0 en lo que enviamos.
$winring = Get-ChildItem $outDir -File | Where-Object { $_.Name -match '\.(exe|dll)$' } | Where-Object {
    [System.Text.Encoding]::ASCII.GetString([System.IO.File]::ReadAllBytes($_.FullName)) -match 'WinRing0'
}
if ($winring) { Write-Error "WinRing0 presente en: $($winring.Name -join ', '). El upgrade a PawnIO no surtio efecto." }

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

$dllCount = (Get-ChildItem $outDir -Filter *.dll -File).Count
Write-Host "OK: $outExe (+ $dllCount DLLs + .config, LHM $lhmVersion sin WinRing0) y $pmExe"
