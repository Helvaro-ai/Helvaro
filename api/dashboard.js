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
  --bg-primary:    #080c14;
  --bg-card:       #0d1117;
  --bg-card-alt:   #161b22;
  --bg-card-hover: #1c2333;
  --blue-primary:  #6366f1;
  --blue-bright:   #818cf8;
  --cyan:          #a5b4fc;
  --green:         #22c55e;
  --red:           #f43f5e;
  --orange:        #f59e0b;
  --text-primary:  #e6edf3;
  --text-secondary:#8b949e;
  --text-muted:    #3d444d;
  --border:        #21262d;
  --border-bright: #30363d;
  --scrollbar-bg:  #0d1117;
  --scrollbar-thumb: #6366f1;
  --shadow:        0 8px 32px rgba(0,0,0,0.6);
  --shadow-card:   0 1px 3px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04);
  --shadow-glow:   0 0 40px rgba(99,102,241,0.12);
  --transition:    all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  --radius:        12px;
  --radius-sm:     8px;
}

[data-theme="light"] {
  --bg-primary:    #eef0f6;
  --bg-card:       #ffffff;
  --bg-card-alt:   #f5f6fb;
  --bg-card-hover: #eff1f8;
  --text-primary:  #0f1117;
  --text-secondary:#5c6478;
  --text-muted:    #a0aab8;
  --border:        #dde1ed;
  --border-bright: #c8cede;
  --scrollbar-bg:  #f0f2f7;
  --scrollbar-thumb: #6366f1;
  --shadow:        0 1px 3px rgba(15,17,40,0.06), 0 6px 20px rgba(15,17,40,0.08);
  --shadow-card:   0 1px 2px rgba(15,17,40,0.05), 0 0 0 1px rgba(99,102,241,0.06);
  --shadow-glow:   0 0 40px rgba(99,102,241,0.08);
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

/* Subtle dot grid — barely visible */
body::before {
  content: '';
  position: fixed;
  inset: 0;
  background-image: radial-gradient(circle, rgba(99,102,241,0.12) 1px, transparent 1px);
  background-size: 32px 32px;
  pointer-events: none;
  z-index: 0;
  opacity: 0.4;
}

/* Ambient glow — subtle indigo bloom from top, like Linear */
body::after {
  content: '';
  position: fixed;
  inset: 0;
  background:
    radial-gradient(ellipse 80% 40% at 50% -5%, rgba(99, 102, 241, 0.1) 0%, transparent 60%),
    radial-gradient(ellipse 40% 30% at 90% 100%, rgba(99, 102, 241, 0.04) 0%, transparent 50%);
  pointer-events: none;
  z-index: 0;
}

[data-theme="light"] body::before {
  background-image: radial-gradient(circle, rgba(99,102,241,0.08) 1px, transparent 1px);
  background-size: 28px 28px;
  opacity: 0.6;
}

[data-theme="light"] body::after {
  display: block;
  background:
    radial-gradient(ellipse 70% 40% at 50% -10%, rgba(99,102,241,0.07) 0%, transparent 60%),
    radial-gradient(ellipse 50% 30% at 100% 100%, rgba(129,140,248,0.05) 0%, transparent 50%);
}

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
   LOGIN PAGE — FULL VIEWPORT SPLIT
   ============================================================ */
#login-page {
  position: fixed;
  inset: 0;
  display: flex;
  z-index: 1000;
  padding: 0;
  background: #0d0f1a;
}

#login-page::before { display: none; }
#login-page::after  { display: none; }

/* Full-screen two-panel split — no card, no border-radius */
.login-split {
  display: flex;
  width: 100%;
  height: 100vh;
  border-radius: 0;
  box-shadow: none;
  max-width: none;
}

/* ── LEFT: form panel (42%) ── */
.login-form-side {
  flex: 0 0 42%;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 72px;
  position: relative;
  overflow-y: auto;
}

/* Subtle vertical line separator */
.login-form-side::after {
  content: '';
  position: absolute;
  right: 0;
  top: 10%;
  bottom: 10%;
  width: 1px;
  background: linear-gradient(180deg, transparent, rgba(99,102,241,0.15) 30%, rgba(99,102,241,0.15) 70%, transparent);
}

/* Form content constrained for readability */
.login-form-inner {
  width: 100%;
  max-width: 380px;
}

/* Logo top-left of panel */
.login-logo-top {
  display: flex;
  align-items: center;
  gap: 0;
  margin-bottom: 56px;
}

.login-logo-top img {
  width: 96px;
  height: 96px;
  object-fit: cover;
  object-position: left center;
}

.login-logo-top .brand-name { display: none; }

.login-welcome {
  font-size: 34px;
  font-weight: 800;
  color: #0f1117;
  margin-bottom: 8px;
  letter-spacing: -0.5px;
  font-family: 'Inter', sans-serif;
  line-height: 1.15;
}

.login-subtitle {
  color: #6b7280;
  font-size: 15px;
  margin-bottom: 40px;
  line-height: 1.5;
}

.login-divider { display: none; }
.login-logo { display: none; }
.login-title { display: none; }
.login-icon { display: none; }

/* ── RIGHT: brand panel (58%) ── */
.login-brand-side {
  flex: 1;
  background: #040811;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 72px;
  position: relative;
  overflow: hidden;
  gap: 0;
}

/* Fine dot grid */
.login-brand-side::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: radial-gradient(circle, rgba(14,165,233,0.12) 1px, transparent 1px);
  background-size: 32px 32px;
}

/* Electric glow orbs */
.login-brand-side::after {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 70% 50% at 60% 20%, rgba(14,165,233,0.18) 0%, transparent 55%),
    radial-gradient(ellipse 50% 60% at 10% 80%, rgba(59,130,246,0.2) 0%, transparent 55%),
    radial-gradient(ellipse 40% 35% at 90% 90%, rgba(6,182,212,0.12) 0%, transparent 50%),
    radial-gradient(ellipse 30% 25% at 80% 10%, rgba(99,102,241,0.1) 0%, transparent 50%);
  pointer-events: none;
}

/* Large floating mock card */
.brand-card-mock {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 440px;
  background: rgba(14,165,233,0.06);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(14,165,233,0.2);
  border-radius: 24px;
  padding: 32px;
  box-shadow: 0 24px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(14,165,233,0.08), inset 0 1px 0 rgba(255,255,255,0.08);
}

.brand-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 28px;
}

.brand-card-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: rgba(14,165,233,0.4);
}

.brand-card-dot:first-child { background: #38bdf8; box-shadow: 0 0 8px rgba(14,165,233,0.6); }

.brand-card-title {
  font-size: 11.5px;
  font-weight: 700;
  color: rgba(56,189,248,0.75);
  text-transform: uppercase;
  letter-spacing: 1.5px;
}

/* Stat row */
.brand-stats {
  display: flex;
  gap: 14px;
  margin-bottom: 28px;
}

.brand-stat {
  flex: 1;
  background: rgba(14,165,233,0.08);
  border: 1px solid rgba(14,165,233,0.15);
  border-radius: 16px;
  padding: 16px 12px;
  text-align: center;
}

.brand-stat-num {
  font-family: 'Orbitron', sans-serif;
  font-size: 26px;
  font-weight: 800;
  color: #fff;
  line-height: 1;
  margin-bottom: 4px;
}

.brand-stat-label {
  font-size: 10px;
  color: rgba(255,255,255,0.55);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-top: 4px;
}

/* Bar chart */
.brand-bars {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  height: 72px;
}

.brand-bar {
  flex: 1;
  border-radius: 6px 6px 0 0;
  background: rgba(14,165,233,0.22);
  transition: background 0.3s;
}

.brand-bar.active {
  background: linear-gradient(180deg, #38bdf8, #0ea5e9);
  box-shadow: 0 0 16px rgba(14,165,233,0.5);
}

/* Brand tagline */
.brand-tagline {
  position: relative;
  z-index: 1;
  text-align: center;
  padding: 0 20px;
}

.brand-tagline h2 {
  font-size: 24px;
  font-weight: 800;
  color: #fff;
  margin-bottom: 10px;
  font-family: 'Inter', sans-serif;
  letter-spacing: -0.3px;
}

.brand-tagline p {
  font-size: 15px;
  color: rgba(255,255,255,0.6);
  line-height: 1.6;
}

/* ── Slides wrapper ── */
.brand-slides-wrap {
  position: relative;
  z-index: 1;
  width: 100%;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.brand-slide {
  position: absolute;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  opacity: 0;
  transform: translateY(18px);
  transition: opacity 0.55s cubic-bezier(0.4,0,0.2,1), transform 0.55s cubic-bezier(0.4,0,0.2,1);
  pointer-events: none;
}

.brand-slide.active {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
  position: relative;
}

/* ── Score ring (slide 2) ── */
.brand-score-row {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-top: 4px;
}

.brand-score-ring {
  position: relative;
  flex-shrink: 0;
}

.brand-score-label {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Orbitron', sans-serif;
  font-size: 16px;
  font-weight: 800;
  color: #fff;
}

.brand-score-items {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.brand-score-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.brand-score-item span {
  font-size: 10px;
  color: rgba(255,255,255,0.6);
  text-transform: uppercase;
  letter-spacing: 0.6px;
}

.brand-score-bar-wrap {
  height: 5px;
  background: rgba(255,255,255,0.15);
  border-radius: 3px;
  overflow: hidden;
}

.brand-score-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #0ea5e9, #38bdf8);
  border-radius: 3px;
  box-shadow: 0 0 8px rgba(14,165,233,0.4);
}

/* ── Agenda (slide 3) ── */
.brand-agenda {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 4px;
}

.brand-agenda-item {
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(14,165,233,0.07);
  border: 1px solid rgba(14,165,233,0.12);
  border-radius: 10px;
  padding: 10px 14px;
}

.brand-agenda-time {
  font-size: 12px;
  font-weight: 700;
  color: rgba(255,255,255,0.9);
  min-width: 38px;
  font-family: 'Orbitron', sans-serif;
  letter-spacing: 0;
  font-size: 11px;
}

.brand-agenda-content { flex: 1; }

.brand-agenda-name {
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  margin-bottom: 2px;
}

.brand-agenda-tag {
  font-size: 10px;
  color: rgba(255,255,255,0.55);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.brand-agenda-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.brand-agenda-dot.hot  { background: #f43f5e; box-shadow: 0 0 8px rgba(244,63,94,0.6); }
.brand-agenda-dot.warm { background: #f59e0b; box-shadow: 0 0 8px rgba(245,158,11,0.5); }

/* ── Pagination dots ── */
.brand-dots {
  display: flex;
  gap: 6px;
  justify-content: center;
  margin-top: 20px;
  position: relative;
  z-index: 1;
}

.brand-dot {
  width: 20px;
  height: 4px;
  border-radius: 2px;
  background: rgba(255,255,255,0.3);
  cursor: pointer;
  transition: all 0.3s ease;
}

.brand-dot.active {
  background: rgba(255,255,255,0.9);
  width: 32px;
}

/* Login footer */
.login-footer {
  margin-top: auto;
  padding-top: 24px;
  color: var(--text-muted);
  font-size: 11.5px;
  letter-spacing: 0.3px;
}

.login-footer span {
  color: var(--blue-primary);
  font-weight: 600;
}

/* Responsive: stack on mobile */
@media (max-width: 860px) {
  .login-split { flex-direction: column; height: auto; }
  .login-form-side { flex: none; padding: 52px 40px; align-items: center; }
  .login-form-inner { max-width: 420px; }
  .login-brand-side { flex: none; min-height: 300px; padding: 48px 40px; }
  .brand-card-mock { max-width: 380px; }
}

/* Light mode adjustments */
[data-theme="light"] .login-form-side {
  background: #ffffff;
}

[data-theme="light"] #login-page {
  background: #0d0f1a;
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
  padding: 15px 18px;
  background: #f9fafb;
  border: 1.5px solid #e5e7eb;
  border-radius: 12px;
  color: #0f1117;
  font-size: 15px;
  font-family: 'Inter', sans-serif;
  transition: var(--transition);
  outline: none;
  min-height: 52px;
}

.form-input:focus {
  border-color: #6366f1;
  background: #fff;
  box-shadow: 0 0 0 4px rgba(99,102,241,0.12);
}

.form-input::placeholder { color: #9ca3af; }

/* Login footer */
.login-footer {
  text-align: center;
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 11.5px;
  letter-spacing: 0.3px;
}

.login-footer span {
  color: var(--blue-primary);
  font-weight: 600;
}

.btn-login {
  width: 100%;
  padding: 17px;
  background: linear-gradient(135deg, #4f46e5, #6366f1 50%, #818cf8);
  border: none;
  border-radius: 14px;
  color: white;
  font-family: 'Inter', sans-serif;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.2px;
  cursor: pointer;
  margin-top: 12px;
  transition: var(--transition);
  position: relative;
  overflow: hidden;
  box-shadow: 0 6px 24px rgba(99,102,241,0.4);
  min-height: 56px;
}

.btn-login::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, #6366f1, #818cf8 50%, #a5b4fc);
  opacity: 0;
  transition: opacity 0.3s ease;
}

.btn-login:hover::before { opacity: 1; }
.btn-login:hover { box-shadow: 0 6px 32px rgba(99,102,241,0.5); transform: translateY(-1px); }
.btn-login:active { transform: translateY(0); box-shadow: 0 2px 12px rgba(99,102,241,0.3); }
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
  background: var(--bg-card);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  z-index: 100;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.sidebar-logo {
  padding: 18px 20px 14px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
}

.sidebar-logo > img {
  width: 78px;
  height: 78px;
  object-fit: cover;
  object-position: left center;
  flex-shrink: 0;
}

.sidebar-brand {
  font-family: 'Orbitron', sans-serif;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 3px;
  background: linear-gradient(135deg, #fff 40%, #a5b4fc);

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
  background: rgba(99, 102, 241, 0.1);
  color: var(--blue-bright);
  border: none;
}

.nav-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 18%;
  height: 64%;
  width: 3px;
  border-radius: 0 2px 2px 0;
  background: var(--blue-primary);
}

.nav-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  opacity: 0.75;
}

.nav-item:hover .nav-icon,
.nav-item.active .nav-icon { opacity: 1; }

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
  background: rgba(13, 17, 23, 0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border);
  box-shadow: 0 1px 0 rgba(255,255,255,0.03);
  position: sticky;
  top: 0;
  z-index: 50;
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
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(129, 140, 248, 0.2));
  border-color: var(--blue-primary);
  color: var(--blue-bright);
}

.btn-primary-sm:hover {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.35), rgba(129, 140, 248, 0.35));
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
  background: var(--bg-card);
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

.stat-unit {
  font-size: 16px;
  font-weight: 600;
  opacity: 0.45;
  margin-left: 2px;
  letter-spacing: 0;
}

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
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 12px 18px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 20px;
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
  box-shadow: 0 0 0 2px rgba(129, 140, 248, 0.12);
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
tbody tr:hover { background: rgba(99, 102, 241, 0.07); box-shadow: inset 3px 0 0 var(--blue-bright); }
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
.copy-btn:hover { color: var(--cyan); background: rgba(165, 180, 252, 0.1); }

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
.badge-done { background: rgba(129, 140, 248, 0.12); color: var(--blue-bright); border: 1px solid rgba(43,143,255,0.25); }
.badge-yes { background: rgba(0, 229, 160, 0.12); color: var(--green); border: 1px solid rgba(0,229,160,0.25); }
.badge-no { background: rgba(255, 69, 96, 0.12); color: var(--red); border: 1px solid rgba(255,69,96,0.25); }
.badge-bron { background: rgba(99, 102, 241, 0.1); color: var(--blue-bright); border: 1px solid rgba(30,111,217,0.2); font-size: 10px; }

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
  background: #0d1117;
  border-left: 1px solid var(--border);
  box-shadow: -8px 0 32px rgba(0,0,0,0.5);
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
  background: rgba(99, 102, 241, 0.06);
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
  .login-form-side { padding: 32px 24px; }
}

/* ============================================================
   PAGE HIDDEN WHEN LOGGED OUT
   ============================================================ */
#dashboard-app { display: none; }
#dashboard-app.visible { display: flex; flex-direction: column; min-height: 100vh; }

/* ============================================================
   LIGHT MODE COMPONENT OVERRIDES
   ============================================================ */

/* Sidebar gets a white surface with left accent border */
[data-theme="light"] .sidebar {
  background: #ffffff;
  border-right: 1px solid var(--border);
  box-shadow: 2px 0 12px rgba(15,17,40,0.06);
}

/* Sidebar brand gradient stays readable */
[data-theme="light"] .sidebar-brand {
  background: linear-gradient(135deg, #1e2035 40%, #6366f1);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* Nav items in light mode */
[data-theme="light"] .nav-item:hover {
  background: rgba(99,102,241,0.06);
  color: #4f46e5;
}

[data-theme="light"] .nav-item.active {
  background: rgba(99,102,241,0.09);
  color: #4f46e5;
}

[data-theme="light"] .nav-item.active::before {
  background: #6366f1;
}

/* Topbar — crisp white with soft shadow */
[data-theme="light"] .topbar {
  background: rgba(255,255,255,0.92);
  border-bottom: 1px solid var(--border);
  box-shadow: 0 1px 0 rgba(15,17,40,0.05), 0 2px 12px rgba(15,17,40,0.04);
}

/* Topbar page title gradient in light */
[data-theme="light"] .page-title {
  background: linear-gradient(135deg, #0f1117 60%, #6366f1);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* Topbar buttons — dark on white */
[data-theme="light"] .btn-icon {
  background: rgba(15,17,40,0.04);
  border: 1px solid var(--border);
  color: var(--text-secondary);
}

[data-theme="light"] .btn-icon:hover {
  background: rgba(99,102,241,0.08);
  border-color: rgba(99,102,241,0.25);
  color: #4f46e5;
  box-shadow: none;
}

[data-theme="light"] .btn-primary-sm {
  background: linear-gradient(135deg, rgba(99,102,241,0.12), rgba(129,140,248,0.12));
  border-color: rgba(99,102,241,0.4);
  color: #4f46e5;
}

[data-theme="light"] .btn-primary-sm:hover {
  background: linear-gradient(135deg, rgba(99,102,241,0.2), rgba(129,140,248,0.2));
}

/* Stat cards — white with real depth */
[data-theme="light"] .stat-card {
  background: #ffffff;
  box-shadow: var(--shadow-card);
  border: 1px solid var(--border);
}

[data-theme="light"] .stat-card:hover {
  box-shadow: 0 4px 16px rgba(15,17,40,0.1), 0 0 0 1px rgba(99,102,241,0.12);
  border-color: rgba(99,102,241,0.2);
}

/* Stat value color */
[data-theme="light"] .stat-value {
  color: #0f1117;
}

/* Filters bar */
[data-theme="light"] .filters-bar {
  background: rgba(255,255,255,0.8);
  border: 1px solid var(--border);
  box-shadow: 0 1px 4px rgba(15,17,40,0.04);
}

/* Selects & search */
[data-theme="light"] .filter-select,
[data-theme="light"] .search-input {
  background: #ffffff;
  border-color: var(--border);
  color: var(--text-primary);
}

[data-theme="light"] .filter-select:focus,
[data-theme="light"] .search-input:focus {
  border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99,102,241,0.12);
}

/* Lead table */
[data-theme="light"] .leads-table thead th {
  background: var(--bg-card-alt);
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border);
}

[data-theme="light"] .leads-table tbody tr:hover {
  background: rgba(99,102,241,0.04);
  box-shadow: inset 3px 0 0 #6366f1;
}

/* Badge overrides for light */
[data-theme="light"] .badge {
  font-weight: 600;
}

/* Detail panel */
[data-theme="light"] .detail-panel {
  background: #ffffff;
  border-left: 1px solid var(--border);
  box-shadow: -4px 0 20px rgba(15,17,40,0.08);
}

/* Login split in light mode */
[data-theme="light"] .login-split {
  box-shadow: 0 8px 40px rgba(15,17,40,0.14), 0 0 0 1px rgba(99,102,241,0.1);
}

/* User info bottom of sidebar */
[data-theme="light"] .user-info {
  background: var(--bg-card-alt);
  border-radius: 10px;
}

/* Sidebar bottom button */
[data-theme="light"] .btn-logout {
  background: rgba(244,63,94,0.06);
  border-color: rgba(244,63,94,0.15);
}

[data-theme="light"] .btn-logout:hover {
  background: rgba(244,63,94,0.12);
  border-color: rgba(244,63,94,0.3);
}

/* ── Stat cards: colorful top line + corner glow in light ── */
[data-theme="light"] .stat-card::before {
  background: linear-gradient(90deg, transparent, rgba(99,102,241,0.6), rgba(129,140,248,0.6), transparent);
  opacity: 0.8;
}

[data-theme="light"] .stat-card::after {
  background: radial-gradient(circle at top right, rgba(99,102,241,0.07) 0%, transparent 70%);
}

[data-theme="light"] .stat-card:hover {
  border-color: rgba(99,102,241,0.25);
  background: linear-gradient(160deg, #f5f6ff 0%, #ffffff 100%);
  box-shadow: 0 8px 28px rgba(99,102,241,0.12), 0 0 0 1px rgba(99,102,241,0.14);
}

[data-theme="light"] .stat-card:hover::before {
  background: linear-gradient(90deg, transparent, #6366f1, #818cf8, transparent);
  opacity: 1;
}

/* Colored stat values — keep glow but lighter */
[data-theme="light"] .stat-value { text-shadow: none; color: #0f1117; }
[data-theme="light"] .stat-value.cyan   { color: #4f46e5; text-shadow: none; }
[data-theme="light"] .stat-value.green  { color: #16a34a; text-shadow: none; }
[data-theme="light"] .stat-value.orange { color: #d97706; text-shadow: none; }
[data-theme="light"] .stat-value.blue   { color: #4f46e5; text-shadow: none; }

/* Stat bar in light */
[data-theme="light"] .stat-bar { background: #e9ebf6; }
[data-theme="light"] .stat-bar-fill { background: linear-gradient(90deg, #6366f1, #818cf8); }

/* Chart card */
[data-theme="light"] .chart-card {
  background: #ffffff;
  border: 1px solid var(--border);
  box-shadow: var(--shadow-card);
}

[data-theme="light"] .chart-title {
  color: var(--text-secondary);
}

/* Filters bar stronger presence */
[data-theme="light"] .filters-bar {
  background: #ffffff;
  border: 1px solid var(--border);
  box-shadow: 0 1px 6px rgba(15,17,40,0.05);
}

/* Table header row */
[data-theme="light"] .leads-table thead tr {
  background: #f5f6fb;
}

/* Nav item — cleaner active indicator */
[data-theme="light"] .nav-item.active {
  background: linear-gradient(90deg, rgba(99,102,241,0.1), rgba(99,102,241,0.04));
}

/* Sidebar logo glow in light */
[data-theme="light"] .sidebar-logo {
  background: linear-gradient(180deg, rgba(99,102,241,0.04) 0%, transparent 100%);
}

/* Badge coloring stays vibrant in light */
[data-theme="light"] .badge-bron {
  background: rgba(99,102,241,0.1);
  color: #4f46e5;
  border-color: rgba(99,102,241,0.2);
}
</style>
</head>
<body>

<!-- ============================================================
     LOGIN PAGE
     ============================================================ -->
<div id="login-page">
  <div class="login-split">

    <!-- LEFT: Form side -->
    <div class="login-form-side">
      <div class="login-form-inner">
        <div class="login-logo-top">
          <img src="/logo.png" alt="Helvaro">
        </div>

        <h1 class="login-welcome">Welkom terug!</h1>
        <p class="login-subtitle">Voer uw gegevens in om toegang te krijgen tot uw dashboard</p>

        <div class="form-group">
          <label class="form-label" for="login-email">E-mailadres</label>
          <input class="form-input" type="email" id="login-email" placeholder="naam@bedrijf.nl" autocomplete="username">
        </div>
        <div class="form-group">
          <label class="form-label" for="login-password">Wachtwoord</label>
          <input class="form-input" type="password" id="login-password" placeholder="••••••••" autocomplete="current-password">
        </div>
        <button class="btn-login" id="btn-login"><span>Inloggen <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-left:6px"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></span></button>
        <div class="login-error" id="login-error">Ongeldige inloggegevens. Probeer opnieuw.</div>

        <div class="login-footer">Beveiligd door <span>Helvaro</span> &mdash; AI Platform 2025</div>
      </div>
    </div>

    <!-- RIGHT: Brand side with 3 slides -->
    <div class="login-brand-side">
      <div class="brand-slides-wrap">

        <!-- Slide 1: Lead Overzicht -->
        <div class="brand-slide active" data-slide="0">
          <div class="brand-card-mock">
            <div class="brand-card-header">
              <div class="brand-card-dot"></div>
              <div class="brand-card-dot"></div>
              <div class="brand-card-dot"></div>
              <span class="brand-card-title">Lead Overzicht</span>
            </div>
            <div class="brand-stats">
              <div class="brand-stat">
                <div class="brand-stat-num">24</div>
                <div class="brand-stat-label">Leads</div>
              </div>
              <div class="brand-stat">
                <div class="brand-stat-num">68%</div>
                <div class="brand-stat-label">Conversie</div>
              </div>
              <div class="brand-stat">
                <div class="brand-stat-num">12</div>
                <div class="brand-stat-label">Afspraken</div>
              </div>
            </div>
            <div class="brand-bars">
              <div class="brand-bar" style="height:30%"></div>
              <div class="brand-bar" style="height:55%"></div>
              <div class="brand-bar" style="height:40%"></div>
              <div class="brand-bar" style="height:70%"></div>
              <div class="brand-bar active" style="height:100%"></div>
              <div class="brand-bar" style="height:85%"></div>
              <div class="brand-bar" style="height:60%"></div>
              <div class="brand-bar" style="height:90%"></div>
            </div>
          </div>
          <div class="brand-tagline">
            <h2>Naadloze werkomgeving</h2>
            <p>Alles wat u nodig heeft in één krachtig AI-platform</p>
          </div>
        </div>

        <!-- Slide 2: AI Kwalificatie -->
        <div class="brand-slide" data-slide="1">
          <div class="brand-card-mock">
            <div class="brand-card-header">
              <div class="brand-card-dot"></div>
              <div class="brand-card-dot"></div>
              <div class="brand-card-dot"></div>
              <span class="brand-card-title">AI Kwalificatie</span>
            </div>
            <div class="brand-score-row">
              <div class="brand-score-ring">
                <svg viewBox="0 0 80 80" width="80" height="80">
                  <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="8"/>
                  <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="8"
                    stroke-dasharray="134" stroke-dashoffset="40" stroke-linecap="round"
                    transform="rotate(-90 40 40)"/>
                </svg>
                <div class="brand-score-label">70%</div>
              </div>
              <div class="brand-score-items">
                <div class="brand-score-item">
                  <div class="brand-score-bar-wrap"><div class="brand-score-bar-fill" style="width:85%"></div></div>
                  <span>Budget fit</span>
                </div>
                <div class="brand-score-item">
                  <div class="brand-score-bar-wrap"><div class="brand-score-bar-fill" style="width:60%"></div></div>
                  <span>Urgentie</span>
                </div>
                <div class="brand-score-item">
                  <div class="brand-score-bar-wrap"><div class="brand-score-bar-fill" style="width:72%"></div></div>
                  <span>Beslisser</span>
                </div>
              </div>
            </div>
          </div>
          <div class="brand-tagline">
            <h2>Slimme AI-scoring</h2>
            <p>Elke lead automatisch gekwalificeerd en gescoord</p>
          </div>
        </div>

        <!-- Slide 3: Afspraken -->
        <div class="brand-slide" data-slide="2">
          <div class="brand-card-mock">
            <div class="brand-card-header">
              <div class="brand-card-dot"></div>
              <div class="brand-card-dot"></div>
              <div class="brand-card-dot"></div>
              <span class="brand-card-title">Aankomende Afspraken</span>
            </div>
            <div class="brand-agenda">
              <div class="brand-agenda-item">
                <div class="brand-agenda-time">09:00</div>
                <div class="brand-agenda-content">
                  <div class="brand-agenda-name">Thomas B.</div>
                  <div class="brand-agenda-tag">Kennismaking</div>
                </div>
                <div class="brand-agenda-dot hot"></div>
              </div>
              <div class="brand-agenda-item">
                <div class="brand-agenda-time">11:30</div>
                <div class="brand-agenda-content">
                  <div class="brand-agenda-name">Laura V.</div>
                  <div class="brand-agenda-tag">Demo call</div>
                </div>
                <div class="brand-agenda-dot warm"></div>
              </div>
              <div class="brand-agenda-item">
                <div class="brand-agenda-time">14:00</div>
                <div class="brand-agenda-content">
                  <div class="brand-agenda-name">Marco S.</div>
                  <div class="brand-agenda-tag">Follow-up</div>
                </div>
                <div class="brand-agenda-dot warm"></div>
              </div>
            </div>
          </div>
          <div class="brand-tagline">
            <h2>Altijd overzicht</h2>
            <p>Uw agenda en leads op één plek, altijd up-to-date</p>
          </div>
        </div>

      </div>

      <!-- Dots -->
      <div class="brand-dots" id="brand-dots">
        <div class="brand-dot active" data-target="0"></div>
        <div class="brand-dot" data-target="1"></div>
        <div class="brand-dot" data-target="2"></div>
      </div>
    </div>

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
      <img src="/logo.png" alt="Helvaro">
    </div>
    <nav class="sidebar-nav">
      <button class="nav-item active" data-page="dashboard" id="nav-dashboard">
        <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg></span>
        Dashboard
      </button>
      <button class="nav-item" data-page="calendly" id="nav-calendly">
        <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></span>
        Kalender
      </button>
      <button class="nav-item" data-page="exports" id="nav-exports">
        <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></span>
        Exports
      </button>
      <button class="nav-item" data-page="admin" id="nav-admin" style="display:none">
        <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span>
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
      <button class="btn-logout" id="btn-logout"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg> Uitloggen</button>
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
        <button class="btn-icon theme-toggle" id="btn-theme" title="Wissel thema" style="padding:8px 10px"></button>
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
            <span class="icon">↻</span>
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
  // Preserve inner suffix span if present
  const unitSpan = el.querySelector('.stat-unit');
  function setNum(val) {
    const formatted = decimals > 0 ? val.toFixed(decimals) : Math.floor(val);
    if (unitSpan) {
      el.firstChild.textContent = formatted;
    } else {
      el.textContent = formatted + suffix;
    }
  }
  // Set initial node if unitSpan exists
  if (unitSpan && !el.firstChild.nodeType === Node.TEXT_NODE) {
    el.insertBefore(document.createTextNode('0'), unitSpan);
  } else if (unitSpan) {
    el.firstChild.textContent = '0';
  }
  function step(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    setNum(num * eased);
    if (progress < 1) requestAnimationFrame(step);
    else setNum(num);
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
  const saved = localStorage.getItem('hv-theme') || 'light';
  applyTheme(saved);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('btn-theme');
  if (btn) btn.innerHTML = theme === 'dark'
    ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>'
    : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  localStorage.setItem('hv-theme', theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
  // Re-render chart with correct theme colors
  setTimeout(renderChart, 50);
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

  const isLight = document.documentElement.getAttribute('data-theme') === 'light';

  if (state.leadsChart) state.leadsChart.destroy();
  state.leadsChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: weeks,
      datasets: [{
        label: 'Leads',
        data: counts,
        backgroundColor: isLight ? 'rgba(99,102,241,0.55)' : 'rgba(99,102,241,0.4)',
        borderColor: isLight ? '#6366f1' : '#818cf8',
        borderWidth: isLight ? 0 : 2,
        borderRadius: 8,
        hoverBackgroundColor: isLight ? 'rgba(99,102,241,0.75)' : 'rgba(129,140,248,0.5)'
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          grid: { color: isLight ? 'rgba(99,102,241,0.06)' : 'rgba(255,255,255,0.05)' },
          ticks: { color: isLight ? '#5c6478' : '#6a85b0' }
        },
        y: {
          grid: { color: isLight ? 'rgba(99,102,241,0.06)' : 'rgba(255,255,255,0.05)' },
          ticks: { color: isLight ? '#5c6478' : '#6a85b0', stepSize: 1 },
          beginAtZero: true
        }
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
      <div class="stat-value \${c.color}" data-target="\${c.value}" data-suffix="\${c.suffix}">0\${c.suffix ? \`<span class="stat-unit">\${c.suffix}</span>\` : ''}</div>
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
document.getElementById('btn-theme').addEventListener('click', toggleTheme);
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
    btn.innerHTML = '<span class="icon">↻</span> Rapport opnieuw laden';
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
      initLoginSlideshow();
    }
  } else {
    document.getElementById('login-page').style.display = 'flex';
    initLoginSlideshow();
  }
})();

/* ============================================================
   LOGIN SLIDESHOW
   ============================================================ */
function initLoginSlideshow() {
  const slides = document.querySelectorAll('.brand-slide');
  const dots   = document.querySelectorAll('#brand-dots .brand-dot');
  if (!slides.length) return;

  let current = 0;
  let timer = null;

  function goTo(idx) {
    slides[current].classList.remove('active');
    dots[current].classList.remove('active');
    current = (idx + slides.length) % slides.length;
    slides[current].classList.add('active');
    dots[current].classList.add('active');
  }

  function start() {
    timer = setInterval(() => goTo(current + 1), 5000);
  }

  function restart() {
    clearInterval(timer);
    start();
  }

  // Dot click
  dots.forEach((dot, i) => {
    dot.addEventListener('click', () => { goTo(i); restart(); });
  });

  start();
}
</script>
</body>
</html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).send(HTML);
};
