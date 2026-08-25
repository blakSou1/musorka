# Лёгкий локальный HTTP-сервер для сайта.
# Запуск: powershell -NoProfile -ExecutionPolicy Bypass -File server.ps1
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 8000
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
try {
    $listener.Start()
} catch {
    Write-Host "Не удалось запустить сервер: $_"
    Read-Host "Нажмите Enter для выхода"
    exit 1
}

Write-Host ""
Write-Host "  Сервер запущен:  http://localhost:$port"
Write-Host "  Остановка: Ctrl+C"
Write-Host ""

function Get-MimeType([string]$ext) {
    switch ($ext.ToLower()) {
        '.html' { return 'text/html; charset=utf-8' }
        '.css'  { return 'text/css; charset=utf-8' }
        '.js'   { return 'text/javascript; charset=utf-8' }
        '.json' { return 'application/json' }
        '.png'  { return 'image/png' }
        '.jpg'  { return 'image/jpeg' }
        '.svg'  { return 'image/svg+xml' }
        '.ico'  { return 'image/x-icon' }
        default { return 'application/octet-stream' }
    }
}

while ($listener.IsListening) {
    $context = $listener.GetContext()
    try {
        $request = $context.Request
        $response = $context.Response
        $path = $request.Url.LocalPath
        if ($path -eq '/' -or $path -eq '') { $path = '/index.html' }
        $file = Join-Path $root ($path.TrimStart('/').Replace('/', '\'))
        if (Test-Path -LiteralPath $file) {
            $bytes = [IO.File]::ReadAllBytes($file)
            $response.ContentType = Get-MimeType ([IO.Path]::GetExtension($file))
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
        }
    } catch {
        try { $context.Response.StatusCode = 500 } catch {}
    } finally {
        try { $context.Response.Close() } catch {}
    }
}