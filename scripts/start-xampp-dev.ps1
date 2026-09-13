param(
    [ValidateRange(1024, 65535)]
    [int]$Port = 8080,

    [string]$DatabaseUser = 'root',

    [string]$DatabasePassword = '',

    [string]$PhpPath = 'C:\xampp\php\php.exe',

    [string]$MysqlPath = 'C:\xampp\mysql\bin\mysql.exe'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$schemaPath = Join-Path $projectRoot 'database\schema.sql'
$publicPath = Join-Path $projectRoot 'public'

foreach ($requiredPath in @($PhpPath, $MysqlPath, $schemaPath, $publicPath)) {
    if (-not (Test-Path -LiteralPath $requiredPath)) {
        throw "Required path not found: $requiredPath"
    }
}

$env:MYSQL_PWD = $DatabasePassword
try {
    & $MysqlPath -u $DatabaseUser -e "CREATE DATABASE IF NOT EXISTS safesight360 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
    if ($LASTEXITCODE -ne 0) {
        throw 'Could not create or connect to the safesight360 database. Confirm that XAMPP MySQL is running and the credentials are correct.'
    }

    $mysqlSchemaPath = ([IO.Path]::GetFullPath($schemaPath)).Replace('\', '/')
    & $MysqlPath -u $DatabaseUser safesight360 -e "source $mysqlSchemaPath"
    if ($LASTEXITCODE -ne 0) {
        throw 'The SafeSight360 database schema could not be imported.'
    }
}
finally {
    Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue
}

$env:APP_ENV = 'development'
$env:APP_DEBUG = 'true'
$env:DB_HOST = '127.0.0.1'
$env:DB_PORT = '3306'
$env:DB_NAME = 'safesight360'
$env:DB_USER = $DatabaseUser
$env:DB_PASSWORD = $DatabasePassword

Write-Output "SafeSight360 database is ready."
Write-Output "Open http://127.0.0.1:$Port"
Write-Output "Press Ctrl+C to stop the development server."

& $PhpPath -S "127.0.0.1:$Port" -t $publicPath

