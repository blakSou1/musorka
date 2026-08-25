# Gathers GitHub profile + repos stats via the GitHub REST API.
# Usage:  powershell -ExecutionPolicy Bypass -File collect-stats.ps1 -User blakSou1 -OutFile stats.json
param(
    [string]$User,
    [string]$OutFile = "stats.json"
)

if ([string]::IsNullOrEmpty($User)) { throw "Provide -User" }

# Prefer GITHUB_TOKEN env var (GitHub Actions) or stored Windows git credentials.
$token = $env:GITHUB_TOKEN
if ([string]::IsNullOrEmpty($token)) {
    $token = (Write-Output "protocol=https`nhost=github.com`n" | git credential fill 2>$null |
        Select-String -Pattern '^password=').Line -replace '^password=',''
}

$h = @{ 'User-Agent' = 'opencode' }
if ($token) { $h['Authorization'] = "Bearer $token" }

function Get-Json([string]$uri) {
    Invoke-RestMethod -Uri $uri -Headers $h -ErrorAction Stop
}

function Get-Headers([string]$uri) {
    (Invoke-WebRequest -Uri $uri -Headers $h -ErrorAction Stop).Headers
}

# Count commits for a repo. Uses per_page=1 + rel="last" Link header -> total count in 1 request.
function Get-CommitCount([string]$user, [string]$repo) {
    $headers = Get-Headers "https://api.github.com/repos/$user/$repo/commits?per_page=1"
    $link = $headers['Link']
    if ($link) {
        $m = [regex]::Match($link, '<[^>]*\?[^>]*page=(\d+)[^>]*>\s*;\s*rel="last"')
        if ($m.Success) { return [int]$m.Groups[1].Value }
    }
    return 1
}

$profile = Get-Json "https://api.github.com/users/$User"
$repos   = Get-Json "https://api.github.com/users/$User/repos?per_page=100"
if ($repos -isnot [System.Array]) { $repos = @($repos) }

$repoStats = @()
foreach ($repo in $repos) {
    if ($repo.fork) { continue }

    $commits = Get-CommitCount $User $repo.name

    $langs = Get-Json "https://api.github.com/repos/$User/$($repo.name)/languages"
    $langBreakdown = @{}
    if ($langs) { foreach ($prop in $langs.PSObject.Properties) { $langBreakdown[$prop.Name] = $prop.Value } }

    $repoStats += [PSCustomObject]@{
        name          = $repo.name
        fullName      = $repo.full_name
        description   = $repo.description
        homepage      = $repo.homepage
        stars         = $repo.stargazers_count
        forks         = $repo.forks_count
        watchers      = $repo.watchers_count
        issues        = $repo.open_issues_count
        language      = $repo.language
        languages     = $langBreakdown
        sizeKB        = $repo.size
        commits       = $commits
        created       = $repo.created_at
        updated       = $repo.updated_at
        pushed        = $repo.pushed_at
        defaultBranch = $repo.default_branch
    }
}

# Activity: public events (last 90 days).
$eventSummary = @()
try {
    $uri = "https://api.github.com/users/$User/events/public?per_page=100"
    $resp = Invoke-RestMethod -Uri $uri -Headers $h
    if ($resp -isnot [System.Array]) { $resp = @($resp) }
    $events = $resp
    $guard = 0
    while ($resp.Count -eq 100 -and $guard -lt 20) {
        $link = (Invoke-WebRequest -Uri $uri -Headers $h).Headers['Link']
        $uri = $null
        $m = [regex]::Match([string]$link, '<([^>]+)>\s*;\s*rel="next"')
        if ($m.Success) {
            $uri = $m.Groups[1].Value
            $resp = Invoke-RestMethod -Uri $uri -Headers $h
            if ($resp -isnot [System.Array]) { $resp = @($resp) }
            $events += $resp
            $guard++
        }
        else { break }
    }
    foreach ($ev in $events) {
        $eventSummary += [PSCustomObject]@{
            type    = $ev.type
            repo    = if ($ev.repo) { $ev.repo.name } else { $null }
            created = $ev.created_at
        }
    }
} catch { }

$result = [PSCustomObject]@{
    collectedAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    profile = [PSCustomObject]@{
        login        = $profile.login
        name         = $profile.name
        avatar_url   = $profile.avatar_url
        html_url     = $profile.html_url
        bio          = $profile.bio
        followers    = $profile.followers
        following    = $profile.following
        public_repos = $profile.public_repos
        public_gists = $profile.public_gists
        created_at   = $profile.created_at
    }
    repos  = $repoStats
    events = $eventSummary
}

$result | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $OutFile -Encoding UTF8
Write-Output "Saved to $OutFile"
