# Autonomous OTA Dashboard Service
# This PowerShell script runs as a background service to keep the Next.js dev server running indefinitely

# Configuration
$scriptDir = "C:\Users\CS05180\Documents\ota-dashboard-main"
$logDir = "$scriptDir\logs"
$logFile = "$logDir\dashboard-service.log"
$errorLogFile = "$logDir\dashboard-error.log"
$maxRestartsPerHour = 30
$restartCheckInterval = [TimeSpan]::FromMinutes(5)
$healthCheckUrl = "http://localhost:3000"
$healthCheckPort = 3000

# Ensure directories exist
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir | Out-Null
}

function Write-Log {
    param([string]$message, [string]$level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss.fff"
    $logEntry = "$timestamp [$level] $message"
    $logEntry | Out-File -FilePath $logFile -Append
    if ($level -eq "ERROR") {
        Write-Host $logEntry -ForegroundColor Red
    } elseif ($level -eq "WARN") {
        Write-Host $logEntry -ForegroundColor Yellow
    } else {
        Write-Host $logEntry
    }
}

function Check-ProcessRunning {
    param([int]$pid)
    try {
        $process = Get-Process -Id $pid -ErrorAction SilentlyContinue
        return $null -ne $process -and !$process.HasExited
    } catch {
        return $false
    }
}

function Start-NextJsServer {
    Write-Log "Starting Next.js development server..."
    
    # Set up environment
    $env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ";C:\Program Files\nodejs"
    
    # Create process start info
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "npm"
    $psi.Arguments = "run dev"
    $psi.WorkingDirectory = $scriptDir
    $psi.RedirectStandardError = $true
    $psi.RedirectStandardOutput = $true
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.EnvironmentVariables["PATH"] = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ";C:\Program Files\nodejs"
    
    try {
        $process = [System.Diagnostics.Process]::Start($psi)
        Write-Log "Next.js server started with PID: $($process.Id)"
        return $process
    } catch {
        Write-Log "Failed to start Next.js server: $($_)" "ERROR"
        return $null
    }
}

function Stop-NextJsServer {
    param([System.Diagnostics.Process]$process)
    if ($null -eq $process) { return }
    
    Write-Log "Stopping Next.js server (PID: $($process.Id))..."
    try {
        if (-not $process.HasExited) {
            $process.CloseMainWindow()
            if (-not $process.WaitForExit(5000)) {
                Write-Log "Process did not exit gracefully, forcing termination..."
                $process.Kill()
                $process.WaitForExit()
            }
        }
        Write-Log "Next.js server stopped."
    } catch {
        Write-Log "Error stopping Next.js server: $($_)" "ERROR"
    }
}

function Check-ServerHealth {
    try {
        $response = Invoke-WebRequest -Uri $healthCheckUrl -UseBasicParsing -TimeoutSec 10 -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            return $true
        } else {
            Write-Log "Health check failed with status code: $($response.StatusCode)" "WARN"
            return $false
        }
    } catch {
        Write-Log "Health check failed: $($_)" "WARN"
        return $false
    }
}

function Get-RestartCountInLastHour {
    if (-not (Test-Path $logFile)) { return 0 }
    
    $oneHourAgo = (Get-Date).AddHours(-1)
    $restartLines = Select-String -Path $logFile -Pattern "RESTARTING SERVER" | 
                    Where-Object { 
                        $timestamp = Get-Date $_.Line.Split(']')[0].TrimStart('[')
                        $timestamp -ge $oneHourAgo 
                    }
    return $restartLines.Count
}

# Main service loop
Write-Log "=== OTA Dashboard Autonomous Service Started ==="
Write-Log "Monitoring Next.js server at $healthCheckUrl"
Write-Log "Log file: $logFile"
Write-Log "Error log: $errorLogFile"

$nextJsProcess = $null
$lastHealthCheck = [DateTime]::MinValue
$healthCheckInterval = [TimeSpan]::FromSeconds(30)

while ($true) {
    try {
        $now = Get-Date
        
        # Check if we need to start/restart the server
        $shouldStartServer = $false
        $restartReason = ""
        
        if ($null -eq $nextJsProcess) {
            $shouldStartServer = $true
            $restartReason = "No server process"
        } elseif (-not (Check-ProcessRunning $nextJsProcess.Id)) {
            $shouldStartServer = $true
            $restartReason = "Process exited unexpectedly"
        } elseif (($now - $lastHealthCheck) -ge $healthCheckInterval) {
            $lastHealthCheck = $now
            if (-not (Check-ServerHealth)) {
                $shouldStartServer = $true
                $restartReason = "Health check failed"
            }
        }
        
        if ($shouldStartServer) {
            # Check restart rate limiting
            $restartsInLastHour = Get-RestartCountInLastHour
            if ($restartsInLastHour -ge $maxRestartsPerHour) {
                Write-Log "ERROR: Exceeded maximum restarts per hour ($maxRestartsPerHour). Waiting..." "ERROR"
                Start-Sleep -Seconds 60
                continue
            }
            
            # Stop existing process if any
            if ($null -ne $nextJsProcess) {
                Stop-NextJsServer $nextJsProcess
            }
            
            # Start new process
            $nextJsProcess = Start-NextJsServer
            if ($null -eq $nextJsProcess) {
                Write-Log "Failed to start server, retrying in 10 seconds..." "ERROR"
                Start-Sleep -Seconds 10
                continue
            }
            
            Write-Log "RESTARTING SERVER: $restartReason" "WARN"
            Start-Sleep -Seconds 5 # Give server time to start
        }
        
        # Brief sleep to prevent excessive CPU usage
        Start-Sleep -Seconds 5
        
    } catch {
        Write-Log "Unexpected error in service loop: $($_)" "ERROR"
        Start-Sleep -Seconds 10
    }
}