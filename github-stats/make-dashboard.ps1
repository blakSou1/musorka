# Generates a self-contained HTML dashboard from stats.json.
# Usage:  powershell -ExecutionPolicy Bypass -File make-dashboard.ps1 -StatsPath stats.json -OutPath index.html
param(
    [string]$StatsPath = "stats.json",
    [string]$OutPath = "index.html"
)

$stats = Get-Content -LiteralPath $StatsPath -Raw | ConvertFrom-Json
$dataJson = $stats | ConvertTo-Json -Depth 8 -Compress

$html = @'
<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>GitHub Stats — {USER}</title>
<style>
  :root {
    --bg:#0d1117; --panel:#161b22; --border:#30363d; --text:#e6edf3;
    --muted:#8b949e; --accent:#58a6ff; --green:#3fb950; --red:#f85149;
    --purple:#bc8cff; --yellow:#d29922; --cyan:#39c5cf;
  }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { background:var(--bg); color:var(--text); font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif; line-height:1.5; padding:24px; }
  .wrap { max-width:1080px; margin:0 auto; }
  header.profile { display:flex; gap:20px; align-items:center; background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:24px; }
  header.profile img { width:96px; height:96px; border-radius:50%; border:2px solid var(--border); }
  header.profile h1 { font-size:26px; }
  header.profile .login { color:var(--muted); }
  header.profile .bio { color:var(--muted); margin-top:6px; }
  header.profile .meta { margin-top:10px; display:flex; flex-wrap:wrap; gap:8px; }
  .badge { background:#1f2937; color:var(--text); border:1px solid var(--border); border-radius:20px; padding:2px 12px; font-size:13px; }
  .collected { margin:14px 0; color:var(--muted); font-size:13px; }
  .cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:14px; margin:18px 0; }
  .card { background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:16px; }
  .card .num { font-size:30px; font-weight:700; }
  .card .lbl { color:var(--muted); font-size:13px; margin-top:2px; }
  .card.c1 .num{color:var(--accent)} .card.c2 .num{color:var(--green)} .card.c3 .num{color:var(--purple)}
  .card.c4 .num{color:var(--yellow)} .card.c5 .num{color:var(--cyan)} .card.c6 .num{color:var(--red)}
  .panel { background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:20px; margin:18px 0; }
  .panel h2 { font-size:16px; margin-bottom:14px; color:var(--accent); }
  .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:18px; }
  @media(max-width:800px){ .grid2{grid-template-columns:1fr;} }
  table { width:100%; border-collapse:collapse; font-size:14px; }
  th, td { text-align:left; padding:8px 10px; border-bottom:1px solid var(--border); }
  th { color:var(--muted); font-weight:600; font-size:12px; text-transform:uppercase; letter-spacing:.04em; }
  tr:hover td { background:#1c2129; }
  .bar-row { display:flex; align-items:center; gap:10px; margin:6px 0; font-size:13px; }
  .bar-row .name { width:38%; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .bar-row .track { flex:1; background:#1f2937; border-radius:6px; height:16px; overflow:hidden; }
  .bar-row .fill { height:100%; border-radius:6px; }
  .bar-row .val { width:90px; text-align:right; color:var(--muted); font-variant-numeric:tabular-nums; }
  .lang-bar { display:flex; height:26px; border-radius:8px; overflow:hidden; margin:10px 0; }
  .lang-bar div { color:#fff; font-size:12px; display:flex; align-items:center; justify-content:center; white-space:nowrap; }
  .legend { display:flex; flex-wrap:wrap; gap:12px; margin-top:8px; font-size:13px; color:var(--muted); }
  .legend .sw { display:inline-block; width:12px; height:12px; border-radius:3px; margin-right:5px; vertical-align:-1px; }
  .activity { display:flex; align-items:flex-end; gap:3px; height:140px; margin-top:8px; }
  .activity .col { flex:1; background:var(--accent); opacity:.85; border-radius:3px 3px 0 0; min-height:2px; position:relative; }
  .activity .col:hover { opacity:1; }
  .activity .col .tip { position:absolute; bottom:100%; left:50%; transform:translateX(-50%); background:#1f2937; border:1px solid var(--border); border-radius:6px; padding:4px 8px; font-size:11px; white-space:nowrap; display:none; z-index:5; }
  .activity .col:hover .tip { display:block; }
  .foot { color:var(--muted); font-size:12px; text-align:center; margin-top:24px; }
  .empty { color:var(--muted); }
</style>
</head>
<body>
<div class="wrap">
  <header class="profile">
    <img src="{AVATAR}" alt="avatar">
    <div>
      <h1>{NAME}</h1>
      <div class="login">@{LOGIN}</div>
      <div class="bio">{BIO}</div>
      <div class="meta">
        <span class="badge">repo: {PUBLIC_REPOS}</span>
        <span class="badge">followers: {FOLLOWERS}</span>
        <span class="badge">following: {FOLLOWING}</span>
        <span class="badge">gists: {GISTS}</span>
        <span class="badge">на GitHub с {CREATED}</span>
      </div>
    </div>
  </header>
  <div class="collected">Данные собраны: {COLLECTED} · {OWNER}</div>

  <div class="cards" id="cards"></div>

  <div class="grid2">
    <div class="panel"><h2>Коммиты по репозиториям</h2><div id="commitChart"></div></div>
    <div class="panel"><h2>Размер репозиториев</h2><div id="sizeChart"></div></div>
  </div>

  <div class="panel"><h2>Языки (по строкам кода)</h2><div id="langChart"></div></div>

  <div class="panel"><h2>Активность (публичные события, 90 дней)</h2><div id="activityChart"></div></div>

  <div class="panel"><h2>Репозитории</h2><table id="repoTable"></table></div>

  <div class="foot">Сгенерировано автоматически · GitHub REST API</div>
</div>

<script>
const DATA = __DATA__;
const fmt = n => n.toLocaleString('ru-RU');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

// KPI cards
(function(){
  const repos = DATA.repos;
  const totalCommits = repos.reduce((a,r)=>a+(r.commits||0),0);
  const totalStars = repos.reduce((a,r)=>a+(r.stars||0),0);
  const totalSizeGB = repos.reduce((a,r)=>a+(r.sizeKB||0),0)/1048576;
  const cards = [
    {cls:'c1', num:repos.length, lbl:'Репозиториев'},
    {cls:'c2', num:totalCommits, lbl:'Коммитов'},
    {cls:'c3', num:totalStars, lbl:'Звёзд'},
    {cls:'c4', num:totalSizeGB.toFixed(2)+' GB', lbl:'Кода во всех репо'},
    {cls:'c5', num:DATA.profile.followers, lbl:'Фолловеров'},
    {cls:'c6', num:DATA.profile.public_gists, lbl:'Gist-ов'},
  ];
  document.getElementById('cards').innerHTML = cards.map(c=>`<div class="card ${c.cls}"><div class="num">${fmt(c.num)}</div><div class="lbl">${c.lbl}</div></div>`).join('');
})();

function barChart(el, items, color, valFmt){
  const max = Math.max(...items.map(i=>i.v), 1);
  el.innerHTML = items.map(i=>`
    <div class="bar-row">
      <div class="name" title="${esc(i.label)}">${esc(i.label)}</div>
      <div class="track"><div class="fill" style="width:${Math.max(i.v/max*100,2)}%;background:${color}"></div></div>
      <div class="val">${valFmt(i.v)}</div>
    </div>`).join('');
}

// Commit chart
(function(){
  const items = [...DATA.repos].sort((a,b)=>(b.commits||0)-(a.commits||0)).map(r=>({label:short(r.name), v:r.commits||0}));
  barChart(document.getElementById('commitChart'), items, 'var(--accent)', n=>fmt(n)+' комм.');
})();

// Size chart
(function(){
  const items = [...DATA.repos].sort((a,b)=>b.sizeKB-a.sizeKB).map(r=>({label:short(r.name), v:+(r.sizeKB/1024).toFixed(1)}));
  barChart(document.getElementById('sizeChart'), items, 'var(--green)', n=>fmt(n)+' MB');
})();

// Languages
(function(){
  const agg = {};
  DATA.repos.forEach(r=>Object.entries(r.languages||{}).forEach(([l,n])=>agg[l]=(agg[l]||0)+n));
  const total = Object.values(agg).reduce((a,b)=>a+b,0);
  const colors = ['var(--accent)','var(--green)','var(--red)','var(--purple)','var(--yellow)','var(--cyan)'];
  const entries = Object.entries(agg).sort((a,b)=>b[1]-a[1]);
  const bar = entries.map(([l,n],i)=>`<div style="width:${(n/total*100).toFixed(2)}%;background:${colors[i%colors.length]}">${l} ${(n/total*100).toFixed(1)}%</div>`).join('');
  const legend = entries.map(([l,n],i)=>`<span><span class="sw" style="background:${colors[i%colors.length]}"></span>${l} — ${fmt(n)} строк (${(n/total*100).toFixed(1)}%)</span>`).join('');
  document.getElementById('langChart').innerHTML = `<div class="lang-bar">${bar}</div><div class="legend">${legend}</div>`;
})();

// Activity timeline
(function(){
  const now = new Date();
  const days = {};
  for(let i=90;i>=0;i--){ const d=new Date(now); d.setDate(d.getDate()-i); days[d.toISOString().slice(0,10)]=0; }
  (DATA.events||[]).forEach(e=>{ const k=(e.created||'').slice(0,10); if(k in days) days[k]++; });
  const keys = Object.keys(days);
  const max = Math.max(...Object.values(days),1);
  const col = keys.map(k=>{
    const v=days[k];
    return `<div class="col" style="height:${Math.max(v/max*100,1)}%" title="${k}: ${v} событий"><div class="tip">${k}: ${v}</div></div>`;
  }).join('');
  document.getElementById('activityChart').innerHTML = `<div class="activity">${col}</div>`;
})();

// Repo table
(function(){
  const rows = DATA.repos.sort((a,b)=>new Date(b.updated)-new Date(a.updated)).map(r=>{
    const langs = Object.entries(r.languages||{}).map(([l,n])=>l).join(', ');
    return `<tr>
      <td><a style="color:var(--accent);text-decoration:none" href="https://github.com/${esc(r.fullName)}" target="_blank">${esc(r.name)}</a></td>
      <td>${r.stars||0}</td><td>${r.commits||0}</td>
      <td>${(r.sizeKB/1024).toFixed(1)} MB</td>
      <td>${esc(r.language||'—')}</td>
      <td>${esc(langs||'—')}</td>
      <td>${(r.created||'').slice(0,10)}</td>
      <td>${(r.updated||'').slice(0,10)}</td>
    </tr>`;
  }).join('');
  document.getElementById('repoTable').innerHTML = `<thead><tr><th>Репозиторий</th><th>★</th><th>Коммиты</th><th>Размер</th><th>Осн. язык</th><th>Языки</th><th>Создан</th><th>Обновлён</th></tr></thead><tbody>${rows}</tbody>`;
})();

function short(name){
  return name.replace(/^GMTK-Game-Jam-2025-/,'').replace(/-July-30th-2025-to-August-3rd-2025$/,'');
}
</script>
</body>
</html>
'@

$created = if ($stats.profile.created_at) { ([datetime]$stats.profile.created_at).ToString('yyyy') } else { '—' }
$collected = if ($stats.collectedAt) { ([datetime]$stats.collectedAt).ToString('yyyy-MM-dd HH:mm') } else { '—' }

function Enc([string]$s) { return [System.Net.WebUtility]::HtmlEncode($s) }

$html = $html.Replace('{USER}', [System.Net.WebUtility]::HtmlEncode([string]$stats.profile.login))
$html = $html.Replace('{AVATAR}', [System.Net.WebUtility]::HtmlEncode([string]$stats.profile.avatar_url))
$html = $html.Replace('{NAME}', [System.Net.WebUtility]::HtmlEncode([string]$stats.profile.name))
$html = $html.Replace('{LOGIN}', [System.Net.WebUtility]::HtmlEncode([string]$stats.profile.login))
$html = $html.Replace('{BIO}', [System.Net.WebUtility]::HtmlEncode([string]$stats.profile.bio))
$html = $html.Replace('{PUBLIC_REPOS}', [string]$stats.profile.public_repos)
$html = $html.Replace('{FOLLOWERS}', [string]$stats.profile.followers)
$html = $html.Replace('{FOLLOWING}', [string]$stats.profile.following)
$html = $html.Replace('{GISTS}', [string]$stats.profile.public_gists)
$html = $html.Replace('{CREATED}', $created)
$html = $html.Replace('{COLLECTED}', $collected)
$html = $html.Replace('{OWNER}', [System.Net.WebUtility]::HtmlEncode("$($stats.profile.login) — статистика GitHub"))
$html = $html.Replace('__DATA__', $dataJson)

Set-Content -LiteralPath $OutPath -Value $html -Encoding UTF8
Write-Output "Saved dashboard to $OutPath"
