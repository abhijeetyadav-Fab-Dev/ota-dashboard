# Autonomous OTA Dashboard Monitor
# Runs Next.js dev server and restarts it automatically if it crashes

$scriptDir = "C:\Users\CS05180\Documents\ota-dashboard-main"
$logFile = "$scriptDir\dashboard.log"

function Write-Log {
    param([string]$message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$timestamp $message" | Out-File -FilePath $logFile -Append
    Write-Host "$timestamp $message"
}

# Ensure we have Node.js in PATH
$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ";C:\Program Files\nodejs"

Write-Log "=== OTA Dashboard Autonomous Starter ==="
Write-Log "Starting monitoring loop..."

$restartCount = 0
$maxRestartsPerHour = 20
$lastResetTime = Get-Date

while ($true) {
    try {
        Write-Log "Starting Next.js development server..."
        
        # Start the Next.js dev server using npm directly
        $process = Start-Process -FilePath "C:\Program Files\nodejs\npm.cmd" `
            -ArgumentList "run", "dev" `
            -WorkingDirectory $scriptDir `
            -RedirectStandardOutput "$scriptDir\dashboard-output.log" `
            -RedirectStandardError "$scriptDir\dashboard-error.log" `
            -PassThru `
            -WindowStyle Hidden
        
        Write-Log "Server started with PID: $($process.Id)"
        
        # Wait for the process to exit
        $process.WaitForExit()
        
        $exitCode = $process.ExitCode
        Write-Log "Server process exited with code: $exitCode"
        
        # Check if we should continue restarting
        $now = Get-Date
        if ($now - $lastResetTime -gt [TimeSpan]::FromHours(1)) {
            # Reset counter every hour
            $restartCount = 0
            $lastResetTime = $now
            Write-Log "Restart counter reset (hourly)"
        }
        
        $restartCount++
        
        if ($restartCount -gt $maxRestartsPerHour) {
            Write-Log "ERROR: Too many restarts ($restartCount) in the last hour. Stopping to prevent infinite loop."
            break
        }
        
        Write-Log "Restarting server in 5 seconds... (Attempt $restartCount/$maxRestartsPerHour)"
        Start-Sleep -Seconds 5
        
    } catch {
        Write-Log "EXCEPTION: $_"
        Write-Log "Restarting server in 5 seconds due to exception..."
        Start-Sleep -Seconds 5
    }
}

Write-Log "=== Dashboard monitoring stopped ==="