# Crea la carpeta de una tarea nueva en spec/work/ a partir de _template.
# Uso:  ./spec/new-work.ps1 feature/auth-login
param(
    [Parameter(Mandatory = $true, HelpMessage = "Nombre de la rama, ej. feature/auth-login")]
    [string]$Branch
)

$ErrorActionPreference = "Stop"

$specDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$template = Join-Path $specDir "work\_template"
$folder   = $Branch -replace "/", "-"
$target   = Join-Path $specDir "work\$folder"

if (-not (Test-Path $template)) {
    Write-Error "No existe el template: $template"
}
if (Test-Path $target) {
    Write-Error "La carpeta ya existe: $target"
}

Copy-Item -Recurse $template $target
Write-Host "Creado: spec/work/$folder/ (spec.md · plan.md · tasks.md)"
Write-Host "Siguiente paso: git checkout -b $Branch"
