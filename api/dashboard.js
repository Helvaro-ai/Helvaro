module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(HTML);
};

const HTML = `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Helvaro — Dashboard</title>
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
:root{--bg:#030812;--bg2:#060e1f;--bg3:#0a1628;--bg4:#0d1d35;--blue:#1e6fd9;--glow:#2b8fff;--cyan:#00d4ff;--border:rgba(30,111,217,0.2);--border2:rgba(43,143,255,0.4);--text:#e8f0ff;--dim:#6a85b0;--muted:#3d5070;--green:#00e5a0;--red:#ff4560;--orange:#ff9500;}
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Inter',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;overflow-x:hidden;}
body::before{content:'';position:fixed;inset:0;background-image:linear-gradient(rgba(30,111,217,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(30,111,217,0.04) 1px,transparent 1px);background-size:40px 40px;pointer-events:none;z-index:0;}
#login-page{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:100;background:var(--bg);}
.login-glow{position:absolute;width:700px;height:700px;background:radial-gradient(circle,rgba(30,111,217,0.12) 0%,transparent 65%);top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none;}
.login-card{position:relative;background:var(--bg2);border:1px solid var(--border2);border-radius:20px;padding:52px 44px;width:420px;box-shadow:0 0 60px rgba(30,111,217,0.12);}
.login-card::before{content:'';position:absolute;top:-1px;left:20%;right:20%;height:1px;background:linear-gradient(90deg,transparent,var(--glow),transparent);}
.login-logo{font-family:'Orbitron',monospace;font-size:26px;font-weight:700;background:linear-gradient(135deg,#fff,var(--cyan));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;letter-spacing:3px;margin-bottom:6px;}
.login-sub{color:var(--dim);font-size:13px;margin-bottom:36px;}
.login-label{display:block;font-size:11px;font-weight:600;color:var(--cyan);margin-bottom:8px;letter-spacing:1.5px;text-transform:uppercase;}
.login-input{width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:13px 16px;color:var(--text);font-family:'Inter',sans-serif;font-size:14px;margin-bottom:20px;outline:none;transition:border-color .2s;}
.login-input:focus{border-color:var(--glow);}
.login-btn{width:100%;background:linear-gradient(135deg,var(--blue),var(--cyan-dim,#0099cc));color:#fff;border:none;border-radius:10px;padding:14px;font-family:'Orbitron',monospace;font-size:13px;font-weight:600;letter-spacing:1.5px;cursor:pointer;transition:all .2s;margin-top:4px;}
.login-btn:hover{box-shadow:0 0 25px rgba(30,111,217,0.5);}
.login-error{color:var(--red);font-size:12px;margin-top:12px;display:none;padding:10px 12px;background:rgba(255,69,96,0.1);border-radius:8px;border:1px solid rgba(255,69,96,0.2);}
#app{display:none;min-height:100vh;position:relative;z-index:1;}
.sidebar{position:fixed;top:0;left:0;width:220px;height:100vh;background:var(--bg2);border-right:1px solid var(--border);display:flex;flex-direction:column;z-index:50;}
.sidebar-logo{padding:28px 20px 24px;border-bottom:1px solid var(--border);}
.logo-name{font-family:'Orbitron',monospace;font-size:16px;font-weight:700;letter-spacing:2px;background:linear-gradient(135deg,#fff,var(--cyan));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
.nav{padding:16px 0;flex:1;}
.nav-item{display:flex;align-items:center;gap:10px;padding:11px 20px;color:var(--dim);font-size:13px;font-weight:500;cursor:pointer;transition:all .15s;border-left:2px solid transparent;}
.nav-item:hover{color:var(--text);background:rgba(30,111,217,0.05);}
.nav-item.active{color:var(--cyan);background:rgba(0,212,255,0.05);border-left-color:var(--cyan);}
.sidebar-footer{padding:16px 20px;border-top:1px solid var(--border);}
.user-card{display:flex;align-items:center;gap:10px;margin-bottom:14px;}
.user-avatar{width:34px;height:34px;background:linear-gradient(135deg,var(--blue),var(--glow));border-radius:8px;display:flex;align-items:center;justify-content:center;font-family:'Orbitron',monospace;font-weight:700;font-size:12px;color:#fff;flex-shrink:0;}
.user-name{font-size:13px;font-weight:500;}
.user-role{font-size:11px;color:var(--muted);}
.logout-btn{width:100%;background:transparent;border:1px solid var(--border);color:var(--dim);border-radius:8px;padding:8px;font-family:'Inter',sans-serif;font-size:12px;cursor:pointer;transition:all .15s;}
.logout-btn:hover{border-color:var(--red);color:var(--red);}
.main{margin-left:220px;min-height:100vh;display:flex;flex-direction:column;}
.topbar{background:rgba(6,14,31,.9);backdrop-filter:blur(10px);border-bottom:1px solid var(--border);padding:18px 28px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:20;}
.page-title{font-family:'Orbitron',monospace;font-size:18px;font-weight:600;letter-spacing:1px;background:linear-gradient(135deg,#fff 60%,var(--cyan));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
.page-sub{font-size:12px;color:var(--muted);margin-top:3px;}
.topbar-right{display:flex;gap:10px;align-items:center;}
.btn{background:linear-gradient(135deg,var(--blue),#0099cc);color:#fff;border:none;border-radius:8px;padding:9px 16px;font-family:'Inter',sans-serif;font-size:12px;font-weight:600;cursor:pointer;transition:all .15s;display:flex;align-items:center;gap:6px;}
.btn:hover{box-shadow:0 0 20px rgba(30,111,217,0.4);}
.btn-ghost{background:transparent;border:1px solid var(--border);color:var(--dim);}
.btn-ghost:hover{border-color:var(--glow);color:var(--text);box-shadow:none;}
.theme-btn{width:34px;height:34px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;cursor:pointer;font-size:15px;display:flex;align-items:center;justify-content:center;transition:all .15s;}
.theme-btn:hover{border-color:var(--glow);}
.content{padding:24px 28px;flex:1;}
.stats-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin-bottom:24px;}
.stat-card{background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:18px 16px;transition:border-color .2s,box-shadow .2s;}
.stat-card:hover{border-color:var(--border2);box-shadow:0 0 30px rgba(30,111,217,0.08);}
.stat-label{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1.2px;font-weight:600;margin-bottom:10px;}
.stat-value{font-family:'Orbitron',monospace;font-size:26px;font-weight:700;line-height:1;margin-bottom:6px;background:linear-gradient(135deg,#fff,#7eb8ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
.stat-desc{font-size:10px;color:var(--muted);}
.filters-wrap{background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:14px 18px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px;}
.filter-group{display:flex;align-items:center;gap:8px;}
.filter-label{font-size:11px;color:var(--muted);font-weight:600;letter-spacing:.8px;text-transform:uppercase;white-space:nowrap;}
.filter-select{background:var(--bg3);border:1px solid var(--border);color:var(--text);border-radius:7px;padding:7px 10px;font-family:'Inter',sans-serif;font-size:12px;outline:none;cursor:pointer;transition:border-color .15s;min-width:130px;}
.filter-select:focus{border-color:var(--glow);}
.table-wrap{background:var(--bg2);border:1px solid var(--border);border-radius:14px;overflow:hidden;}
.table-header{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border);background:var(--bg3);}
.table-title{font-family:'Orbitron',monospace;font-size:13px;font-weight:600;letter-spacing:1px;}
.leads-count{font-size:12px;color:var(--muted);background:var(--bg4);padding:4px 10px;border-radius:20px;border:1px solid var(--border);}
table{width:100%;border-collapse:collapse;}
thead th{text-align:left;padding:11px 14px;font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1.2px;font-weight:600;border-bottom:1px solid var(--border);background:var(--bg3);}
tbody tr{border-bottom:1px solid rgba(30,111,217,0.08);cursor:pointer;transition:background .1s;}
tbody tr:last-child{border-bottom:none;}
tbody tr:hover{background:rgba(30,111,217,0.04);}
tbody td{padding:13px 14px;font-size:13px;vertical-align:middle;}
.lead-name{font-weight:500;font-size:13px;}
.lead-sub{font-size:11px;color:var(--muted);margin-top:2px;}
.badge{display:inline-flex;align-items:center;padding:3px 9px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;white-space:nowrap;}
.b-green{background:rgba(0,229,160,0.15);color:var(--green);border:1px solid rgba(0,229,160,0.2);}
.b-red{background:rgba(255,69,96,0.15);color:var(--red);border:1px solid rgba(255,69,96,0.2);}
.b-orange{background:rgba(255,149,0,0.15);color:var(--orange);border:1px solid rgba(255,149,0,0.2);}
.b-blue{background:rgba(30,111,217,0.15);color:var(--glow);border:1px solid rgba(30,111,217,0.2);}
.score-pill{display:inline-flex;align-items:center;justify-content:center;width:30px;height:24px;border-radius:6px;font-family:'Orbitron',monospace;font-weight:700;font-size:11px;}
.s-high{background:rgba(0,229,160,0.2);color:var(--green);}
.s-mid{background:rgba(255,149,0,0.2);color:var(--orange);}
.s-low{background:rgba(255,69,96,0.2);color:var(--red);}
.s-none{background:var(--bg4);color:var(--muted);}
.check{color:var(--green);}
.empty-state{text-align:center;padding:60px 20px;color:var(--muted);}
.loading{text-align:center;padding:40px;color:var(--muted);font-size:13px;}
#overlay{position:fixed;inset:0;background:rgba(3,8,18,.7);z-index:90;display:none;backdrop-filter:blur(4px);}
#overlay.show{display:block;}
#panel{position:fixed;top:0;right:-500px;width:480px;height:100vh;background:var(--bg2);border-left:1px solid var(--border2);z-index:95;overflow-y:auto;transition:right .3s cubic-bezier(.4,0,.2,1);padding:28px;}
#panel.open{right:0;}
.panel-close{position:absolute;top:18px;right:18px;background:var(--bg3);border:1px solid var(--border);color:var(--dim);width:30px;height:30px;border-radius:7px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;transition:all .15s;}
.panel-close:hover{border-color:var(--red);color:var(--red);}
.panel-name{font-family:'Orbitron',monospace;font-size:20px;font-weight:600;letter-spacing:.5px;margin-top:8px;margin-bottom:4px;background:linear-gradient(135deg,#fff,#7eb8ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
.panel-phone{color:var(--muted);font-size:13px;margin-bottom:24px;}
.panel-section{margin-bottom:24px;}
.panel-sec-title{font-size:10px;color:var(--cyan);text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin-bottom:12px;display:flex;align-items:center;gap:8px;}
.panel-sec-title::after{content:'';flex:1;height:1px;background:var(--border);}
.panel-row{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid rgba(30,111,217,0.06);font-size:13px;}
.panel-row:last-child{border-bottom:none;}
.panel-key{color:var(--muted);}
.panel-summary{background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:14px;font-size:13px;line-height:1.65;}
.notes-area{width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:12px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;resize:vertical;min-height:80px;outline:none;margin-bottom:10px;transition:border-color .15s;}
.notes-area:focus{border-color:var(--glow);}
.export-card{background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:24px;margin-bottom:16px;}
.export-title{font-family:'Orbitron',monospace;font-size:14px;font-weight:600;letter-spacing:.8px;margin-bottom:8px;}
.export-sub{font-size:13px;color:var(--muted);margin-bottom:20px;}
.rapport-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;}
.rapport-stat{background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:14px;text-align:center;}
.rapport-val{font-family:'Orbitron',monospace;font-size:22px;font-weight:700;background:linear-gradient(135deg,#fff,#7eb8ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
.rapport-lbl{font-size:10px;color:var(--muted);margin-top:4px;text-transform:uppercase;letter-spacing:.8px;}
.rapport-lead{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(30,111,217,0.06);font-size:13px;}
.rapport-lead:last-child{border-bottom:none;}
body.light{--bg:#f0f5ff;--bg2:#fff;--bg3:#f5f8ff;--bg4:#eef2ff;--border:rgba(30,111,217,0.15);--border2:rgba(30,111,217,0.3);--text:#0d1d35;--dim:#4a6080;--muted:#8ba0be;}
body.light .stat-value,body.light .page-title,body.light .panel-name,body.light .logo-name,body.light .export-title,body.light .table-title,body.light .rapport-val{-webkit-text-fill-color:var(--text);background:none;}
body.light .login-input,body.light .filter-select,body.light .notes-area{color:var(--text);}
@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
.content{animation:fadeUp .3s ease;}
</style>
</head>
<body>
<div id="login-page">
  <div class="login-glow"></div>
  <div class="login-card">
    <div class="login-logo">HELVARO</div>
    <div class="login-sub">AI Lead Kwalificatie Platform</div>
    <label class="login-label">E-mailadres</label>
    <input class="login-input" id="email" type="email" placeholder="naam@bedrijf.com">
    <label class="login-label">Wachtwoord</label>
    <input class="login-input" id="pass" type="password" placeholder="••••••••">
    <button class="login-btn" onclick="doLogin()">INLOGGEN →</button>
    <div class="login-error" id="login-err">Onjuist e-mailadres of wachtwoord.</div>
  </div>
</div>
<div id="app">
  <div class="sidebar">
    <div class="sidebar-logo"><div class="logo-name">HELVARO</div></div>
    <nav class="nav">
      <div class="nav-item active" id="nav-dash" onclick="showPage('dash')">◈ Dashboard</div>
      <div class="nav-item" id="nav-exp" onclick="showPage('exp')">⬇ Exports</div>
    </nav>
    <div class="sidebar-footer">
      <div class="user-card">
        <div class="user-avatar" id="u-av">H</div>
        <div><div class="user-name" id="u-name">Helvaro</div><div class="user-role">Client</div></div>
      </div>
      <button class="logout-btn" onclick="doLogout()">Uitloggen</button>
    </div>
  </div>
  <div class="main">
    <div id="page-dash">
      <div class="topbar">
        <div><div class="page-title">DASHBOARD</div><div class="page-sub">Overzicht van al je leads en prestaties</div></div>
        <div class="topbar-right">
          <button class="btn btn-ghost" onclick="exportCSV()">⬇ CSV</button>
          <button class="theme-btn" id="theme-btn" onclick="toggleTheme()">🌙</button>
        </div>
      </div>
      <div class="content">
        <div class="stats-grid">
          <div class="stat-card"><div class="stat-label">Totaal Leads</div><div class="stat-value" id="s-total">—</div><div class="stat-desc">Alle leads</div></div>
          <div class="stat-card"><div class="stat-label">Gekwalificeerd</div><div class="stat-value" id="s-qual">—</div><div class="stat-desc">Kwalificatie Ja</div></div>
          <div class="stat-card"><div class="stat-label">Afspraken</div><div class="stat-value" id="s-book">—</div><div class="stat-desc">Geboekt</div></div>
          <div class="stat-card"><div class="stat-label">Conversie</div><div class="stat-value" id="s-conv">—</div><div class="stat-desc">Ratio</div></div>
          <div class="stat-card"><div class="stat-label">Deze Maand</div><div class="stat-value" id="s-month">—</div><div class="stat-desc">Huidige maand</div></div>
          <div class="stat-card"><div class="stat-label">Gem. Reactie</div><div class="stat-value" id="s-resp">—</div><div class="stat-desc">Gemiddeld</div></div>
        </div>
        <div class="filters-wrap">
          <div class="filter-group"><span class="filter-label">Status</span><select class="filter-select" id="f-status" onchange="applyFilters()"><option value="">Alle</option><option value="completed">Completed</option><option value="in_progress">In Progress</option><option value="new">Nieuw</option></select></div>
          <div class="filter-group"><span class="filter-label">Gekw.</span><select class="filter-select" id="f-qual" onchange="applyFilters()"><option value="">Alle</option><option value="true">Ja</option><option value="false">Nee</option></select></div>
          <div class="filter-group"><span class="filter-label">Bron</span><select class="filter-select" id="f-bron" onchange="applyFilters()"><option value="">Alle</option><option value="Facebook">Facebook</option><option value="Instagram">Instagram</option><option value="Google">Google</option><option value="Website">Website</option><option value="Overige">Overige</option></select></div>
          <div class="filter-group"><span class="filter-label">Opgepikt</span><select class="filter-select" id="f-opg" onchange="applyFilters()"><option value="">Alle</option><option value="false">Nog niet</option><option value="true">Opgepikt</option></select></div>
          <button class="btn btn-ghost" onclick="toggleSort()" style="margin-left:auto;font-size:11px">↓ Score</button>
        </div>
        <div class="table-wrap">
          <div class="table-header"><div class="table-title">LEADS</div><div class="leads-count" id="leads-count">—</div></div>
          <div id="table-body"><div class="loading">Leads laden...</div></div>
        </div>
      </div>
    </div>
    <div id="page-exp" style="display:none">
      <div class="topbar"><div><div class="page-title">EXPORTS</div><div class="page-sub">Rapporten en data downloads</div></div></div>
      <div class="content">
        <div class="export-card">
          <div class="export-title">Wekelijks Rapport</div>
          <div class="export-sub">Overzicht van leads van de afgelopen 7 dagen.</div>
          <button class="btn" onclick="loadRapport()">Rapport Laden</button>
          <div id="rapport-out" style="margin-top:20px"></div>
        </div>
        <div class="export-card">
          <div class="export-title">Exporteer Leads</div>
          <div class="export-sub">Download alle leads als CSV bestand.</div>
          <button class="btn" onclick="exportCSV()">⬇ Exporteer CSV</button>
        </div>
      </div>
    </div>
  </div>
</div>
<div id="overlay" onclick="closePanel()"></div>
<div id="panel">
  <button class="panel-close" onclick="closePanel()">✕</button>
  <div id="panel-inner"></div>
</div>
<script>
const API='https://helvaro.vercel.app/api';
let apiKey='',leads=[],sortAsc=false,dark=true;
async function doLogin(){
  const email=document.getElementById('email').value.trim();
  const pass=document.getElementById('pass').value;
  const err=document.getElementById('login-err');
  err.style.display='none';
  if(!email||!pass){err.style.display='block';err.textContent='Vul beide velden in.';return;}
  try{
    const r=await fetch(API+'/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:pass})});
    const d=await r.json();
    if(!r.ok)throw new Error(d.error||'Fout');
    apiKey=d.apiKey;
    localStorage.setItem('hvk',d.apiKey);
    localStorage.setItem('hve',email);
    await loadDashboard();
  }catch(e){err.style.display='block';err.textContent=e.message||'Onjuist e-mailadres of wachtwoord.';}
}
async function autoLogin(){
  const k=localStorage.getItem('hvk');
  if(!k)return;
  apiKey=k;
  try{await loadDashboard();}catch{localStorage.removeItem('hvk');apiKey='';}
}
async function loadDashboard(){
  const r=await fetch(API+'/leads',{headers:{'x-api-key':apiKey}});
  if(!r.ok)throw new Error('Niet geautoriseerd');
  const d=await r.json();
  boot(d);
}
function boot(d){
  document.getElementById('login-page').style.display='none';
  document.getElementById('app').style.display='block';
  const n=d.client?.naam||'Client';
  document.getElementById('u-name').textContent=n;
  document.getElementById('u-av').textContent=n[0].toUpperCase();
  document.getElementById('s-total').textContent=d.stats?.total??0;
  document.getElementById('s-qual').textContent=d.stats?.qualified??0;
  document.getElementById('s-book').textContent=d.stats?.booked??0;
  document.getElementById('s-conv').textContent=(d.stats?.conversionRate??0)+'%';
  document.getElementById('s-month').textContent=d.stats?.thisMonth??0;
  document.getElementById('s-resp').textContent=(d.stats?.avgResponseTime??0)+'s';
  leads=d.leads||[];
  renderTable(leads);
}
function doLogout(){localStorage.removeItem('hvk');apiKey='';leads=[];document.getElementById('login-page').style.display='flex';document.getElementById('app').style.display='none';}
function renderTable(rows){
  document.getElementById('leads-count').textContent=rows.length+' leads';
  const body=document.getElementById('table-body');
  if(!rows.length){body.innerHTML='<div class="empty-state">◈<br>Geen leads gevonden</div>';return;}
  let html='<table><thead><tr><th>Naam</th><th>Telefoon</th><th>Status</th><th>Gekw.</th><th>Bron</th><th>Samenvatting</th><th>Score</th><th>Opgep.</th><th>Datum</th><th></th></tr></thead><tbody>';
  rows.forEach((l,i)=>{
    const s=l.leadScore||0;
    const sc=s>=8?'s-high':s>=5?'s-mid':s>0?'s-low':'s-none';
    const qb=l.qualified?'<span class="badge b-green">Ja</span>':l.status==='completed'?'<span class="badge b-red">Nee</span>':'<span class="badge b-orange">Bezig</span>';
    const sb=l.status==='completed'?'<span class="badge b-blue">Klaar</span>':l.status==='in_progress'?'<span class="badge b-orange">Bezig</span>':'<span class="badge">Nieuw</span>';
    const dt=l.datum?new Date(l.datum).toLocaleDateString('nl-BE',{day:'numeric',month:'short',year:'2-digit'}):'—';
    const sm=l.samenvatting?l.samenvatting.substring(0,55)+(l.samenvatting.length>55?'…':''):'—';
    html+=\`<tr onclick="openPanel(\${i})"><td><div class="lead-name">\${l.naam||'Onbekend'}</div><div class="lead-sub">\${l.fit?'Fit: '+cap(l.fit):''}</div></td><td style="color:var(--dim)">\${l.telefoon||'—'}</td><td>\${sb}</td><td>\${qb}</td><td style="font-size:12px">\${l.bron||'—'}</td><td style="max-width:180px;font-size:12px;color:var(--dim)">\${sm}</td><td><span class="score-pill \${sc}">\${s||'—'}</span></td><td>\${l.opgepikt?'<span class="check">✓</span>':'—'}</td><td style="font-size:11px;color:var(--muted)">\${dt}</td><td style="color:var(--muted)">→</td></tr>\`;
  });
  html+='</tbody></table>';
  body.innerHTML=html;
  window._rows=rows;
}
function cap(s){return s?s.charAt(0).toUpperCase()+s.slice(1):s;}
function applyFilters(){
  const st=document.getElementById('f-status').value;
  const qu=document.getElementById('f-qual').value;
  const br=document.getElementById('f-bron').value;
  const op=document.getElementById('f-opg').value;
  renderTable(leads.filter(l=>{
    if(st&&l.status!==st)return false;
    if(qu==='true'&&!l.qualified)return false;
    if(qu==='false'&&l.qualified)return false;
    if(br&&l.bron!==br)return false;
    if(op==='true'&&!l.opgepikt)return false;
    if(op==='false'&&l.opgepikt)return false;
    return true;
  }));
}
function toggleSort(){sortAsc=!sortAsc;renderTable([...leads].sort((a,b)=>sortAsc?(a.leadScore||0)-(b.leadScore||0):(b.leadScore||0)-(a.leadScore||0)));}
function openPanel(i){
  const l=(window._rows||leads)[i];
  const s=l.leadScore||0;
  const sc=s>=8?'s-high':s>=5?'s-mid':s>0?'s-low':'s-none';
  const dt=l.datum?new Date(l.datum).toLocaleDateString('nl-BE',{day:'numeric',month:'long',year:'numeric'}):'—';
  document.getElementById('panel-inner').innerHTML=\`
    <div class="panel-name">\${l.naam||'Onbekend'}</div>
    <div class="panel-phone">\${l.telefoon||'—'}</div>
    <div class="panel-section"><div class="panel-sec-title">Kwalificatie</div>
      <div class="panel-row"><span class="panel-key">Status</span><span class="badge \${l.qualified?'b-green':'b-red'}">\${l.qualified?'Gekwalificeerd':'Niet gekwalificeerd'}</span></div>
      <div class="panel-row"><span class="panel-key">Score</span><span class="score-pill \${sc}">\${s||'—'}</span></div>
      <div class="panel-row"><span class="panel-key">Capaciteit</span><span>\${cap(l.capaciteit)||'—'}</span></div>
      <div class="panel-row"><span class="panel-key">Urgentie</span><span>\${cap(l.urgentie)||'—'}</span></div>
      <div class="panel-row"><span class="panel-key">Fit</span><span>\${cap(l.fit)||'—'}</span></div>
      \${l.verwachteWaarde?\`<div class="panel-row"><span class="panel-key">Verwachte waarde</span><span style="color:var(--green);font-weight:600">\${l.verwachteWaarde}</span></div>\`:''}
    </div>
    \${l.reden?\`<div class="panel-section"><div class="panel-sec-title">Reden</div><div class="panel-summary">\${l.reden}</div></div>\`:''}
    \${l.samenvatting?\`<div class="panel-section"><div class="panel-sec-title">AI Samenvatting</div><div class="panel-summary">\${l.samenvatting}</div></div>\`:''}
    <div class="panel-section"><div class="panel-sec-title">Details</div>
      <div class="panel-row"><span class="panel-key">Bron</span><span>\${l.bron||'—'}</span></div>
      <div class="panel-row"><span class="panel-key">Boekingslink verstuurd</span><span>\${l.boekingslinkVerstuurd?'<span class="check">✓ Ja</span>':'Nee'}</span></div>
      <div class="panel-row"><span class="panel-key">Afspraak geboekt</span><span>\${l.afspraakGeboekt?'<span class="check">✓ Ja</span>':'Nee'}</span></div>
      <div class="panel-row"><span class="panel-key">Datum</span><span>\${dt}</span></div>
    </div>
    <div class="panel-section"><div class="panel-sec-title">Notities</div>
      <textarea class="notes-area" id="notes-ta" placeholder="Voeg een notitie toe...">\${l.notities||''}</textarea>
      <button class="btn" onclick="saveNotes('\${l.id}')">Opslaan</button>
    </div>\`;
  document.getElementById('panel').classList.add('open');
  document.getElementById('overlay').classList.add('show');
}
function closePanel(){document.getElementById('panel').classList.remove('open');document.getElementById('overlay').classList.remove('show');}
async function saveNotes(id){
  const notes=document.getElementById('notes-ta').value;
  try{await fetch(API+'/leads/'+id,{method:'PATCH',headers:{'x-api-key':apiKey,'Content-Type':'application/json'},body:JSON.stringify({notities:notes})});closePanel();}
  catch{alert('Kon niet opslaan.');}
}
async function loadRapport(){
  const out=document.getElementById('rapport-out');
  out.innerHTML='<div class="loading">Laden...</div>';
  try{
    const r=await fetch(API+'/leads?rapport=week',{headers:{'x-api-key':apiKey}});
    const d=await r.json();
    const rp=d.rapport;
    out.innerHTML=\`<div style="font-size:12px;color:var(--muted);margin-bottom:14px">Periode: \${rp.periode}</div>
      <div class="rapport-stats">
        <div class="rapport-stat"><div class="rapport-val">\${rp.totaalLeads}</div><div class="rapport-lbl">Leads</div></div>
        <div class="rapport-stat"><div class="rapport-val">\${rp.gekwalificeerd}</div><div class="rapport-lbl">Gekwal.</div></div>
        <div class="rapport-stat"><div class="rapport-val">\${rp.afspraken}</div><div class="rapport-lbl">Afspraken</div></div>
        <div class="rapport-stat"><div class="rapport-val">\${rp.conversie}%</div><div class="rapport-lbl">Conversie</div></div>
      </div>
      \${rp.gekwalificeerdeLijst?.length?rp.gekwalificeerdeLijst.map(l=>\`<div class="rapport-lead"><span style="font-weight:500;min-width:140px">\${l.naam}</span><span style="color:var(--muted);font-size:12px">\${l.telefoon}</span><span style="font-size:12px;color:var(--dim);flex:1">\${l.samenvatting||''}</span></div>\`).join(''):'<div style="color:var(--muted);font-size:13px">Geen gekwalificeerde leads deze week.</div>'}\`;
  }catch{out.innerHTML='<div style="color:var(--red);font-size:13px">Kon rapport niet laden.</div>';}
}
function exportCSV(){window.open(API+'/leads?export=true','_blank');}
function showPage(p){
  document.getElementById('page-dash').style.display=p==='dash'?'block':'none';
  document.getElementById('page-exp').style.display=p==='exp'?'block':'none';
  document.getElementById('nav-dash').classList.toggle('active',p==='dash');
  document.getElementById('nav-exp').classList.toggle('active',p==='exp');
}
function toggleTheme(){dark=!dark;document.body.classList.toggle('light',!dark);document.getElementById('theme-btn').textContent=dark?'🌙':'☀️';}
document.getElementById('pass').addEventListener('keydown',e=>{if(e.key==='Enter')doLogin();});
autoLogin();
</script>
</body>
</html>`;
