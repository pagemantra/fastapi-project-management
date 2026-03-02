# PowerShell script to lock the screen
Write-Host "Locking screen in 3 seconds..."
Start-Sleep -Seconds 3
rundll32.exe user32.dll,LockWorkStation
Write-Host "Lock command sent!"
