param(
    [string]$PhpPath = 'C:\xampp\php\php.exe',
    [string]$MysqlPath = 'C:\xampp\mysql\bin\mysql.exe',
    [string]$DatabaseUser = 'root',
    [string]$DatabasePassword = ''
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$schemaPath = Join-Path $projectRoot 'database\schema.sql'

foreach ($requiredPath in @($PhpPath, $MysqlPath, $schemaPath)) {
    if (-not (Test-Path -LiteralPath $requiredPath)) {
        throw "Required path not found: $requiredPath"
    }
}

Push-Location $projectRoot
try {
    Write-Output 'Running JavaScript syntax checks...'
    npm run check:js

    Write-Output 'Running JavaScript tests...'
    npm test

    Write-Output 'Running PHP lint checks...'
    Get-ChildItem -Path src, public\api, tests -Recurse -Filter *.php | ForEach-Object {
        & $PhpPath -l $_.FullName
        if ($LASTEXITCODE -ne 0) {
            throw "PHP lint failed: $($_.FullName)"
        }
    }

    Write-Output 'Checking clean schema import...'
    $env:MYSQL_PWD = $DatabasePassword
    & $MysqlPath -u $DatabaseUser -e "DROP DATABASE IF EXISTS safesight360_qa_check; CREATE DATABASE safesight360_qa_check CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
    if ($LASTEXITCODE -ne 0) {
        throw 'Could not prepare temporary QA database. Confirm MySQL is running.'
    }

    Get-Content -LiteralPath $schemaPath -Raw | & $MysqlPath -u $DatabaseUser safesight360_qa_check
    if ($LASTEXITCODE -ne 0) {
        throw 'Clean schema import failed.'
    }

    & $MysqlPath -u $DatabaseUser -e "DROP DATABASE safesight360_qa_check;"

    Write-Output 'Running backend integration checks...'
    & $PhpPath (Join-Path $projectRoot 'tests\backend.integration.php')
    if ($LASTEXITCODE -ne 0) {
        throw 'Backend integration checks failed.'
    }

    Write-Output 'SafeSight360 QA release checks passed.'
}
finally {
    Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue
    Pop-Location
}
