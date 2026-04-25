# Autonomous OTA Dashboard Starter
# This script starts and monitors the Next.js dev server autonomously

$scriptDir = "C:\Users\CS05180\Documents\ota-dashboard-main"
$logFile = "$scriptDir\dashboard.log"
$errorFile = "$scriptDir\dashboard-error.log"

function Write-Log {
    param([string]$message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$timestamp $message" | Out-File -FilePath $logFile -Append
    Write-Host "$timestamp $message"
}

function Write-ErrorLog {
    param([string]$message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$timestamp $message" | Out-File -FilePath $errorFile -Append
    Write-Host "$timestamp $message" -ForegroundColor Red
}

function Start-Dashboard {
    Write-Log "Starting OTA Dashboard..."
    
    # Set up environment
    $env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ";C:\Program Files\nodejs"
    
    # Start the process
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "npm"
    $psi.Arguments = "run dev"
    $psi.WorkingDirectory = $scriptDir
    $psi.RedirectStandardError = $true
    $psi.RedirectStandardOutput = $true
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.EnvironmentVariables["PATH"] = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ";C:\Program Files\nodejs"
    
    $process = [System.Diagnostics.Process]::Start($psi)
    
    # Start monitoring output in background jobs
    $outputJob = Start-Job -ScriptBlock {
        $process = $using:process
        while (-not $process.HasExited) {
            $line = $process.StandardOutput.ReadLine()
            if ($line) {
                Write-Log "OUTPUT: $line"
            }
            Start-Sleep -Milliseconds 100
        }
    }
    
    $errorJob = Start-Job -ScriptBlock {
        $process = $using:process
        while (-not $process.HasExited) {
            $line = $process.StandardError.ReadLine()
            if ($line) {
                Write-ErrorLog "ERROR: $line"
            }
            Start-Sleep -Milliseconds 100
        }
    }
    
    # Wait for process to exit
    $process.WaitForExit()
    $exitCode = $process.ExitCode
    
    Write-Log "Dashboard process exited with code: $exitCode"
    
    # Clean up jobs
    Stop-Job $outputJob
    Stop-Job $errorJob
    Remove-Job $outputJob
    Remove-Job $errorJob
    
    return $exitCode
}

# Main loop - restart on failure
$restartCount = 0
$maxRestarts = 10

while ($restartCount -lt $maxRestarts) {
    try {
        $exitCode = Start-Dashboard
        
        if ($exitCode -eq 0) {
            Write-Log "Dashboard stopped normally."
            break
        } else {
            $restartCount++
            Write-Log "Dashboard crashed (exit code: $exitCode). Restart attempt $restartCount/$maxRestarts..."
            Start-Sleep -Seconds 5
        }
    } catch {
        $restartCount++
        Write-ErrorLog "Exception in dashboard: $_"
        Write-Log "Restart attempt $restartCount/$maxRestarts due to exception..."
        Start-Sleep -Seconds 5
    }
}

if ($restartCount -ge $maxRestarts) {
    Write-ErrorLog "Maximum restart attempts ($maxRestarts) reached. Giving up."
} else {
    Write-Log "Dashboard stopped gracefully."
}