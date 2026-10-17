<#
.SYNOPSIS
  OUAGX PowerShell client - chat with any AI provider through your OUAGX API.

.DESCRIPTION
  Sends prompts to an OUAGX API server (server/server.mjs or the Amplify
  Function in server/lambda.mjs), which calls the provider with its own
  server-side keys. You only need the shared API key - no provider keys,
  no Node.js on this machine.

  Shared key resolve order:
    1. -ApiKey parameter
    2. $env:OUAGX_API_KEY environment variable

.EXAMPLE
  .\ouagx.ps1 -Once "hello in one word" -Provider deepseek
  Ask one question through the local API (http://localhost:8080) and exit.

.EXAMPLE
  .\ouagx.ps1 -ApiUrl https://ouagx.com -Provider openai
  Interactive chat against a hosted API. Commands: /p <id> switch provider,
  /m <name> switch model, /q quit.

.EXAMPLE
  irm https://ouagx.com/ouagx.ps1 -OutFile $env:TEMP\ouagx.ps1; & $env:TEMP\ouagx.ps1 -Once "hi" -ApiUrl https://ouagx.com
  Single pasted line, nothing to install ($env:OUAGX_API_KEY must be set).

.LINK
  https://ouagx.com
#>
[CmdletBinding()]
param(
  [string]$ApiUrl = 'http://localhost:8080',
  [string]$ApiKey = '',
  [string]$Provider = 'openai',
  [string]$Model = '',
  [Alias('Message')]
  [string]$Once = '',
  [string]$BaseUrl = '',
  [switch]$ListProviders,
  [switch]$Help
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

# TLS 1.2 for Windows PowerShell 5.1
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch { }

$OuagxProviders = @(
  @{ Id = 'openai';     Label = 'OpenAI';                      Model = 'gpt-4o-mini' },
  @{ Id = 'anthropic';  Label = 'Anthropic';                   Model = 'claude-3-5-haiku-latest' },
  @{ Id = 'gemini';     Label = 'Google Gemini';               Model = 'gemini-2.0-flash' },
  @{ Id = 'mistral';    Label = 'Mistral';                     Model = 'mistral-small-latest' },
  @{ Id = 'deepseek';   Label = 'DeepSeek';                    Model = 'deepseek-chat' },
  @{ Id = 'xai';        Label = 'xAI (Grok)';                  Model = 'grok-3-mini' },
  @{ Id = 'openrouter'; Label = 'OpenRouter';                  Model = 'openrouter/auto' },
  @{ Id = 'custom';     Label = 'Custom (OpenAI-compatible)'; Model = 'llama-3.1-8b-instant' }
)

function Get-OuagxProvider($Id) {
  $want = ([string]$Id).ToLowerInvariant()
  foreach ($entry in $OuagxProviders) {
    if ($entry.Id -eq $want) { return $entry }
  }
  return $null
}

function Show-OuagxHelp {
  Write-Output @'
OUAGX PowerShell client - one command to any AI provider via your OUAGX API.

Usage:
  .\ouagx.ps1 -Once "your question" [-Provider <id>] [-Model <name>]
  .\ouagx.ps1 [-Provider <id>]                      interactive chat

Options:
  -ApiUrl <url>     OUAGX API base URL (default: http://localhost:8080)
  -ApiKey <key>     shared API key (or set $env:OUAGX_API_KEY)
  -Provider <id>    openai, anthropic, gemini, mistral, deepseek, xai,
                    openrouter, custom (default: openai)
  -Model <name>     override the provider default model
  -Once <text>      ask once and exit (alias: -Message)
  -BaseUrl <url>    custom endpoint (only with -Provider custom)
  -ListProviders    list provider ids and exit
  -Help             show this help

Chat commands: /p <id> switch provider, /m <name> switch model, /q quit.

Setup (run once on the API machine):
  $env:OUAGX_API_KEY = "a-long-random-string"
  $env:OUAGX_DEEPSEEK_KEY = "sk-..."   # + any other providers you want
  npm run api

Nothing to install - paste one line (needs $env:OUAGX_API_KEY):
  irm https://ouagx.com/ouagx.ps1 -OutFile $env:TEMP\ouagx.ps1; & $env:TEMP\ouagx.ps1 -Once "hi" -ApiUrl https://ouagx.com
'@
}

function Get-OuagxErrorBody($Err) {
  if ($Err.ErrorDetails -ne $null -and $Err.ErrorDetails.Message) {
    return $Err.ErrorDetails.Message
  }
  try {
    $response = $Err.Exception.Response
    if ($response -ne $null) {
      $stream = $response.GetResponseStream()
      $reader = New-Object System.IO.StreamReader($stream)
      try { return $reader.ReadToEnd() } finally { $reader.Close() }
    }
  } catch { }
  return ''
}

function Get-OuagxErrorMessage($Err) {
  $bodyText = Get-OuagxErrorBody $Err
  if (-not [string]::IsNullOrWhiteSpace($bodyText)) {
    try {
      $parsed = $bodyText | ConvertFrom-Json
      if ($parsed -ne $null -and $parsed.error) { return [string]$parsed.error }
    } catch { }
    if ($bodyText.Length -gt 300) { $bodyText = $bodyText.Substring(0, 300) }
    return $bodyText
  }
  if ($Err.Exception -ne $null) { return $Err.Exception.Message }
  return [string]$Err
}

# NOTE: run this script as a file. Its text must not be piped to iex or run
# via scriptblock: 'exit' inside those would close the caller's session.
function Invoke-OuagxChat($Messages, $ProviderId, $ModelName, $EndpointBase) {
  $uri = $script:OuagxApiBase + '/api/chat'
  $payload = @{ provider = $ProviderId; model = $ModelName; messages = $Messages }
  if (-not [string]::IsNullOrWhiteSpace($EndpointBase)) { $payload.baseUrl = $EndpointBase }
  $response = Invoke-RestMethod -Method Post -Uri $uri `
    -Headers @{ 'Content-Type' = 'application/json'; Authorization = ('Bearer ' + $script:OuagxKey) } `
    -Body ($payload | ConvertTo-Json -Depth 6)
  if ($response -ne $null -and $response.reply) { return [string]$response.reply }
  return '(empty response)'
}

if ($Help) {
  Show-OuagxHelp
  exit 0
}

if ($ListProviders) {
  foreach ($entry in $OuagxProviders) {
    Write-Output ('{0,-12} {1}  (default model: {2})' -f $entry.Id, $entry.Label, $entry.Model)
  }
  exit 0
}

$providerEntry = Get-OuagxProvider $Provider
if ($providerEntry -eq $null) {
  Write-Error ("Unknown provider '$Provider'. Choose: " + (($OuagxProviders | ForEach-Object { $_.Id }) -join ', ')) -ErrorAction Continue
  exit 1
}
if ([string]::IsNullOrWhiteSpace($Model)) {
  $Model = $providerEntry.Model
}

$script:OuagxKey = $ApiKey
if ([string]::IsNullOrWhiteSpace($script:OuagxKey)) {
  $script:OuagxKey = $env:OUAGX_API_KEY
}
if ([string]::IsNullOrWhiteSpace($script:OuagxKey)) {
  Write-Error 'No OUAGX API key. Pass -ApiKey or set $env:OUAGX_API_KEY (the OUAGX_API_KEY from the API machine).' -ErrorAction Continue
  exit 1
}
$script:OuagxApiBase = $ApiUrl.TrimEnd('/')

if (-not [string]::IsNullOrWhiteSpace($Once)) {
  try {
    Write-Output (Invoke-OuagxChat @(@{ role = 'user'; content = $Once }) $providerEntry.Id $Model $BaseUrl)
    exit 0
  } catch {
    Write-Error (Get-OuagxErrorMessage $_) -ErrorAction Continue
    exit 1
  }
}

$thread = @()
Write-Host ("OUAGX PowerShell - " + $providerEntry.Label + " (" + $Model + ") via " + $script:OuagxApiBase + ". Type /q to quit, /p <id> provider, /m <name> model.")
while ($true) {
  try {
    $line = Read-Host 'you'
  } catch {
    break
  }
  if ($line -eq $null) { break }
  $text = $line.Trim()
  if ($text -eq '') { continue }
  if ($text -eq '/q') { break }
  if ($text.StartsWith('/p ')) {
    $next = Get-OuagxProvider $text.Substring(3).Trim()
    if ($next -eq $null) {
      Write-Host ('Unknown provider. Choose: ' + (($OuagxProviders | ForEach-Object { $_.Id }) -join ', '))
    } else {
      $providerEntry = $next
      $Model = $next.Model
      Write-Host ('Switched to ' + $providerEntry.Label + ' (' + $Model + ')')
    }
    continue
  }
  if ($text.StartsWith('/m ')) {
    $Model = $text.Substring(3).Trim()
    Write-Host ("Model: $Model")
    continue
  }
  $thread += @{ role = 'user'; content = $text }
  try {
    $reply = Invoke-OuagxChat $thread $providerEntry.Id $Model $BaseUrl
    $thread += @{ role = 'assistant'; content = $reply }
    Write-Host ''
    Write-Host ('[' + $providerEntry.Label + '] ' + $reply)
    Write-Host ''
  } catch {
    if ($thread.Count -eq 1) { $thread = @() } else { $thread = $thread[0..($thread.Count - 2)] }
    Write-Host ('Error: ' + (Get-OuagxErrorMessage $_)) -ForegroundColor Red
  }
}
Write-Host 'Bye.'
