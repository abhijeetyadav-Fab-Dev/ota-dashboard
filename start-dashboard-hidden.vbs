' Autonomous OTA Dashboard Starter - VBScript Version
' This script runs completely hidden and automatically restarts the Next.js dev server if it crashes

Option Explicit

Dim scriptDir, logFile, errorLogFile, maxRestartsPerHour, restartCount, lastResetTime
Dim nodeExe, npmCli, args, wshShell, fso

scriptDir = "C:\Users\CS05180\Documents\ota-dashboard-main"
logFile = scriptDir & "\dashboard-autonomous.log"
errorLogFile = scriptDir & "\dashboard-autonomous-error.log"
maxRestartsPerHour = 30
restartCount = 0
lastResetTime = Now

Set wshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Ensure we have Node.js in PATH
Dim envPath
envPath = wshShell.ExpandEnvironmentStrings("%PATH%") & ";C:\Program Files\nodejs"
wshShell.Environment("Process")("PATH") = envPath

' Logging function
Sub WriteLog(message, level)
    Dim timestamp, logEntry
    timestamp = Year(Now) & "-" & Right("0" & Month(Now), 2) & "-" & Right("0" & Day(Now), 2) & " " & _
                Right("0" & Hour(Now), 2) & ":" & Right("0" & Minute(Now), 2) & ":" & Right("0" & Second(Now), 2)
    logEntry = timestamp & " [" & level & "] " & message
    
    On Error Resume Next
    Dim logFs, logTs
    Set logFs = CreateObject("Scripting.FileSystemObject")
    Set logTs = logFs.OpenTextFile(logFile, 8, True) ' ForAppending, CreateIfNotExists
    logTs.WriteLine logEntry
    logTs.Close
    On Error GoTo 0
    
    ' Also output to console for debugging (when not hidden)
    WScript.Echo "[" & level & "] " & message
End Sub

' Main execution loop
WriteLog "=== OTA Dashboard Autonomous Starter (VBScript) ===", "INFO"
WriteLog "Starting monitoring loop...", "INFO"

Do While True
    On Error Resume Next
    Dim exitCode, processObj
    
    WriteLog "Starting Next.js development server...", "INFO"
    
    ' Set up the command
    nodeExe = "C:\Program Files\nodejs\node.exe"
    npmCli = "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js"
    args = """" & npmCli & """ run dev"
    
    ' Create the process
    Set processObj = wshShell.Exec(""" & nodeExe & """ " & args)
    
    WriteLog "Server started with PID: " & processObj.ProcessID, "INFO"
    
    ' Wait for the process to exit
    Do While processObj.Status = 0
        WScript.Sleep 1000 ' Check every second
    Loop
    
    exitCode = processObj.ExitCode
    WriteLog "Server process exited with code: " & exitCode, "WARN"
    
    ' Check if we should continue restarting
    Dim now, oneHourAgo
    now = Now
    oneHourAgo = DateAdd("h", -1, now)
    
    If DateDiff("s", lastResetTime, oneHourAgo) > 0 Then
        ' Reset counter every hour
        restartCount = 0
        lastResetTime = now
        WriteLog "Restart counter reset (hourly)", "INFO"
    End If
    
    restartCount = restartCount + 1
    
    If restartCount > maxRestartsPerHour Then
        WriteLog "ERROR: Too many restarts (" & restartCount & ") in the last hour. Stopping to prevent infinite loop.", "ERROR"
        Exit Do
    End If
    
    WriteLog "Restarting server in 5 seconds... (Attempt " & restartCount & "/" & maxRestartsPerHour & ")", "WARN"
    WScript.Sleep 5000 ' Wait 5 seconds before restarting
    
    On Error GoTo 0
Loop

WriteLog "=== Dashboard monitoring stopped ===", "INFO"