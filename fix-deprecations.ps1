# Fix Ant Design deprecation warnings

$files = @(
    "frontend\src\pages\Dashboard.jsx",
    "frontend\src\pages\Reports.jsx",
    "frontend\src\pages\Attendance.jsx",
    "frontend\src\pages\MyTeam.jsx",
    "frontend\src\pages\Profile.jsx"
)

foreach ($file in $files) {
    $content = Get-Content $file -Raw

    # Fix valueStyle={{ color: 'xxx' }}
    $content = $content -replace 'valueStyle=\{\{\s*color:\s*([^\}]+)\s*\}\}', 'styles={{ value: { color: $1 } }}'

    # Fix valueStyle with multiple properties
    $content = $content -replace 'valueStyle=\{\{([^\}]+)\}\}', 'styles={{ value: {$1} }}'

    # Fix direction="vertical" to orientation="vertical"
    $content = $content -replace 'direction="vertical"', 'orientation="vertical"'
    $content = $content -replace 'direction="horizontal"', 'orientation="horizontal"'

    Set-Content $file -Value $content
}

Write-Host "Fixed deprecation warnings in all files!"
