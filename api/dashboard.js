module.exports = async function handler(req, res) {
  const HTML = `<!DOCTYPE html>
<html lang="nl" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Helvaro — AI Lead Kwalificatie</title>
<link rel="icon" href="/favicon.png" type="image/png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
/* ============================================================
   CSS CUSTOM PROPERTIES
   ============================================================ */
:root {
  --bg-primary:    #05050f;
  --bg-card:       #0c0c1e;
  --bg-card-alt:   #11112a;
  --bg-card-hover: #171736;
  --blue-primary:  #7c3aed;
  --blue-bright:   #8b5cf6;
  --cyan:          #a78bfa;
  --green:         #10b981;
  --red:           #ef4444;
  --orange:        #f59e0b;
  --text-primary:  #f4f0ff;
  --text-secondary:#94a3b8;
  --text-muted:    #3d3a6b;
  --border:        #1a1a3a;
  --border-bright: #2d2a6e;
  --scrollbar-bg:  #0c0c1e;
  --scrollbar-thumb: #7c3aed;
  --shadow:        0 8px 32px rgba(0,0,0,0.7);
  --shadow-card:   0 2px 12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03);
  --shadow-glow:   0 0 40px rgba(124,58,237,0.15);
  --transition:    all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
  --radius:        14px;
  --radius-sm:     8px;
}

[data-theme="light"] {
  --bg-primary: #f0f4fa;
  --bg-card: #ffffff;
  --bg-card-alt: #e8eef8;
  --bg-card-hover: #dde5f5;
  --text-primary: #0a1628;
  --text-secondary: #4a5a70;
  --text-muted: #8899aa;
  --border: #c8d8ee;
  --border-bright: #a0b8d8;
  --scrollbar-bg: #e0e8f4;
  --shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
}

/* ============================================================
   RESET & BASE
   ============================================================ */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html { font-size: 15px; }

body {
  font-family: 'Inter', sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  min-height: 100vh;
  overflow-x: hidden;
  transition: background 0.3s ease, color 0.3s ease;
}

/* Grid background pattern */
body::before {
  content: '';
  position: fixed;
  inset: 0;
  background-image:
    linear-gradient(rgba(124, 58, 237, 0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(124, 58, 237, 0.035) 1px, transparent 1px);
  background-size: 48px 48px;
  pointer-events: none;
  z-index: 0;
}

/* Ambient glow orbs */
body::after {
  content: '';
  position: fixed;
  inset: 0;
  background:
    radial-gradient(ellipse 60% 50% at 50% 0%, rgba(124, 58, 237, 0.18) 0%, transparent 65%),
    radial-gradient(ellipse 40% 35% at 85% 80%, rgba(139, 92, 246, 0.08) 0%, transparent 55%),
    radial-gradient(ellipse 30% 30% at 10% 70%, rgba(167, 139, 250, 0.05) 0%, transparent 50%);
  pointer-events: none;
  z-index: 0;
}

[data-theme="light"] body::before {
  background-image:
    linear-gradient(rgba(124, 58, 237, 0.07) 1px, transparent 1px),
    linear-gradient(90deg, rgba(124, 58, 237, 0.07) 1px, transparent 1px);
}

[data-theme="light"] body::after { display: none; }

/* Custom scrollbar */
::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: var(--scrollbar-bg); }
::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 10px; }
::-webkit-scrollbar-thumb:hover { background: var(--blue-bright); }

/* ============================================================
   TYPOGRAPHY
   ============================================================ */
h1, h2, h3, .orbitron { font-family: 'Orbitron', sans-serif; }

.gradient-text {
  background: linear-gradient(135deg, var(--cyan), var(--blue-bright));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

[data-theme="light"] .gradient-text {
  -webkit-text-fill-color: var(--blue-primary);
  background: none;
  color: var(--blue-primary);
}

/* ============================================================
   LAYOUT
   ============================================================ */
#app { position: relative; z-index: 1; }

.app-layout {
  display: flex;
  min-height: 100vh;
}

.main-content {
  flex: 1;
  margin-left: 220px;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  transition: margin-left 0.3s ease;
}

.page-content {
  flex: 1;
  padding: 24px 28px;
}

/* ============================================================
   LOGIN PAGE
   ============================================================ */
#login-page {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-primary);
  z-index: 1000;
  padding: 20px;
}

#login-page::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 60% 50% at 30% 40%, rgba(124, 58, 237, 0.12) 0%, transparent 60%),
    radial-gradient(ellipse 40% 40% at 70% 60%, rgba(167, 139, 250, 0.06) 0%, transparent 60%);
  pointer-events: none;
}

.login-card {
  width: 100%;
  max-width: 420px;
  background: rgba(7, 16, 31, 0.88);
  backdrop-filter: blur(32px) saturate(160%);
  -webkit-backdrop-filter: blur(32px) saturate(160%);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 24px;
  padding: 48px 40px;
  position: relative;
  box-shadow:
    0 32px 80px rgba(0,0,0,0.6),
    0 0 0 1px rgba(37,99,235,0.12),
    0 0 60px rgba(37,99,235,0.06),
    inset 0 1px 0 rgba(255,255,255,0.06);
}

.login-logo {
  text-align: center;
  margin-bottom: 36px;
}

.login-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: linear-gradient(135deg, #7c3aed, #a78bfa);
  font-size: 28px;
  color: white;
  margin-bottom: 16px;
  animation: pulse-glow 2.5s ease-in-out infinite;
  box-shadow: 0 0 0 0 rgba(124, 58, 237, 0.5);
}

@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(124, 58, 237, 0.5); }
  50% { box-shadow: 0 0 0 14px rgba(124, 58, 237, 0); }
}

.login-title {
  font-size: 26px;
  font-weight: 800;
  letter-spacing: 3px;
}

.login-subtitle {
  color: var(--text-secondary);
  font-size: 13px;
  margin-top: 6px;
}

.form-group {
  margin-bottom: 18px;
}

.form-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  margin-bottom: 8px;
}

.form-input {
  width: 100%;
  padding: 13px 16px;
  background: var(--bg-card-alt);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text-primary);
  font-size: 14px;
  font-family: 'Inter', sans-serif;
  transition: var(--transition);
  outline: none;
}

.form-input:focus {
  border-color: var(--blue-bright);
  box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.15);
}

.form-input::placeholder { color: var(--text-muted); }

.btn-login {
  width: 100%;
  padding: 14px;
  background: linear-gradient(135deg, var(--blue-primary), var(--blue-bright));
  border: none;
  border-radius: 10px;
  color: white;
  font-family: 'Orbitron', sans-serif;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 1.5px;
  cursor: pointer;
  margin-top: 8px;
  transition: var(--transition);
  position: relative;
  overflow: hidden;
}

.btn-login::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, var(--blue-bright), var(--cyan));
  opacity: 0;
  transition: opacity 0.3s ease;
}

.btn-login:hover::before { opacity: 1; }
.btn-login:hover { box-shadow: 0 0 30px rgba(139, 92, 246, 0.4); transform: translateY(-1px); }
.btn-login:active { transform: translateY(0); }
.btn-login span { position: relative; z-index: 1; }

.login-error {
  display: none;
  margin-top: 14px;
  padding: 10px 16px;
  background: rgba(255, 69, 96, 0.12);
  border: 1px solid rgba(255, 69, 96, 0.3);
  border-radius: 8px;
  color: var(--red);
  font-size: 13px;
  text-align: center;
}

.login-error.visible { display: block; }

/* ============================================================
   SIDEBAR
   ============================================================ */
.sidebar {
  width: 220px;
  height: 100vh;
  position: fixed;
  left: 0;
  top: 0;
  background: rgba(5, 5, 15, 0.96);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-right: 1px solid rgba(167, 139, 250, 0.08);
  box-shadow: 1px 0 0 rgba(167,139,250,0.04), 4px 0 40px rgba(0,0,0,0.6);
  display: flex;
  flex-direction: column;
  z-index: 100;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

[data-theme="light"] .sidebar {
  background: rgba(255,255,255,0.92);
  border-right: 1px solid rgba(0,0,0,0.08);
  box-shadow: 1px 0 0 rgba(0,0,0,0.04);
}

.sidebar-logo {
  padding: 20px 20px 16px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.sidebar-logo > img {
  height: 52px;
  width: auto;
  flex-shrink: 0;
}

.sidebar-brand {
  font-family: 'Orbitron', sans-serif;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 3px;
  background: linear-gradient(135deg, #fff 40%, #a78bfa);

  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.sidebar-brand span {
  display: none;
}

.sidebar-nav {
  flex: 1;
  padding: 20px 12px;
  overflow-y: auto;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 14px;
  border-radius: 10px;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  transition: var(--transition);
  position: relative;
  margin-bottom: 4px;
  border: none;
  background: none;
  width: 100%;
  text-align: left;
}

.nav-item:hover {
  background: rgba(255,255,255,0.05);
  color: var(--text-primary);
}

.nav-item.active {
  background: linear-gradient(135deg, rgba(124, 58, 237, 0.22), rgba(167, 139, 250, 0.1));
  color: var(--cyan);
  border: none;
  box-shadow: inset 0 0 0 1px rgba(6,182,212,0.18), 0 2px 12px rgba(37,99,235,0.15);
}

.nav-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 20%;
  height: 60%;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: linear-gradient(180deg, var(--blue-bright), var(--cyan));
  box-shadow: 0 0 8px var(--cyan);
}

.nav-icon { font-size: 16px; }

.sidebar-bottom {
  padding: 16px 12px;
  border-top: 1px solid var(--border);
}

.user-info {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 10px;
  margin-bottom: 8px;
}

.user-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--blue-primary), var(--blue-bright));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  color: white;
  flex-shrink: 0;
}

.user-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-role {
  font-size: 11px;
  color: var(--text-muted);
}

.btn-logout {
  width: 100%;
  padding: 9px 14px;
  background: rgba(255, 69, 96, 0.08);
  border: 1px solid rgba(255, 69, 96, 0.2);
  border-radius: 8px;
  color: var(--red);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: var(--transition);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.btn-logout:hover {
  background: rgba(255, 69, 96, 0.15);
  border-color: rgba(255, 69, 96, 0.4);
}

/* Sidebar overlay (mobile) */
.sidebar-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  z-index: 99;
}

.sidebar-overlay.visible { display: block; }

/* ============================================================
   TOPBAR
   ============================================================ */
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 28px;
  background: rgba(5, 5, 15, 0.75);
  backdrop-filter: blur(20px) saturate(160%);
  -webkit-backdrop-filter: blur(20px) saturate(160%);
  border-bottom: 1px solid rgba(167, 139, 250, 0.08);
  box-shadow: 0 1px 0 rgba(167,139,250,0.04), 0 4px 24px rgba(0,0,0,0.5);
  position: sticky;
  top: 0;
  z-index: 50;
}

[data-theme="light"] .topbar {
  background: rgba(240, 244, 250, 0.82);
  border-bottom: 1px solid rgba(0,0,0,0.08);
  box-shadow: 0 1px 0 rgba(255,255,255,0.6), 0 4px 16px rgba(0,0,0,0.06);
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: 14px;
}

.hamburger {
  display: none;
  background: none;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
  cursor: pointer;
  color: var(--text-primary);
  font-size: 16px;
  transition: var(--transition);
}

.hamburger:hover { background: var(--bg-card-alt); }

.page-title {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 2px;
  background: linear-gradient(135deg, var(--text-primary) 60%, var(--cyan));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.page-subtitle {
  font-size: 11.5px;
  color: var(--text-muted);
  margin-top: 2px;
  -webkit-text-fill-color: var(--text-muted);
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.timestamp-info {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
}

.btn-icon {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: var(--transition);
  white-space: nowrap;
}

.btn-icon:hover {
  background: rgba(37,99,235,0.12);
  border-color: rgba(6,182,212,0.25);
  color: var(--cyan);
  box-shadow: 0 0 12px rgba(6,182,212,0.08);
}

.btn-icon .icon { font-size: 14px; }

.btn-icon.spin .icon { animation: spin 1s linear infinite; }

@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

.btn-primary-sm {
  background: linear-gradient(135deg, rgba(124, 58, 237, 0.2), rgba(139, 92, 246, 0.2));
  border-color: var(--blue-primary);
  color: var(--blue-bright);
}

.btn-primary-sm:hover {
  background: linear-gradient(135deg, rgba(124, 58, 237, 0.35), rgba(139, 92, 246, 0.35));
  color: var(--cyan);
}

.theme-toggle { font-size: 16px; padding: 8px 10px; }

/* ============================================================
   STATS GRID
   ============================================================ */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}

.stat-card {
  background: linear-gradient(160deg, var(--bg-card) 0%, rgba(7,16,31,0.8) 100%);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px 18px 16px;
  position: relative;
  overflow: hidden;
  transition: var(--transition);
  cursor: default;
  box-shadow: var(--shadow-card);
}

/* Always-visible subtle top glow line */
.stat-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(37,99,235,0.5), rgba(6,182,212,0.5), transparent);
  transition: opacity 0.3s ease;
}

/* Corner shimmer accent */
.stat-card::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 60px;
  height: 60px;
  background: radial-gradient(circle at top right, rgba(6,182,212,0.08) 0%, transparent 70%);
  pointer-events: none;
}

.stat-card:hover {
  border-color: var(--border-bright);
  background: linear-gradient(160deg, var(--bg-card-hover) 0%, var(--bg-card) 100%);
  transform: translateY(-2px);
  box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(6,182,212,0.1);
}

.stat-card:hover::before {
  background: linear-gradient(90deg, transparent, var(--blue-bright), var(--cyan), transparent);
}

.stat-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  margin-bottom: 10px;
}

.stat-value {
  font-family: 'Orbitron', sans-serif;
  font-size: 28px;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1;
  margin-bottom: 8px;
  letter-spacing: -0.5px;
  text-shadow: 0 0 20px rgba(255,255,255,0.08);
}

.stat-value.cyan  { color: var(--cyan);        text-shadow: 0 0 20px rgba(6,182,212,0.35); }
.stat-value.green { color: var(--green);        text-shadow: 0 0 20px rgba(16,185,129,0.35); }
.stat-value.orange{ color: var(--orange);       text-shadow: 0 0 20px rgba(245,158,11,0.3); }
.stat-value.blue  { color: var(--blue-bright);  text-shadow: 0 0 20px rgba(59,130,246,0.35); }

.stat-desc {
  font-size: 11px;
  color: var(--text-secondary);
  margin-bottom: 10px;
}

.stat-bar {
  height: 3px;
  background: var(--bg-card-alt);
  border-radius: 2px;
  overflow: hidden;
}

.stat-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--blue-primary), var(--cyan));
  border-radius: 2px;
  transition: width 1s cubic-bezier(0.4, 0, 0.2, 1);
  width: 0%;
}

/* ============================================================
   FILTERS BAR
   ============================================================ */
.filters-bar {
  background: rgba(7,16,31,0.6);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 12px 18px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 20px;
  box-shadow: var(--shadow-card);
}

.search-wrapper {
  position: relative;
  flex: 1;
  min-width: 180px;
}

.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  font-size: 14px;
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 9px 12px 9px 36px;
  background: var(--bg-card-alt);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 13px;
  font-family: 'Inter', sans-serif;
  outline: none;
  transition: var(--transition);
}

.search-input:focus {
  border-color: var(--blue-bright);
  box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.12);
}

.search-input::placeholder { color: var(--text-muted); }

.filter-select {
  padding: 9px 12px;
  background: var(--bg-card-alt);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 13px;
  font-family: 'Inter', sans-serif;
  outline: none;
  cursor: pointer;
  transition: var(--transition);
  min-width: 130px;
}

.filter-select:focus { border-color: var(--blue-bright); }

.filters-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 500;
  white-space: nowrap;
}

.filter-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  background: var(--blue-primary);
  border-radius: 50%;
  font-size: 10px;
  font-weight: 700;
  color: white;
}

.btn-reset {
  padding: 8px 12px;
  background: rgba(255, 69, 96, 0.08);
  border: 1px solid rgba(255, 69, 96, 0.2);
  border-radius: 8px;
  color: var(--red);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: var(--transition);
  white-space: nowrap;
  display: none;
}

.btn-reset.visible { display: inline-flex; align-items: center; gap: 4px; }
.btn-reset:hover { background: rgba(255, 69, 96, 0.15); }

.leads-count {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
  margin-left: auto;
}

.leads-count strong { color: var(--text-secondary); }

/* ============================================================
   TABLE
   ============================================================ */
.table-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  box-shadow: var(--shadow-card);
  position: relative;
}

.table-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent 10%, rgba(37,99,235,0.35) 40%, rgba(6,182,212,0.35) 60%, transparent 90%);
  z-index: 1;
  pointer-events: none;
}

.table-wrapper {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

thead tr {
  border-bottom: 1px solid var(--border);
  background: linear-gradient(90deg, rgba(37,99,235,0.05) 0%, rgba(6,182,212,0.02) 100%);
}

th {
  padding: 12px 14px;
  text-align: left;
  font-size: 10.5px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 1px;
  white-space: nowrap;
}

th.sortable {
  cursor: pointer;
  user-select: none;
  transition: color 0.2s;
}

th.sortable:hover { color: var(--cyan); }
th.sort-active { color: var(--cyan); }

.sort-indicator { margin-left: 4px; font-size: 10px; }

tbody tr {
  border-bottom: 1px solid rgba(15, 32, 64, 0.5);
  transition: background 0.15s ease, box-shadow 0.15s ease;
  cursor: pointer;
  animation: rowFadeUp 0.35s ease both;
}

@keyframes rowFadeUp {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

tbody tr:nth-child(even) { background: rgba(255,255,255,0.012); }
tbody tr:hover { background: rgba(124, 58, 237, 0.07); box-shadow: inset 3px 0 0 var(--blue-bright); }
tbody tr:last-child { border-bottom: none; }

td {
  padding: 12px 14px;
  font-size: 13px;
  color: var(--text-primary);
  vertical-align: middle;
}

.td-naam { font-weight: 600; max-width: 140px; }
.td-phone {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.copy-btn {
  opacity: 0;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  font-size: 12px;
  padding: 2px 4px;
  border-radius: 4px;
  transition: var(--transition);
  position: relative;
}

tr:hover .copy-btn { opacity: 1; }
.copy-btn:hover { color: var(--cyan); background: rgba(167, 139, 250, 0.1); }

.copy-tooltip {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 50%;
  transform: translateX(-50%);
  background: var(--green);
  color: #030812;
  font-size: 10px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 4px;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.2s;
}

.copy-tooltip.show { opacity: 1; }

/* Badges */
.badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 9px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.badge-new { background: rgba(138, 150, 170, 0.15); color: #8a96aa; border: 1px solid rgba(138,150,170,0.25); }
.badge-inprogress { background: rgba(255, 149, 0, 0.12); color: var(--orange); border: 1px solid rgba(255,149,0,0.25); }
.badge-done { background: rgba(139, 92, 246, 0.12); color: var(--blue-bright); border: 1px solid rgba(43,143,255,0.25); }
.badge-yes { background: rgba(0, 229, 160, 0.12); color: var(--green); border: 1px solid rgba(0,229,160,0.25); }
.badge-no { background: rgba(255, 69, 96, 0.12); color: var(--red); border: 1px solid rgba(255,69,96,0.25); }
.badge-bron { background: rgba(124, 58, 237, 0.1); color: var(--blue-bright); border: 1px solid rgba(30,111,217,0.2); font-size: 10px; }

/* Score pill */
.score-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 24px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 700;
  font-family: 'Orbitron', sans-serif;
  cursor: default;
}

.score-green { background: rgba(0, 229, 160, 0.15); color: var(--green); border: 1px solid rgba(0,229,160,0.3); }
.score-orange { background: rgba(255, 149, 0, 0.15); color: var(--orange); border: 1px solid rgba(255,149,0,0.3); }
.score-red { background: rgba(255, 69, 96, 0.15); color: var(--red); border: 1px solid rgba(255,69,96,0.3); }
.score-gray { background: rgba(138, 150, 170, 0.1); color: var(--text-muted); border: 1px solid rgba(138,150,170,0.2); }

.td-samenvatting {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-secondary);
  font-size: 12px;
}

.td-arrow { color: var(--text-muted); font-size: 14px; text-align: right; }
tr:hover .td-arrow { color: var(--cyan); }

/* Skeleton loading */
.skeleton-row td { padding: 16px 14px; }

.skeleton {
  background: linear-gradient(90deg, var(--bg-card-alt) 25%, var(--bg-card-hover) 50%, var(--bg-card-alt) 75%);
  background-size: 400% 100%;
  animation: skeleton-shimmer 1.4s ease infinite;
  border-radius: 6px;
  height: 14px;
  display: block;
}

@keyframes skeleton-shimmer {
  0% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

/* Empty state */
.empty-state {
  text-align: center;
  padding: 60px 20px;
}

.empty-icon { font-size: 48px; margin-bottom: 16px; opacity: 0.4; }
.empty-title { font-size: 16px; font-weight: 600; color: var(--text-secondary); margin-bottom: 8px; }
.empty-desc { font-size: 13px; color: var(--text-muted); margin-bottom: 20px; }

/* ============================================================
   DETAIL PANEL
   ============================================================ */
.panel-backdrop {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(6px);
  z-index: 200;
}

.panel-backdrop.visible { display: block; }

.detail-panel {
  position: fixed;
  right: 0;
  top: 0;
  height: 100vh;
  width: 480px;
  background: rgba(5, 5, 14, 0.97);
  backdrop-filter: blur(28px) saturate(150%);
  -webkit-backdrop-filter: blur(28px) saturate(150%);
  border-left: 1px solid rgba(167, 139, 250, 0.1);
  box-shadow: -8px 0 48px rgba(0,0,0,0.7), -1px 0 0 rgba(167,139,250,0.05);
  z-index: 201;
  display: flex;
  flex-direction: column;
  transform: translateX(100%);
  transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.detail-panel.visible { transform: translateX(0); }

.panel-header {
  padding: 24px 24px 20px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  position: relative;
}

.panel-close {
  position: absolute;
  top: 18px;
  right: 18px;
  background: var(--bg-card-alt);
  border: 1px solid var(--border);
  border-radius: 8px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 16px;
  transition: var(--transition);
}

.panel-close:hover { background: rgba(255,69,96,0.1); border-color: var(--red); color: var(--red); }

.panel-avatar {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  font-weight: 700;
  font-family: 'Orbitron', sans-serif;
  margin-bottom: 14px;
}

.avatar-green { background: rgba(0, 229, 160, 0.15); color: var(--green); border: 2px solid rgba(0,229,160,0.3); }
.avatar-red { background: rgba(255, 69, 96, 0.15); color: var(--red); border: 2px solid rgba(255,69,96,0.3); }
.avatar-orange { background: rgba(255, 149, 0, 0.15); color: var(--orange); border: 2px solid rgba(255,149,0,0.3); }

.panel-name {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 1px;
  margin-bottom: 8px;
}

.panel-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.panel-phone {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-secondary);
}

.panel-copy-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  font-size: 12px;
  padding: 3px 6px;
  border-radius: 4px;
  transition: var(--transition);
}

.panel-copy-btn:hover { color: var(--cyan); background: rgba(0,212,255,0.1); }

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px 24px;
}

.panel-section {
  margin-bottom: 22px;
}

.panel-section-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--cyan);
  text-transform: uppercase;
  letter-spacing: 1.2px;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.panel-section-title::after {
  content: '';
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, rgba(0,212,255,0.3), transparent);
}

.panel-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 8px 0;
  border-bottom: 1px solid rgba(15, 32, 64, 0.6);
  font-size: 13px;
  gap: 10px;
}

.panel-row:last-child { border-bottom: none; }
.panel-row-label { color: var(--text-muted); flex-shrink: 0; }
.panel-row-value { color: var(--text-primary); text-align: right; font-weight: 500; }

/* Score bar */
.score-bar-wrapper { display: flex; align-items: center; gap: 10px; }

.score-bar {
  display: flex;
  gap: 3px;
}

.score-segment {
  width: 18px;
  height: 8px;
  border-radius: 2px;
  background: var(--bg-card-alt);
  transition: background 0.3s ease;
}

.score-segment.filled { background: linear-gradient(90deg, var(--blue-primary), var(--cyan)); }
.score-segment.filled.high { background: linear-gradient(90deg, var(--green), var(--cyan)); }
.score-segment.filled.low { background: linear-gradient(90deg, var(--red), var(--orange)); }

.score-number {
  font-family: 'Orbitron', sans-serif;
  font-size: 22px;
  font-weight: 700;
}

/* Notes */
.notes-textarea {
  width: 100%;
  min-height: 100px;
  padding: 12px;
  background: var(--bg-card-alt);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text-primary);
  font-size: 13px;
  font-family: 'Inter', sans-serif;
  resize: vertical;
  outline: none;
  transition: var(--transition);
  margin-bottom: 10px;
}

.notes-textarea:focus { border-color: var(--blue-bright); box-shadow: 0 0 0 2px rgba(43,143,255,0.12); }

.btn-save {
  padding: 10px 20px;
  background: linear-gradient(135deg, var(--blue-primary), var(--blue-bright));
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: var(--transition);
}

.btn-save:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(43,143,255,0.3); }

/* ── Nav badge (new-lead notification) ── */
.nav-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  border-radius: 9px;
  background: var(--red);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  padding: 0 4px;
  margin-left: auto;
  animation: pulse-glow 1.5s ease-in-out infinite;
}

/* ── Status select in detail panel ── */
.status-select {
  background: var(--bg-card-alt);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 12px;
  font-family: 'Inter', sans-serif;
  padding: 5px 10px;
  cursor: pointer;
  outline: none;
  transition: border-color .15s;
}
.status-select:focus { border-color: var(--blue-bright); }

/* ── WhatsApp conversation bubbles ── */
.chat-wrap {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 280px;
  overflow-y: auto;
  padding: 4px 0;
}
.chat-bubble {
  max-width: 85%;
  padding: 8px 12px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.5;
  word-break: break-word;
}
.chat-bubble.user {
  align-self: flex-start;
  background: var(--bg-card-alt);
  border: 1px solid var(--border);
  border-bottom-left-radius: 3px;
  color: var(--text-primary);
}
.chat-bubble.ai {
  align-self: flex-end;
  background: rgba(30,111,217,0.18);
  border: 1px solid rgba(30,111,217,0.3);
  border-bottom-right-radius: 3px;
  color: var(--text-primary);
}
.chat-label {
  font-size: 10px;
  color: var(--text-muted);
  margin-bottom: 2px;
  text-transform: uppercase;
  letter-spacing: .8px;
}

/* ── Chart container ── */
.chart-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 20px 24px;
  margin-bottom: 20px;
}
.chart-title {
  font-family: 'Orbitron', sans-serif;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 1.5px;
  text-transform: uppercase;
  margin-bottom: 16px;
}

/* ── Admin client cards ── */
.admin-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}
.admin-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 20px;
  cursor: pointer;
  transition: border-color .2s, transform .15s;
}
.admin-card:hover { border-color: var(--blue-primary); transform: translateY(-2px); }
.admin-card-name { font-weight: 700; font-size: 15px; margin-bottom: 4px; }
.admin-card-code { font-size: 11px; color: var(--text-muted); letter-spacing: 1px; margin-bottom: 14px; }
.admin-card-stats { display: flex; gap: 16px; }
.admin-stat { text-align: center; }
.admin-stat-val { font-size: 22px; font-weight: 700; color: var(--blue-bright); }
.admin-stat-lbl { font-size: 10px; color: var(--text-muted); margin-top: 2px; }

.check-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.check-yes { color: var(--green); }
.check-no { color: var(--red); }

.ai-summary {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
  padding: 12px;
  background: rgba(124, 58, 237, 0.06);
  border-left: 3px solid var(--blue-primary);
  border-radius: 0 8px 8px 0;
}

/* ============================================================
   TOAST NOTIFICATIONS
   ============================================================ */
.toast-container {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 10px;
  pointer-events: none;
}

.toast {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px 16px;
  min-width: 280px;
  max-width: 360px;
  box-shadow: var(--shadow);
  pointer-events: all;
  position: relative;
  overflow: hidden;
  animation: toastIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

.toast.dismissing { animation: toastOut 0.3s ease forwards; }

@keyframes toastIn {
  from { opacity: 0; transform: translateX(100%) scale(0.9); }
  to { opacity: 1; transform: translateX(0) scale(1); }
}

@keyframes toastOut {
  from { opacity: 1; transform: translateX(0) scale(1); max-height: 200px; }
  to { opacity: 0; transform: translateX(100%) scale(0.9); max-height: 0; padding: 0; margin: 0; }
}

.toast-success { border-left: 3px solid var(--green); }
.toast-error { border-left: 3px solid var(--red); }
.toast-info { border-left: 3px solid var(--blue-bright); }

.toast-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.toast-title {
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}

.toast-success .toast-title { color: var(--green); }
.toast-error .toast-title { color: var(--red); }
.toast-info .toast-title { color: var(--blue-bright); }

.toast-close {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  font-size: 14px;
  padding: 2px;
  transition: color 0.2s;
  line-height: 1;
}

.toast-close:hover { color: var(--text-primary); }

.toast-message { font-size: 13px; color: var(--text-secondary); }

.toast-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 2px;
  border-radius: 0 0 12px 12px;
  animation: toastProgress 3.5s linear forwards;
}

.toast-success .toast-progress { background: var(--green); }
.toast-error .toast-progress { background: var(--red); }
.toast-info .toast-progress { background: var(--blue-bright); }

@keyframes toastProgress {
  from { width: 100%; }
  to { width: 0%; }
}

/* ============================================================
   EXPORTS PAGE
   ============================================================ */
.exports-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.export-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 28px;
}

.export-card-title {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 1px;
  margin-bottom: 8px;
}

.export-card-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 20px;
  line-height: 1.5;
}

.rapport-stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 20px;
}

.rapport-stat {
  background: var(--bg-card-alt);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px;
}

.rapport-stat-value {
  font-family: 'Orbitron', sans-serif;
  font-size: 22px;
  font-weight: 700;
  color: var(--cyan);
  margin-bottom: 4px;
}

.rapport-stat-label {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.7px;
}

.rapport-leads-list { margin-top: 16px; }

.rapport-lead-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}

.rapport-lead-item:last-child { border-bottom: none; }

/* ============================================================
   PAGES VISIBILITY
   ============================================================ */
.page { display: none; }
.page.active { display: block; }

/* ============================================================
   RESPONSIVE - MOBILE
   ============================================================ */
@media (max-width: 1100px) {
  .stats-grid { grid-template-columns: repeat(3, 1fr); }
}

@media (max-width: 768px) {
  .sidebar {
    transform: translateX(-100%);
  }

  .sidebar.mobile-open {
    transform: translateX(0);
    box-shadow: 4px 0 30px rgba(0, 0, 0, 0.5);
  }

  .main-content {
    margin-left: 0;
  }

  .hamburger { display: flex; }

  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .page-content { padding: 16px; }

  .topbar { padding: 12px 16px; }

  .timestamp-info { display: none; }

  .detail-panel {
    width: 100vw;
  }

  .exports-grid {
    grid-template-columns: 1fr;
  }

  .filters-bar {
    flex-direction: column;
    align-items: stretch;
  }

  .filter-select, .search-wrapper { min-width: unset; }

  .leads-count { margin-left: 0; }
}

@media (max-width: 480px) {
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
  .login-card { padding: 32px 24px; }
}

/* ============================================================
   PAGE HIDDEN WHEN LOGGED OUT
   ============================================================ */
#dashboard-app { display: none; }
#dashboard-app.visible { display: flex; flex-direction: column; min-height: 100vh; }
</style>
</head>
<body>

<!-- ============================================================
     LOGIN PAGE
     ============================================================ -->
<div id="login-page">
  <div class="login-card">
    <div class="login-logo">
      <div class="login-icon" style="background:none;box-shadow:none;padding:0"><img src="data:image/png;base64,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" alt="Helvaro" style="height:64px;width:auto;object-fit:contain;filter:drop-shadow(0 0 14px rgba(43,143,255,0.55))"></div>
      <p class="login-subtitle">AI Lead Kwalificatie Platform</p>
    </div>
    <div class="form-group">
      <label class="form-label" for="login-email">E-mailadres</label>
      <input class="form-input" type="email" id="login-email" placeholder="naam@bedrijf.nl" autocomplete="username">
    </div>
    <div class="form-group">
      <label class="form-label" for="login-password">Wachtwoord</label>
      <input class="form-input" type="password" id="login-password" placeholder="••••••••" autocomplete="current-password">
    </div>
    <button class="btn-login" id="btn-login"><span>INLOGGEN</span></button>
        <div class="login-error" id="login-error">Ongeldige inloggegevens. Probeer opnieuw.</div>
  </div>
</div>

<!-- ============================================================
     DASHBOARD APP
     ============================================================ -->
<div id="dashboard-app">

  <!-- Sidebar overlay (mobile) -->
  <div class="sidebar-overlay" id="sidebar-overlay"></div>

  <!-- Sidebar -->
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-logo">
      <img src="data:image/png;base64,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" alt="Helvaro" style="height:32px;width:auto;object-fit:contain;filter:drop-shadow(0 0 8px rgba(43,143,255,0.5))">
      <div class="sidebar-brand">HELVARO<span>AI SALES PLATFORM</span></div>
    </div>
    <nav class="sidebar-nav">
      <button class="nav-item active" data-page="dashboard" id="nav-dashboard">
        <span class="nav-icon">◈</span>
        Dashboard
      </button>
      <button class="nav-item" data-page="calendly" id="nav-calendly">
        <span class="nav-icon">📅</span>
        Kalender
      </button>
      <button class="nav-item" data-page="exports" id="nav-exports">
        <span class="nav-icon">⇓</span>
        Exports
      </button>
      <button class="nav-item" data-page="admin" id="nav-admin" style="display:none">
        <span class="nav-icon">⚙</span>
        Klanten
      </button>
    </nav>
    <div class="sidebar-bottom">
      <div class="user-info">
        <div class="user-avatar" id="user-avatar">HV</div>
        <div>
          <div class="user-name" id="user-name">Gebruiker</div>
          <div class="user-role">Client Account</div>
        </div>
      </div>
      <button class="btn-logout" id="btn-logout">⇤ Uitloggen</button>
    </div>
  </aside>

  <!-- Main Content -->
  <div class="main-content">

    <!-- Topbar -->
    <header class="topbar">
      <div class="topbar-left">
        <button class="hamburger" id="hamburger">☰</button>
        <div>
          <div class="page-title orbitron gradient-text" id="topbar-title">Dashboard</div>
          <div class="page-subtitle" id="topbar-subtitle">Overzicht van uw gekwalificeerde leads</div>
        </div>
      </div>
      <div class="topbar-right">
        <span class="timestamp-info" id="timestamp-info">Bijgewerkt zojuist</span>
        <button class="btn-icon" id="btn-refresh">
          <span class="icon">↻</span>
          Vernieuwen
        </button>
        <button class="btn-icon btn-primary-sm" id="btn-export-csv">
          <span class="icon">⇓</span>
          CSV Export
        </button>
      </div>
    </header>

    <!-- Dashboard Page -->
    <main class="page-content page active" id="page-dashboard">

      <!-- Stats Grid -->
      <div class="stats-grid" id="stats-grid">
        <!-- Skeleton stats -->
        <div class="stat-card"><div class="stat-label">Laden...</div><div class="stat-value"><div class="skeleton" style="width:60%;height:28px"></div></div></div>
        <div class="stat-card"><div class="stat-label">Laden...</div><div class="stat-value"><div class="skeleton" style="width:60%;height:28px"></div></div></div>
        <div class="stat-card"><div class="stat-label">Laden...</div><div class="stat-value"><div class="skeleton" style="width:60%;height:28px"></div></div></div>
        <div class="stat-card"><div class="stat-label">Laden...</div><div class="stat-value"><div class="skeleton" style="width:60%;height:28px"></div></div></div>
        <div class="stat-card"><div class="stat-label">Laden...</div><div class="stat-value"><div class="skeleton" style="width:60%;height:28px"></div></div></div>
        <div class="stat-card"><div class="stat-label">Laden...</div><div class="stat-value"><div class="skeleton" style="width:60%;height:28px"></div></div></div>
      </div>

      <!-- Chart -->
      <div class="chart-card">
        <div class="chart-title">Leads per week (laatste 8 weken)</div>
        <canvas id="leads-chart" height="80"></canvas>
      </div>

      <!-- Filters Bar -->
      <div class="filters-bar">
        <div class="search-wrapper">
          <span class="search-icon">🔍</span>
          <input class="search-input" id="search-input" type="text" placeholder="Zoek op naam of telefoonnummer...">
        </div>
        <select class="filter-select" id="filter-status">
          <option value="">Alle statussen</option>
          <option value="new">Nieuw</option>
          <option value="in_progress">Bezig</option>
          <option value="completed">Klaar</option>
        </select>
        <select class="filter-select" id="filter-qualified">
          <option value="">Alle leads</option>
          <option value="true">Gekwalificeerd</option>
          <option value="false">Niet gekwalificeerd</option>
        </select>
        <select class="filter-select" id="filter-bron">
          <option value="">Alle bronnen</option>
        </select>
        <select class="filter-select" id="filter-opgepikt">
          <option value="">Opgepikt: Alle</option>
          <option value="true">Opgepikt</option>
          <option value="false">Niet opgepikt</option>
        </select>
        <span class="filters-label">
          Filters
          <span class="filter-badge" id="filter-badge" style="display:none">0</span>
        </span>
        <button class="btn-reset" id="btn-reset-filters">✕ Reset</button>
        <span class="leads-count" id="leads-count"></span>
      </div>

      <!-- Table -->
      <div class="table-card">
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th class="sortable" data-col="naam">Naam <span class="sort-indicator" data-col="naam"></span></th>
                <th>Telefoon</th>
                <th>Status</th>
                <th>Gekw.</th>
                <th>Bron</th>
                <th>Samenvatting</th>
                <th class="sortable" data-col="leadScore">Score <span class="sort-indicator" data-col="leadScore"></span></th>
                <th>Opgepikt</th>
                <th class="sortable" data-col="datum">Datum <span class="sort-indicator" data-col="datum"></span></th>
                <th></th>
              </tr>
            </thead>
            <tbody id="leads-tbody">
              <!-- Skeleton rows -->
              <tr class="skeleton-row"><td><div class="skeleton" style="width:90px"></div></td><td><div class="skeleton" style="width:100px"></div></td><td><div class="skeleton" style="width:60px"></div></td><td><div class="skeleton" style="width:40px"></div></td><td><div class="skeleton" style="width:70px"></div></td><td><div class="skeleton" style="width:140px"></div></td><td><div class="skeleton" style="width:30px"></div></td><td><div class="skeleton" style="width:50px"></div></td><td><div class="skeleton" style="width:80px"></div></td><td></td></tr>
              <tr class="skeleton-row"><td><div class="skeleton" style="width:80px"></div></td><td><div class="skeleton" style="width:110px"></div></td><td><div class="skeleton" style="width:55px"></div></td><td><div class="skeleton" style="width:40px"></div></td><td><div class="skeleton" style="width:65px"></div></td><td><div class="skeleton" style="width:160px"></div></td><td><div class="skeleton" style="width:30px"></div></td><td><div class="skeleton" style="width:50px"></div></td><td><div class="skeleton" style="width:80px"></div></td><td></td></tr>
              <tr class="skeleton-row"><td><div class="skeleton" style="width:100px"></div></td><td><div class="skeleton" style="width:105px"></div></td><td><div class="skeleton" style="width:65px"></div></td><td><div class="skeleton" style="width:40px"></div></td><td><div class="skeleton" style="width:70px"></div></td><td><div class="skeleton" style="width:130px"></div></td><td><div class="skeleton" style="width:30px"></div></td><td><div class="skeleton" style="width:50px"></div></td><td><div class="skeleton" style="width:80px"></div></td><td></td></tr>
              <tr class="skeleton-row"><td><div class="skeleton" style="width:75px"></div></td><td><div class="skeleton" style="width:100px"></div></td><td><div class="skeleton" style="width:58px"></div></td><td><div class="skeleton" style="width:40px"></div></td><td><div class="skeleton" style="width:68px"></div></td><td><div class="skeleton" style="width:150px"></div></td><td><div class="skeleton" style="width:30px"></div></td><td><div class="skeleton" style="width:50px"></div></td><td><div class="skeleton" style="width:80px"></div></td><td></td></tr>
              <tr class="skeleton-row"><td><div class="skeleton" style="width:85px"></div></td><td><div class="skeleton" style="width:108px"></div></td><td><div class="skeleton" style="width:62px"></div></td><td><div class="skeleton" style="width:40px"></div></td><td><div class="skeleton" style="width:72px"></div></td><td><div class="skeleton" style="width:145px"></div></td><td><div class="skeleton" style="width:30px"></div></td><td><div class="skeleton" style="width:50px"></div></td><td><div class="skeleton" style="width:80px"></div></td><td></td></tr>
              <tr class="skeleton-row"><td><div class="skeleton" style="width:95px"></div></td><td><div class="skeleton" style="width:102px"></div></td><td><div class="skeleton" style="width:60px"></div></td><td><div class="skeleton" style="width:40px"></div></td><td><div class="skeleton" style="width:66px"></div></td><td><div class="skeleton" style="width:155px"></div></td><td><div class="skeleton" style="width:30px"></div></td><td><div class="skeleton" style="width:50px"></div></td><td><div class="skeleton" style="width:80px"></div></td><td></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </main>

    <!-- Exports Page -->
    <main class="page-content page" id="page-exports">
      <div class="exports-grid">
        <!-- Weekly Rapport Card -->
        <div class="export-card">
          <div class="export-card-title orbitron gradient-text">Weekrapport</div>
          <p class="export-card-desc">Genereer een gedetailleerd weekoverzicht met statistieken en gekwalificeerde leads.</p>
          <button class="btn-icon btn-primary-sm" id="btn-load-rapport" style="width:100%;justify-content:center;padding:12px">
            <span class="icon">📊</span>
            Rapport laden
          </button>
          <div id="rapport-content" style="display:none;margin-top:20px">
            <div class="rapport-stats" id="rapport-stats"></div>
            <div id="rapport-leads-section"></div>
          </div>
          <div id="rapport-skeleton" style="display:none;margin-top:20px">
            <div class="rapport-stats">
              <div class="rapport-stat"><div class="skeleton" style="height:28px;margin-bottom:8px"></div><div class="skeleton" style="width:60%"></div></div>
              <div class="rapport-stat"><div class="skeleton" style="height:28px;margin-bottom:8px"></div><div class="skeleton" style="width:60%"></div></div>
              <div class="rapport-stat"><div class="skeleton" style="height:28px;margin-bottom:8px"></div><div class="skeleton" style="width:60%"></div></div>
              <div class="rapport-stat"><div class="skeleton" style="height:28px;margin-bottom:8px"></div><div class="skeleton" style="width:60%"></div></div>
            </div>
          </div>
        </div>

        <!-- CSV Export Card -->
        <div class="export-card">
          <div class="export-card-title orbitron gradient-text">CSV Export</div>
          <p class="export-card-desc">Download al uw leads als CSV-bestand voor gebruik in Excel of andere tools.</p>
          <button class="btn-icon btn-primary-sm" id="btn-download-csv" style="width:100%;justify-content:center;padding:12px">
            <span class="icon">⇓</span>
            CSV downloaden
          </button>
          <div style="margin-top:20px;padding:16px;background:var(--bg-card-alt);border-radius:10px;border:1px solid var(--border)">
            <div style="font-size:12px;color:var(--text-muted);line-height:1.6">
              <div style="margin-bottom:6px;display:flex;gap:6px;align-items:center"><span style="color:var(--green)">✓</span> Alle leadgegevens</div>
              <div style="margin-bottom:6px;display:flex;gap:6px;align-items:center"><span style="color:var(--green)">✓</span> Contactgegevens</div>
              <div style="margin-bottom:6px;display:flex;gap:6px;align-items:center"><span style="color:var(--green)">✓</span> Kwalificatiescores</div>
              <div style="display:flex;gap:6px;align-items:center"><span style="color:var(--green)">✓</span> AI samenvattingen</div>
            </div>
          </div>
        </div>
      </div>
    </main>

    <main class="page-content page" id="page-admin">
      <div id="admin-content">
        <div class="admin-grid" id="admin-grid">
          <div style="color:var(--text-muted);font-size:14px">Klanten laden...</div>
        </div>
      </div>
    </main>

    <main class="page-content page" id="page-calendly">
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;overflow:hidden;height:calc(100vh - 120px);display:flex;flex-direction:column;">
        <div style="padding:20px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;flex-shrink:0;">
          <div>
            <div class="orbitron gradient-text" style="font-size:16px;font-weight:700;letter-spacing:1px;">Kalender</div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:3px;">Beheer uw afspraken via Calendly</div>
          </div>
          <a id="calendly-open-link" href="#" target="_blank" style="margin-left:auto;display:flex;align-items:center;gap:6px;padding:8px 14px;background:var(--bg-card-alt);border:1px solid var(--border);border-radius:8px;color:var(--text-primary);font-size:12px;font-weight:500;text-decoration:none;">
            ↗ Openen in Calendly
          </a>
        </div>
        <div style="flex:1;position:relative;">
          <iframe
            id="calendly-iframe"
            src="about:blank"
            style="width:100%;height:100%;border:none;display:block;"
            allow="payment"
          ></iframe>
        </div>
      </div>
    </main>
  </div>
</div>

<!-- Detail Panel -->
<div class="panel-backdrop" id="panel-backdrop"></div>
<div class="detail-panel" id="detail-panel">
  <div class="panel-header">
    <button class="panel-close" id="panel-close">✕</button>
    <div class="panel-avatar" id="panel-avatar">HV</div>
    <div class="panel-name orbitron" id="panel-name">Lead naam</div>
    <div class="panel-meta">
      <div class="panel-phone">
        <span>📞</span>
        <span id="panel-phone">—</span>
        <button class="panel-copy-btn" id="panel-copy-phone" title="Kopieer nummer">⧉</button>
      </div>
      <span id="panel-bron-badge"></span>
    </div>
  </div>
  <div class="panel-body" id="panel-body"></div>
</div>

<!-- Toast Container -->
<div class="toast-container" id="toast-container"></div>

<script>
/* ============================================================
   STATE
   ============================================================ */
const state = {
  apiKey: '',
  leads: [],
  filteredLeads: [],
  sortCol: 'datum',
  sortAsc: false,
  searchQ: '',
  lastFetch: null,
  currentPage: 'dashboard',
  activeLead: null,
  clientName: '',
  calendlyUrl: '',
  stats: null,
  knownLeadIds: null,
  newLeadCount: 0,
  adminLoaded: false,
  adminClients: [],
  leadsChart: null,
};

const API_BASE = '/api';

/* ============================================================
   UTILITY FUNCTIONS
   ============================================================ */
// Escape user data before inserting into innerHTML — prevents XSS
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getInitials(name) {
  if (!name) return '?';
  return name.trim().split(/\\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

function formatDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function timeAgo(date) {
  if (!date) return 'onbekend';
  const diff = Math.floor((Date.now() - date) / 60000);
  if (diff < 1) return 'zojuist';
  if (diff === 1) return '1 minuut geleden';
  if (diff < 60) return \`\${diff} minuten geleden\`;
  const h = Math.floor(diff / 60);
  return h === 1 ? '1 uur geleden' : \`\${h} uur geleden\`;
}

function debounce(fn, delay) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

function animateCounter(el, target, suffix = '') {
  const num = parseFloat(String(target).replace(/[^0-9.]/g, '')) || 0;
  const isFloat = String(target).includes('.');
  const decimals = isFloat ? (String(target).split('.')[1] || '').length : 0;
  const duration = 1000;
  const start = performance.now();
  function step(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = num * eased;
    el.textContent = (decimals > 0 ? current.toFixed(decimals) : Math.floor(current)) + suffix;
    if (progress < 1) requestAnimationFrame(step);
    else el.textContent = (decimals > 0 ? num.toFixed(decimals) : num) + suffix;
  }
  requestAnimationFrame(step);
}

/* ============================================================
   TOAST SYSTEM
   ============================================================ */
function toast(message, type = 'info', title = null) {
  const container = document.getElementById('toast-container');
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const titles = { success: 'Gelukt', error: 'Fout', info: 'Info' };
  const el = document.createElement('div');
  el.className = \`toast toast-\${type}\`;
  el.innerHTML = \`
    <div class="toast-header">
      <span class="toast-title">\${icons[type]} \${title || titles[type]}</span>
      <button class="toast-close" onclick="dismissToast(this.closest('.toast'))">✕</button>
    </div>
    <div class="toast-message">\${message}</div>
    <div class="toast-progress"></div>
  \`;
  container.appendChild(el);
  const timer = setTimeout(() => dismissToast(el), 3500);
  el._timer = timer;
}

function dismissToast(el) {
  if (!el || el.classList.contains('dismissing')) return;
  clearTimeout(el._timer);
  el.classList.add('dismissing');
  setTimeout(() => el.remove(), 300);
}

/* ============================================================
   THEME — locked dark to match helvaro.pro brand
   ============================================================ */
function initTheme() {
  document.documentElement.setAttribute('data-theme', 'dark');
  localStorage.removeItem('hv-theme');
}

/* ============================================================
   AUTH
   ============================================================ */
const AUTH_URL = '/api/auth';

function showView(view) {
  document.getElementById('login-page').style.display = view === 'login' ? 'flex' : 'none';
}

function saveSession(apiKey, clientName, projectCode) {
  localStorage.setItem('hvk', apiKey);
  localStorage.setItem('hv-client', clientName || '');
  localStorage.setItem('hv-project', projectCode || '');
  state.apiKey = apiKey;
  state.clientName = clientName || '';
}

function clearSession() {
  localStorage.removeItem('hvk');
  localStorage.removeItem('hv-client');
  localStorage.removeItem('hv-project');
  state.apiKey = '';
  state.clientName = '';
}

function tryAutoLogin() {
  const key = localStorage.getItem('hvk');
  if (!key) return false;
  state.apiKey = key;
  state.clientName = localStorage.getItem('hv-client') || '';
  return true;
}

function logout() {
  clearSession();
  state.leads = [];
  state.stats = null;
  document.getElementById('dashboard-app').classList.remove('visible');
  document.getElementById('login-page').style.display = 'flex';
  document.getElementById('login-email').value = '';
  document.getElementById('login-password').value = '';
  document.getElementById('login-error').classList.remove('visible');
}

/* ============================================================
   API CALLS
   ============================================================ */
async function fetchLeads() {
  const resp = await fetch(\`\${API_BASE}/leads\`, {
    headers: { 'x-api-key': state.apiKey }
  });
  if (!resp.ok) throw new Error(\`API fout: \${resp.status}\`);
  return resp.json();
}

async function fetchRapport() {
  const resp = await fetch(\`\${API_BASE}/leads?rapport=week\`, {
    headers: { 'x-api-key': state.apiKey }
  });
  if (!resp.ok) throw new Error(\`API fout: \${resp.status}\`);
  return resp.json();
}

async function patchNotes(id, notities) {
  const resp = await fetch(\`\${API_BASE}/leads?id=\${encodeURIComponent(id)}\`, {
    method: 'PATCH',
    headers: { 'x-api-key': state.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ notities })
  });
  if (!resp.ok) throw new Error(\`Opslaan mislukt: \${resp.status}\`);
  return resp.json();
}

async function patchStatus(id, status) {
  const resp = await fetch(\`\${API_BASE}/leads?id=\${encodeURIComponent(id)}\`, {
    method: 'PATCH',
    headers: { 'x-api-key': state.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  });
  if (!resp.ok) throw new Error(\`Status opslaan mislukt: \${resp.status}\`);
  return resp.json();
}

function exportCSV() {
  const url = \`\${API_BASE}/leads?export=true\`;
  const a = document.createElement('a');
  a.href = url;
  a.setAttribute('download', 'helvaro-leads.csv');
  // Add auth via fetch then blob
  fetch(url, { headers: { 'x-api-key': state.apiKey } })
    .then(r => {
      if (!r.ok) throw new Error('Export mislukt');
      return r.blob();
    })
    .then(blob => {
      const burl = URL.createObjectURL(blob);
      const a2 = document.createElement('a');
      a2.href = burl;
      a2.download = 'helvaro-leads.csv';
      document.body.appendChild(a2);
      a2.click();
      a2.remove();
      URL.revokeObjectURL(burl);
      toast('CSV-bestand is gedownload', 'success');
    })
    .catch(err => toast(err.message, 'error'));
}

/* ============================================================
   REFRESH DATA
   ============================================================ */
async function refreshData() {
  const btn = document.getElementById('btn-refresh');
  if (btn) btn.classList.add('spin');

  try {
    const data = await fetchLeads();
    state.leads = data.leads || [];
    state.stats = data.stats || {};
    state.clientName = data.client?.naam || 'Gebruiker';
    state.calendlyUrl = data.client?.calendly || '';
    state.lastFetch = Date.now();

    updateUserInfo();
    renderStats();
    applyFilters();
    updateTimestamp();
    renderChart();
    detectNewLeads(state.leads);
  } catch (err) {
    toast('Kon geen gegevens ophalen: ' + err.message, 'error');
  } finally {
    if (btn) btn.classList.remove('spin');
  }
}

/* ============================================================
   UPDATE TIMESTAMP
   ============================================================ */
function updateTimestamp() {
  const el = document.getElementById('timestamp-info');
  if (el && state.lastFetch) {
    el.textContent = 'Bijgewerkt ' + timeAgo(state.lastFetch);
  }
}

setInterval(updateTimestamp, 60000);
// Poll for new leads every 30 seconds
setInterval(() => { if (state.apiKey) refreshData(); }, 30000);

/* ============================================================
   NEW LEAD NOTIFICATIONS (Feature 1)
   ============================================================ */
function detectNewLeads(leads) {
  const ids = new Set(leads.map(l => l.id));
  if (state.knownLeadIds === null) {
    // First load — just store IDs, no notification
    state.knownLeadIds = ids;
    return;
  }
  const fresh = leads.filter(l => !state.knownLeadIds.has(l.id));
  state.knownLeadIds = ids;
  if (fresh.length === 0) return;

  state.newLeadCount += fresh.length;
  updateNavBadge();

  // Browser notification
  if (Notification.permission === 'granted') {
    fresh.forEach(l => {
      new Notification('Nieuwe lead — ' + (l.naam || 'Onbekend'), {
        body: 'Telefoon: ' + (l.telefoon || '—'),
        icon: '/favicon.png'
      });
    });
  }
  toast(\`\${fresh.length} nieuwe lead\${fresh.length > 1 ? 's' : ''} binnengekomen!\`, 'info');
}

function updateNavBadge() {
  const nav = document.getElementById('nav-dashboard');
  if (!nav) return;
  let badge = nav.querySelector('.nav-badge');
  if (state.newLeadCount === 0) { if (badge) badge.remove(); return; }
  if (!badge) { badge = document.createElement('span'); badge.className = 'nav-badge'; nav.appendChild(badge); }
  badge.textContent = state.newLeadCount;
}

function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

/* ============================================================
   LEADS CHART (Feature 7)
   ============================================================ */
function renderChart() {
  const canvas = document.getElementById('leads-chart');
  if (!canvas || typeof Chart === 'undefined') return;

  // Build weekly buckets for last 8 weeks
  const weeks = [];
  const counts = [];
  const now = new Date();
  for (let i = 7; i >= 0; i--) {
    const start = new Date(now);
    start.setDate(start.getDate() - (i + 1) * 7);
    const end = new Date(now);
    end.setDate(end.getDate() - i * 7);
    const label = \`W\${8 - i}\`;
    const count = state.leads.filter(l => {
      const d = new Date(l.datum);
      return d >= start && d < end;
    }).length;
    weeks.push(label);
    counts.push(count);
  }

  if (state.leadsChart) state.leadsChart.destroy();
  state.leadsChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: weeks,
      datasets: [{
        label: 'Leads',
        data: counts,
        backgroundColor: 'rgba(124,58,237,0.45)',
        borderColor: '#8b5cf6',
        borderWidth: 2,
        borderRadius: 6,
        hoverBackgroundColor: 'rgba(167,139,250,0.35)'
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#6a85b0' } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#6a85b0', stepSize: 1 }, beginAtZero: true }
      }
    }
  });
}

/* ============================================================
   ADMIN — MULTI-CLIENT (Feature 4)
   ============================================================ */
async function loadAdminClients() {
  const grid = document.getElementById('admin-grid');
  if (!grid) return;
  grid.innerHTML = '<div style="color:var(--text-muted);font-size:14px">Klanten laden...</div>';
  try {
    const resp = await fetch(\`\${API_BASE}/admin\`, { headers: { 'x-api-key': state.apiKey } });
    if (!resp.ok) throw new Error('Geen toegang');
    const data = await resp.json();
    const clients = data.clients || [];
    if (clients.length === 0) { grid.innerHTML = '<div style="color:var(--text-muted)">Geen klanten gevonden.</div>'; return; }
    // Store clients in state so we can look up by index (never expose apiKey in DOM)
    state.adminClients = clients;
    grid.innerHTML = clients.map((c, i) => \`
      <div class="admin-card" onclick="switchToClient(\${i})">
        <div class="admin-card-name">\${escHtml(c.naam)}</div>
        <div class="admin-card-code">\${escHtml(c.projectCode)}</div>
        <div class="admin-card-stats">
          <div class="admin-stat"><div class="admin-stat-val">\${c.totalLeads}</div><div class="admin-stat-lbl">Leads</div></div>
          <div class="admin-stat"><div class="admin-stat-val" style="color:var(--red)">\${c.newLeads}</div><div class="admin-stat-lbl">Nieuw</div></div>
          <div class="admin-stat"><div class="admin-stat-val" style="color:var(--green)">\${c.qualified}</div><div class="admin-stat-lbl">Gekwal.</div></div>
        </div>
      </div>
    \`).join('');
  } catch (err) {
    grid.innerHTML = \`<div style="color:var(--red);font-size:14px">\${err.message}</div>\`;
  }
}

function switchToClient(index) {
  const client = state.adminClients && state.adminClients[index];
  if (!client || !client.apiKey) return;
  state.apiKey = client.apiKey;
  state.knownLeadIds = null;
  state.adminLoaded = false;
  navigateTo('dashboard');
  refreshData();
}

/* ============================================================
   UPDATE TIMESTAMP
   ============================================================ */
function updateUserInfo() {
  const nameEl = document.getElementById('user-name');
  const avatarEl = document.getElementById('user-avatar');
  if (nameEl) nameEl.textContent = state.clientName;
  if (avatarEl) avatarEl.textContent = getInitials(state.clientName);
}

/* ============================================================
   RENDER STATS
   ============================================================ */
function renderStats() {
  const s = state.stats || {};
  const total = s.total || 0;
  const grid = document.getElementById('stats-grid');
  if (!grid) return;

  const cards = [
    {
      label: 'Totaal Leads',
      value: s.total || 0,
      suffix: '',
      desc: 'Alle ontvangen leads',
      color: '',
      fill: 100
    },
    {
      label: 'Gekwalificeerd',
      value: s.qualified || 0,
      suffix: '',
      desc: 'Door AI gekwalificeerd',
      color: 'cyan',
      fill: total ? Math.round((s.qualified / total) * 100) : 0
    },
    {
      label: 'Afspraken',
      value: s.booked || 0,
      suffix: '',
      desc: 'Geboekte afspraken',
      color: 'green',
      fill: total ? Math.round((s.booked / total) * 100) : 0
    },
    {
      label: 'Conversie',
      value: s.conversionRate || 0,
      suffix: '%',
      desc: 'Van lead naar afspraak',
      color: 'orange',
      fill: s.conversionRate || 0
    },
    {
      label: 'Deze Maand',
      value: s.thisMonth || 0,
      suffix: '',
      desc: 'Nieuwe leads deze maand',
      color: 'blue',
      fill: total ? Math.round(((s.thisMonth || 0) / total) * 100) : 0
    },
    {
      label: 'Gem. Reactie',
      value: s.avgResponseTime || 0,
      suffix: 'u',
      desc: 'Gemiddelde reactietijd',
      color: '',
      fill: 60
    }
  ];

  grid.innerHTML = cards.map(c => \`
    <div class="stat-card">
      <div class="stat-label">\${c.label}</div>
      <div class="stat-value \${c.color}" data-target="\${c.value}" data-suffix="\${c.suffix}">0\${c.suffix}</div>
      <div class="stat-desc">\${c.desc}</div>
      <div class="stat-bar">
        <div class="stat-bar-fill" data-fill="\${c.fill}"></div>
      </div>
    </div>
  \`).join('');

  // Animate counters
  grid.querySelectorAll('.stat-value[data-target]').forEach(el => {
    const target = parseFloat(el.dataset.target);
    const suffix = el.dataset.suffix || '';
    animateCounter(el, target, suffix);
  });

  // Animate bars
  requestAnimationFrame(() => {
    grid.querySelectorAll('.stat-bar-fill').forEach(el => {
      el.style.width = el.dataset.fill + '%';
    });
  });
}

/* ============================================================
   FILTERS & SEARCH
   ============================================================ */
function getActiveFilterCount() {
  let count = 0;
  if (state.searchQ) count++;
  if (document.getElementById('filter-status')?.value) count++;
  if (document.getElementById('filter-qualified')?.value) count++;
  if (document.getElementById('filter-bron')?.value) count++;
  if (document.getElementById('filter-opgepikt')?.value) count++;
  return count;
}

function populateBronFilter() {
  const sel = document.getElementById('filter-bron');
  if (!sel) return;
  const bronnen = [...new Set(state.leads.map(l => l.bron).filter(Boolean))].sort();
  const current = sel.value;
  sel.innerHTML = '<option value="">Alle bronnen</option>' +
    bronnen.map(b => \`<option value="\${b}"\${b === current ? ' selected' : ''}>\${b}</option>\`).join('');
}

function applyFilters() {
  const q = state.searchQ.toLowerCase();
  const statusF = document.getElementById('filter-status')?.value || '';
  const qualF = document.getElementById('filter-qualified')?.value || '';
  const bronF = document.getElementById('filter-bron')?.value || '';
  const opgepiktF = document.getElementById('filter-opgepikt')?.value || '';

  state.filteredLeads = state.leads.filter(l => {
    if (q && !((l.naam || '').toLowerCase().includes(q)) && !((l.telefoon || '').toLowerCase().includes(q))) return false;
    if (statusF && l.status !== statusF) return false;
    if (qualF !== '' && String(l.qualified) !== qualF) return false;
    if (bronF && l.bron !== bronF) return false;
    if (opgepiktF !== '' && String(l.opgepikt) !== opgepiktF) return false;
    return true;
  });

  sortLeads();
  renderTable();
  updateFilterUI();
  populateBronFilter();
}

function sortLeads() {
  const col = state.sortCol;
  const asc = state.sortAsc;
  state.filteredLeads.sort((a, b) => {
    let av = a[col], bv = b[col];
    if (col === 'datum') { av = new Date(av || 0); bv = new Date(bv || 0); }
    else if (col === 'leadScore') { av = av || 0; bv = bv || 0; }
    else { av = (av || '').toString().toLowerCase(); bv = (bv || '').toString().toLowerCase(); }
    if (av < bv) return asc ? -1 : 1;
    if (av > bv) return asc ? 1 : -1;
    return 0;
  });
}

function updateFilterUI() {
  const count = getActiveFilterCount();
  const badge = document.getElementById('filter-badge');
  const resetBtn = document.getElementById('btn-reset-filters');
  const leadsCount = document.getElementById('leads-count');

  if (badge) { badge.textContent = count; badge.style.display = count ? 'inline-flex' : 'none'; }
  if (resetBtn) { count > 0 ? resetBtn.classList.add('visible') : resetBtn.classList.remove('visible'); }
  if (leadsCount) {
    leadsCount.innerHTML = \`<strong>\${state.filteredLeads.length}</strong> / \${state.leads.length} leads\`;
  }

  // Update sort indicators
  document.querySelectorAll('.sort-indicator').forEach(el => {
    const col = el.dataset.col;
    const th = el.closest('th');
    if (col === state.sortCol) {
      el.textContent = state.sortAsc ? '↑' : '↓';
      th.classList.add('sort-active');
    } else {
      el.textContent = '';
      th.classList.remove('sort-active');
    }
  });
}

function resetFilters() {
  state.searchQ = '';
  document.getElementById('search-input').value = '';
  document.getElementById('filter-status').value = '';
  document.getElementById('filter-qualified').value = '';
  document.getElementById('filter-bron').value = '';
  document.getElementById('filter-opgepikt').value = '';
  applyFilters();
}

/* ============================================================
   RENDER TABLE
   ============================================================ */
function statusBadge(status) {
  const map = {
    'new': '<span class="badge badge-new">Nieuw</span>',
    'in_progress': '<span class="badge badge-inprogress">Bezig</span>',
    'completed': '<span class="badge badge-done">Klaar</span>'
  };
  return map[status] || \`<span class="badge badge-new">\${status || '—'}</span>\`;
}

function qualBadge(lead) {
  if (lead.status === 'in_progress') return '<span class="badge badge-inprogress">Bezig</span>';
  if (lead.qualified === true) return '<span class="badge badge-yes">Ja</span>';
  if (lead.qualified === false) return '<span class="badge badge-no">Nee</span>';
  return '<span class="badge badge-new">—</span>';
}

function scorePill(score) {
  if (score === null || score === undefined || score === 0) return '<span class="score-pill score-gray" title="Geen score">—</span>';
  const cls = score >= 8 ? 'score-green' : score >= 5 ? 'score-orange' : 'score-red';
  const title = score >= 8 ? 'Uitstekende match' : score >= 5 ? 'Gemiddelde match' : 'Slechte match';
  return \`<span class="score-pill \${cls}" title="\${title}">\${score}</span>\`;
}

function renderTable() {
  const tbody = document.getElementById('leads-tbody');
  if (!tbody) return;

  if (state.filteredLeads.length === 0) {
    const hasFilters = getActiveFilterCount() > 0;
    tbody.innerHTML = \`
      <tr>
        <td colspan="10">
          <div class="empty-state">
            <div class="empty-icon">◎</div>
            <div class="empty-title">\${hasFilters ? 'Geen resultaten gevonden' : 'Geen leads beschikbaar'}</div>
            <div class="empty-desc">\${hasFilters ? 'Pas uw filters aan of reset ze.' : 'Er zijn nog geen leads in het systeem.'}</div>
            \${hasFilters ? '<button class="btn-icon" onclick="resetFilters()" style="margin:0 auto">✕ Reset filters</button>' : ''}
          </div>
        </td>
      </tr>
    \`;
    return;
  }

  tbody.innerHTML = state.filteredLeads.map((lead, i) => {
    const delay = i < 10 ? \`style="animation-delay:\${i * 40}ms"\` : '';
    return \`
      <tr data-id="\${lead.id}" \${delay}>
        <td class="td-naam">\${escHtml(lead.naam) || '—'}</td>
        <td>
          <div class="td-phone">
            \${escHtml(lead.telefoon) || '—'}
            \${lead.telefoon ? \`
              <button class="copy-btn" data-phone="\${escHtml(lead.telefoon)}" title="Kopieer">⧉
                <span class="copy-tooltip">Gekopieerd!</span>
              </button>\` : ''}
          </div>
        </td>
        <td>\${statusBadge(lead.status)}</td>
        <td>\${qualBadge(lead)}</td>
        <td>\${lead.bron ? \`<span class="badge badge-bron">\${escHtml(lead.bron)}</span>\` : '—'}</td>
        <td class="td-samenvatting" title="\${escHtml(lead.samenvatting)}">\${escHtml(lead.samenvatting) || '—'}</td>
        <td>\${scorePill(lead.leadScore)}</td>
        <td>\${lead.opgepikt ? '<span style="color:var(--green)">✓</span>' : '<span style="color:var(--text-muted)">—</span>'}</td>
        <td style="white-space:nowrap;font-size:12px;color:var(--text-secondary)">\${formatDate(lead.datum)}</td>
        <td class="td-arrow">›</td>
      </tr>
    \`;
  }).join('');
}

/* ============================================================
   TABLE EVENT DELEGATION
   ============================================================ */
document.getElementById('leads-tbody').addEventListener('click', function(e) {
  // Copy phone button
  const copyBtn = e.target.closest('.copy-btn');
  if (copyBtn) {
    e.stopPropagation();
    const phone = copyBtn.dataset.phone;
    if (phone && navigator.clipboard) {
      navigator.clipboard.writeText(phone).then(() => {
        const tip = copyBtn.querySelector('.copy-tooltip');
        if (tip) { tip.classList.add('show'); setTimeout(() => tip.classList.remove('show'), 1500); }
      }).catch(() => toast('Kopiëren mislukt', 'error'));
    }
    return;
  }

  // Row click → open detail panel
  const row = e.target.closest('tr[data-id]');
  if (row) {
    const id = row.dataset.id;
    const lead = state.leads.find(l => String(l.id) === String(id));
    if (lead) openPanel(lead);
  }
});

/* ============================================================
   SORT HEADERS
   ============================================================ */
document.querySelectorAll('th.sortable').forEach(th => {
  th.addEventListener('click', () => {
    const col = th.dataset.col;
    if (state.sortCol === col) {
      state.sortAsc = !state.sortAsc;
    } else {
      state.sortCol = col;
      state.sortAsc = col === 'naam';
    }
    applyFilters();
  });
});

/* ============================================================
   DETAIL PANEL
   ============================================================ */
function openPanel(lead) {
  state.activeLead = lead;

  // Avatar
  const avatar = document.getElementById('panel-avatar');
  avatar.textContent = getInitials(lead.naam);
  avatar.className = 'panel-avatar ' + (
    lead.qualified ? 'avatar-green' :
    lead.status === 'in_progress' ? 'avatar-orange' : 'avatar-red'
  );

  document.getElementById('panel-name').textContent = lead.naam || '—';
  document.getElementById('panel-phone').textContent = lead.telefoon || '—';

  const bronBadge = document.getElementById('panel-bron-badge');
  bronBadge.innerHTML = lead.bron ? \`<span class="badge badge-bron">\${escHtml(lead.bron)}</span>\` : '';

  // Copy phone
  const copyPhoneBtn = document.getElementById('panel-copy-phone');
  copyPhoneBtn.onclick = () => {
    if (lead.telefoon && navigator.clipboard) {
      navigator.clipboard.writeText(lead.telefoon).then(() => toast('Telefoonnummer gekopieerd', 'success'));
    }
  };

  // Build panel body
  const scoreNum = lead.leadScore || 0;
  const scoreClass = scoreNum >= 8 ? 'high' : scoreNum >= 5 ? '' : 'low';
  const scoreSegments = Array.from({ length: 10 }, (_, i) =>
    \`<div class="score-segment \${i < scoreNum ? 'filled ' + scoreClass : ''}"></div>\`
  ).join('');

  let bodyHTML = '';

  // Kwalificatie section
  bodyHTML += \`
    <div class="panel-section">
      <div class="panel-section-title">Kwalificatie</div>
      <div class="panel-row">
        <span class="panel-row-label">Status</span>
        <span class="panel-row-value">
          <select class="status-select" id="panel-status-select">
            <option value="new"         \${lead.status === 'new'         ? 'selected' : ''}>Nieuw</option>
            <option value="in_progress" \${lead.status === 'in_progress' ? 'selected' : ''}>Bezig</option>
            <option value="completed"   \${lead.status === 'completed'   ? 'selected' : ''}>Klaar</option>
          </select>
        </span>
      </div>
      <div class="panel-row">
        <span class="panel-row-label">Gekwalificeerd</span>
        <span class="panel-row-value">\${qualBadge(lead)}</span>
      </div>
      <div class="panel-row">
        <span class="panel-row-label">Score</span>
        <span class="panel-row-value">
          <div class="score-bar-wrapper">
            <div class="score-bar">\${scoreSegments}</div>
            <span class="score-number \${scoreNum >= 8 ? 'cyan' : scoreNum >= 5 ? '' : ''}" style="color:\${scoreNum >= 8 ? 'var(--green)' : scoreNum >= 5 ? 'var(--orange)' : scoreNum > 0 ? 'var(--red)' : 'var(--text-muted)'}">\${scoreNum}</span>
          </div>
        </span>
      </div>
      \${lead.fit !== undefined ? \`<div class="panel-row"><span class="panel-row-label">Fit</span><span class="panel-row-value">\${lead.fit || '—'}</span></div>\` : ''}
      \${lead.capaciteit !== undefined ? \`<div class="panel-row"><span class="panel-row-label">Capaciteit</span><span class="panel-row-value">\${lead.capaciteit || '—'}</span></div>\` : ''}
      \${lead.urgentie !== undefined ? \`<div class="panel-row"><span class="panel-row-label">Urgentie</span><span class="panel-row-value">\${lead.urgentie || '—'}</span></div>\` : ''}
      \${lead.verwachteWaarde !== undefined ? \`<div class="panel-row"><span class="panel-row-label">Verwachte waarde</span><span class="panel-row-value">\${escHtml(lead.verwachteWaarde) || '—'}</span></div>\` : ''}
    </div>
  \`;

  // Reden section (if exists)
  if (lead.reden) {
    bodyHTML += \`
      <div class="panel-section">
        <div class="panel-section-title">Reden</div>
        <div class="ai-summary">\${lead.reden}</div>
      </div>
    \`;
  }

  // AI Samenvatting (if exists)
  if (lead.samenvatting) {
    bodyHTML += \`
      <div class="panel-section">
        <div class="panel-section-title">AI Samenvatting</div>
        <div class="ai-summary">\${escHtml(lead.samenvatting)}</div>
      </div>
    \`;
  }

  // Details section
  bodyHTML += \`
    <div class="panel-section">
      <div class="panel-section-title">Details</div>
      <div class="panel-row">
        <span class="panel-row-label">Datum</span>
        <span class="panel-row-value">\${formatDate(lead.datum)}</span>
      </div>
      <div class="panel-row">
        <span class="panel-row-label">Bron</span>
        <span class="panel-row-value">\${escHtml(lead.bron) || '—'}</span>
      </div>
      <div class="panel-row">
        <span class="panel-row-label">Opgepikt</span>
        <span class="panel-row-value \${lead.opgepikt ? 'check-yes' : 'check-no'}">\${lead.opgepikt ? '✓ Ja' : '✗ Nee'}</span>
      </div>
      <div class="panel-row">
        <span class="panel-row-label">Boekingslink verstuurd</span>
        <span class="panel-row-value \${lead.boekingslinkVerstuurd ? 'check-yes' : 'check-no'}">\${lead.boekingslinkVerstuurd ? '✓ Ja' : '✗ Nee'}</span>
      </div>
      <div class="panel-row">
        <span class="panel-row-label">Afspraak geboekt</span>
        <span class="panel-row-value \${lead.afspraakGeboekt ? 'check-yes' : 'check-no'}">\${lead.afspraakGeboekt ? '✓ Ja' : '✗ Nee'}</span>
      </div>
    </div>
  \`;

  // Conversation replay section
  if (lead.gesprek) {
    try {
      const msgs = JSON.parse(lead.gesprek);
      if (msgs.length > 0) {
        const bubbles = msgs.map(m => \`
          <div>
            <div class="chat-label">\${m.role === 'user' ? '👤 Lead' : '🤖 AI'}</div>
            <div class="chat-bubble \${m.role === 'user' ? 'user' : 'ai'}">\${m.content.replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\\n/g,'<br>')}</div>
          </div>
        \`).join('');
        bodyHTML += \`
          <div class="panel-section">
            <div class="panel-section-title">WhatsApp Gesprek</div>
            <div class="chat-wrap">\${bubbles}</div>
          </div>
        \`;
      }
    } catch { /* invalid JSON, skip */ }
  }

  // Notes section
  bodyHTML += \`
    <div class="panel-section">
      <div class="panel-section-title">Notities</div>
      <textarea class="notes-textarea" id="panel-notes" placeholder="Voeg notities toe...">\${lead.notities || ''}</textarea>
      <button class="btn-save" id="btn-save-notes">Opslaan</button>
    </div>
  \`;

  document.getElementById('panel-body').innerHTML = bodyHTML;

  // Status change handler
  const statusSelect = document.getElementById('panel-status-select');
  if (statusSelect) {
    statusSelect.addEventListener('change', async () => {
      const newStatus = statusSelect.value;
      try {
        await patchStatus(lead.id, newStatus);
        const idx = state.leads.findIndex(l => l.id === lead.id);
        if (idx !== -1) state.leads[idx].status = newStatus;
        state.activeLead.status = newStatus;
        applyFilters();
        toast('Status bijgewerkt', 'success');
      } catch (err) {
        toast(err.message, 'error');
        statusSelect.value = lead.status; // revert on error
      }
    });
  }

  // Save notes handler
  document.getElementById('btn-save-notes').addEventListener('click', async () => {
    const notities = document.getElementById('panel-notes').value;
    const btn = document.getElementById('btn-save-notes');
    btn.textContent = 'Opslaan...';
    btn.disabled = true;
    try {
      await patchNotes(lead.id, notities);
      // Update local state
      const idx = state.leads.findIndex(l => l.id === lead.id);
      if (idx !== -1) state.leads[idx].notities = notities;
      state.activeLead.notities = notities;
      toast('Notities opgeslagen', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.textContent = 'Opslaan';
      btn.disabled = false;
    }
  });

  // Show panel
  document.getElementById('panel-backdrop').classList.add('visible');
  document.getElementById('detail-panel').classList.add('visible');
}

function closePanel() {
  document.getElementById('panel-backdrop').classList.remove('visible');
  document.getElementById('detail-panel').classList.remove('visible');
  state.activeLead = null;
}

document.getElementById('panel-close').addEventListener('click', closePanel);
document.getElementById('panel-backdrop').addEventListener('click', closePanel);

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closePanel();
});

/* ============================================================
   NAVIGATION
   ============================================================ */
function navigateTo(page) {
  state.currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const pageEl = document.getElementById(\`page-\${page}\`);
  const navEl = document.getElementById(\`nav-\${page}\`);
  if (pageEl) pageEl.classList.add('active');
  if (navEl) navEl.classList.add('active');

  const titles = {
    dashboard: { title: 'Dashboard', sub: 'Overzicht van uw gekwalificeerde leads' },
    exports:   { title: 'Exports',   sub: 'Rapporten en data-export' },
    calendly:  { title: 'Kalender',  sub: 'Uw afspraken en beschikbaarheid' },
    admin:     { title: 'Klanten',   sub: 'Overzicht van alle klanten' }
  };

  const t = titles[page] || { title: page, sub: '' };
  document.getElementById('topbar-title').textContent = t.title;
  document.getElementById('topbar-subtitle').textContent = t.sub;

  // Load admin page on first visit
  if (page === 'admin' && !state.adminLoaded) {
    state.adminLoaded = true;
    loadAdminClients();
  }

  // Load Calendly iframe on first visit
  if (page === 'calendly') {
    const iframe = document.getElementById('calendly-iframe');
    const openLink = document.getElementById('calendly-open-link');
    const calendlyUrl = state.calendlyUrl || 'https://calendly.com';
    if (iframe && iframe.src === 'about:blank') {
      iframe.src = calendlyUrl;
    }
    if (openLink) openLink.href = calendlyUrl;
  }

  // Close mobile sidebar
  document.getElementById('sidebar').classList.remove('mobile-open');
  document.getElementById('sidebar-overlay').classList.remove('visible');
}

document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
  btn.addEventListener('click', () => navigateTo(btn.dataset.page));
});

/* ============================================================
   MOBILE SIDEBAR
   ============================================================ */
document.getElementById('hamburger').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('mobile-open');
  document.getElementById('sidebar-overlay').classList.toggle('visible');
});

document.getElementById('sidebar-overlay').addEventListener('click', () => {
  document.getElementById('sidebar').classList.remove('mobile-open');
  document.getElementById('sidebar-overlay').classList.remove('visible');
});

/* ============================================================
   SEARCH & FILTER LISTENERS
   ============================================================ */
const debouncedSearch = debounce((val) => {
  state.searchQ = val;
  applyFilters();
}, 200);

document.getElementById('search-input').addEventListener('input', e => debouncedSearch(e.target.value));

['filter-status', 'filter-qualified', 'filter-bron', 'filter-opgepikt'].forEach(id => {
  document.getElementById(id).addEventListener('change', () => applyFilters());
});

document.getElementById('btn-reset-filters').addEventListener('click', resetFilters);

/* ============================================================
   TOPBAR BUTTONS
   ============================================================ */
document.getElementById('btn-refresh').addEventListener('click', refreshData);
document.getElementById('btn-export-csv').addEventListener('click', exportCSV);
document.getElementById('btn-logout').addEventListener('click', logout);

/* ============================================================
   EXPORTS PAGE
   ============================================================ */
document.getElementById('btn-load-rapport').addEventListener('click', async () => {
  const btn = document.getElementById('btn-load-rapport');
  const skeleton = document.getElementById('rapport-skeleton');
  const content = document.getElementById('rapport-content');

  btn.disabled = true;
  btn.innerHTML = '<span class="icon" style="animation:spin 1s linear infinite;display:inline-block">↻</span> Laden...';
  skeleton.style.display = 'block';
  content.style.display = 'none';

  try {
    const data = await fetchRapport();
    const r = data.rapport || {};
    const stats = data.stats || {};

    document.getElementById('rapport-stats').innerHTML = \`
      <div class="rapport-stat"><div class="rapport-stat-value">\${r.totaal ?? stats.total ?? 0}</div><div class="rapport-stat-label">Totaal leads</div></div>
      <div class="rapport-stat"><div class="rapport-stat-value">\${r.gekwalificeerd ?? stats.qualified ?? 0}</div><div class="rapport-stat-label">Gekwalificeerd</div></div>
      <div class="rapport-stat"><div class="rapport-stat-value">\${r.afspraken ?? stats.booked ?? 0}</div><div class="rapport-stat-label">Afspraken</div></div>
      <div class="rapport-stat"><div class="rapport-stat-value">\${r.conversie ?? stats.conversionRate ?? 0}%</div><div class="rapport-stat-label">Conversie</div></div>
    \`;

    const qualLeads = (data.leads || []).filter(l => l.qualified);
    let leadsHTML = '';
    if (qualLeads.length > 0) {
      leadsHTML = \`
        <div class="panel-section-title" style="margin-top:16px">Gekwalificeerde leads</div>
        <div class="rapport-leads-list">
          \${qualLeads.map(l => \`
            <div class="rapport-lead-item">
              <span>\${l.naam || '—'}</span>
              <span>\${scorePill(l.leadScore)}</span>
            </div>
          \`).join('')}
        </div>
      \`;
    }
    document.getElementById('rapport-leads-section').innerHTML = leadsHTML;

    skeleton.style.display = 'none';
    content.style.display = 'block';
    toast('Weekrapport geladen', 'success');
  } catch (err) {
    skeleton.style.display = 'none';
    toast('Rapport laden mislukt: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="icon">📊</span> Rapport opnieuw laden';
  }
});

document.getElementById('btn-download-csv').addEventListener('click', exportCSV);

/* ============================================================
   LOGIN LOGIC
   ============================================================ */
async function startDashboard() {
  document.getElementById('login-page').style.display = 'none';
  document.getElementById('dashboard-app').classList.add('visible');
  requestNotificationPermission();
  // Detect admin key by trying the admin endpoint
  try {
    const r = await fetch(\`\${API_BASE}/admin\`, { headers: { 'x-api-key': state.apiKey } });
    if (r.ok) {
      const adminNav = document.getElementById('nav-admin');
      if (adminNav) adminNav.style.display = '';
    }
  } catch { /* not admin */ }
  await refreshData();
}

document.getElementById('btn-login').addEventListener('click', handleLogin);
document.getElementById('login-password').addEventListener('keydown', e => {
  if (e.key === 'Enter') handleLogin();
});
document.getElementById('login-email').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('login-password').focus();
});

async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.classList.remove('visible');

  if (!email) {
    errEl.textContent = 'Vul uw e-mailadres in.';
    errEl.classList.add('visible');
    return;
  }

  const btn = document.getElementById('btn-login');
  btn.querySelector('span').textContent = 'INLOGGEN...';
  btn.disabled = true;

  try {
    const authResp = await fetch(AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const authData = await authResp.json();
    if (!authResp.ok) {
      errEl.textContent = authData.error || 'Inloggen mislukt.';
      errEl.classList.add('visible');
      return;
    }
    saveSession(authData.apiKey, authData.clientName, authData.projectCode);
    const data = await fetchLeads();
    state.leads = data.leads || [];
    state.stats = data.stats || {};
    state.clientName = authData.clientName || data.client?.naam || email.split('@')[0];
    state.lastFetch = Date.now();
    await startDashboard();
  } catch (err) {
    errEl.textContent = 'Verbindingsfout. Probeer opnieuw.';
    errEl.classList.add('visible');
  } finally {
    btn.querySelector('span').textContent = 'INLOGGEN';
    btn.disabled = false;
  }
}

/* ============================================================
   INIT
   ============================================================ */
(async function init() {
  initTheme();

  if (tryAutoLogin()) {
    try {
      const data = await fetchLeads();
      state.leads = data.leads || [];
      state.stats = data.stats || {};
      state.clientName = state.clientName || data.client?.naam || 'Gebruiker';
      state.lastFetch = Date.now();
      await startDashboard();
    } catch {
      clearSession();
      document.getElementById('login-page').style.display = 'flex';
    }
  } else {
    document.getElementById('login-page').style.display = 'flex';
  }
})();
</script>
</body>
</html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).send(HTML);
};
