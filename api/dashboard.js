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
  --accent:        #6366f1;
  --accent-bright: #818cf8;
  --text:          #e6edf3;
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
  --accent:        #4f46e5;
  --accent-bright: #6366f1;
  --text:          #0f1117;
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
  overflow-y: auto;
  overflow-x: hidden;
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
  margin-bottom: 48px;
}

.login-logo-top img {
  height: 88px;
  width: auto;
  object-fit: contain;
  display: block;
  filter: drop-shadow(0 0 18px rgba(14, 165, 233, 0.35)) drop-shadow(0 0 6px rgba(99, 102, 241, 0.2));
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

/* Electric glow orbs — indigo (button) + cyan (logo) */
.login-brand-side::after {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 65% 45% at 65% 15%, rgba(99,102,241,0.22) 0%, transparent 55%),
    radial-gradient(ellipse 50% 55% at 10% 80%, rgba(14,165,233,0.22) 0%, transparent 55%),
    radial-gradient(ellipse 40% 35% at 88% 88%, rgba(56,189,248,0.14) 0%, transparent 50%),
    radial-gradient(ellipse 35% 30% at 20% 15%, rgba(79,70,229,0.14) 0%, transparent 50%);
  pointer-events: none;
}

/* Large floating mock card */
.brand-card-mock {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 440px;
  background: linear-gradient(145deg, rgba(79,70,229,0.1) 0%, rgba(14,165,233,0.07) 100%);
  backdrop-filter: blur(28px);
  -webkit-backdrop-filter: blur(28px);
  border: 1px solid rgba(99,102,241,0.28);
  border-radius: 24px;
  padding: 32px;
  box-shadow:
    0 24px 80px rgba(0,0,0,0.55),
    0 0 0 1px rgba(56,189,248,0.06),
    inset 0 1px 0 rgba(255,255,255,0.09),
    0 0 48px rgba(99,102,241,0.12);
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
  background: rgba(99,102,241,0.35);
}

.brand-card-dot:first-child  { background: #6366f1; box-shadow: 0 0 8px rgba(99,102,241,0.7); }
.brand-card-dot:nth-child(2) { background: #38bdf8; box-shadow: 0 0 6px rgba(14,165,233,0.5); }

.brand-card-title {
  font-size: 11.5px;
  font-weight: 700;
  background: linear-gradient(90deg, #818cf8, #38bdf8);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
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
  background: rgba(99,102,241,0.1);
  border: 1px solid rgba(99,102,241,0.2);
  border-radius: 16px;
  padding: 16px 12px;
  text-align: center;
  transition: border-color 0.3s;
}

.brand-stat-num {
  font-family: 'Orbitron', sans-serif;
  font-size: 26px;
  font-weight: 800;
  background: linear-gradient(135deg, #a5b4fc, #38bdf8);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  line-height: 1;
  margin-bottom: 4px;
}

.brand-stat-label {
  font-size: 10px;
  color: rgba(255,255,255,0.5);
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
  background: rgba(99,102,241,0.18);
  transition: background 0.3s;
}

.brand-bar.active {
  background: linear-gradient(180deg, #818cf8, #4f46e5);
  box-shadow: 0 0 18px rgba(99,102,241,0.55), 0 0 6px rgba(56,189,248,0.3);
}

.brand-bar:nth-child(2) { background: rgba(56,189,248,0.15); }
.brand-bar:nth-child(6) { background: linear-gradient(180deg, #38bdf8, #0ea5e9); box-shadow: 0 0 12px rgba(14,165,233,0.4); }
.brand-bar:nth-child(8) { background: rgba(56,189,248,0.22); }

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
  background: linear-gradient(120deg, #c7d2fe 0%, #38bdf8 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 10px;
  font-family: 'Inter', sans-serif;
  letter-spacing: -0.3px;
}

.brand-tagline p {
  font-size: 15px;
  color: rgba(255,255,255,0.58);
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
  background: linear-gradient(90deg, #6366f1, #38bdf8);
  border-radius: 3px;
  box-shadow: 0 0 8px rgba(99,102,241,0.45);
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
  background: rgba(99,102,241,0.09);
  border: 1px solid rgba(99,102,241,0.2);
  border-radius: 10px;
  padding: 10px 14px;
}

.brand-agenda-time {
  font-size: 11px;
  font-weight: 700;
  color: #a5b4fc;
  min-width: 38px;
  font-family: 'Orbitron', sans-serif;
  letter-spacing: 0;
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
  background: rgba(99,102,241,0.3);
  border: none;
  cursor: pointer;
  transition: all 0.35s cubic-bezier(0.4,0,0.2,1);
}
button.brand-dot { border: none; padding: 0; }

.brand-dot.active {
  background: linear-gradient(90deg, #6366f1, #38bdf8);
  width: 36px;
  box-shadow: 0 0 10px rgba(99,102,241,0.5);
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
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  outline: none;
  min-height: 52px;
  touch-action: manipulation;
}

.form-input:hover {
  border-color: #d1d5db;
  background: #fff;
}

.form-input:focus {
  border-color: #6366f1;
  background: #fff;
  box-shadow: 0 0 0 4px rgba(99,102,241,0.12), 0 1px 2px rgba(0,0,0,0.05);
}

.form-input:focus-visible {
  outline: none;
}

.form-input::placeholder { color: #9ca3af; }

/* Error state for inputs */
.form-input.error {
  border-color: #f43f5e;
  background: rgba(244,63,94,0.02);
}
.form-input.error:focus {
  box-shadow: 0 0 0 4px rgba(244,63,94,0.12);
}

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
  margin-top: 16px;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
  box-shadow: 0 6px 24px rgba(99,102,241,0.35), 0 0 0 0 rgba(99,102,241,0);
  min-height: 56px;
  touch-action: manipulation;
}

.btn-login::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, #6366f1, #818cf8 50%, #a5b4fc);
  opacity: 0;
  transition: opacity 0.3s ease;
}

.btn-login::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0;
  height: 0;
  background: rgba(255,255,255,0.2);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  transition: width 0.5s ease, height 0.5s ease;
}

.btn-login:hover::before { opacity: 1; }
.btn-login:hover {
  box-shadow: 0 8px 32px rgba(99,102,241,0.5), 0 0 0 4px rgba(99,102,241,0.15);
  transform: translateY(-2px);
}
.btn-login:active {
  transform: translateY(0) scale(0.98);
  box-shadow: 0 2px 12px rgba(99,102,241,0.3);
}
.btn-login:active::after {
  width: 200px;
  height: 200px;
}
.btn-login:focus-visible {
  outline: none;
  box-shadow: 0 6px 24px rgba(99,102,241,0.4), 0 0 0 4px rgba(99,102,241,0.3);
}
.btn-login span { position: relative; z-index: 1; display: inline-flex; align-items: center; gap: 6px; }

/* Loading state for login button */
.btn-login.loading {
  pointer-events: none;
  opacity: 0.85;
}
.btn-login.loading span { opacity: 0; }
.btn-login.loading::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 22px;
  height: 22px;
  margin: -11px 0 0 -11px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

.login-error {
  display: none;
  margin-top: 16px;
  padding: 12px 16px;
  background: rgba(244, 63, 94, 0.08);
  border: 1px solid rgba(244, 63, 94, 0.2);
  border-radius: 10px;
  color: #dc2626;
  font-size: 13px;
  font-weight: 500;
  text-align: center;
  animation: shakeError 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97);
}

.login-error.visible { display: flex; align-items: center; justify-content: center; gap: 8px; }

.login-error::before {
  content: '';
  width: 18px;
  height: 18px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23dc2626' stroke-width='2'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cline x1='12' y1='8' x2='12' y2='12'/%3E%3Cline x1='12' y1='16' x2='12.01' y2='16'/%3E%3C/svg%3E");
  background-size: contain;
  flex-shrink: 0;
}

@keyframes shakeError {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-8px); }
  40% { transform: translateX(8px); }
  60% { transform: translateX(-6px); }
  80% { transform: translateX(6px); }
}
@media (prefers-reduced-motion: reduce) {
  .skeleton, .skeleton::after { animation: none; }
  .login-error { animation: none; }
  .btn-login.loading::after { animation: spin 1.5s linear infinite; }
  * { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
}

/* ============================================================
   CALENDAR (WEEK VIEW)
   ============================================================ */
.cal-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  background: var(--bg-primary);
}
.cal-today-btn {
  padding: 7px 16px;
  border: 1px solid var(--border);
  border-radius: 20px;
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  font-family: 'Inter', sans-serif;
  transition: border-color 0.2s;
}
.cal-today-btn:hover { border-color: rgba(99,102,241,0.5); color: #818cf8; }
.cal-nav-btn {
  width: 32px;
  height: 32px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-primary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.2s;
}
.cal-nav-btn:hover { border-color: rgba(99,102,241,0.5); color: #818cf8; }
.cal-range-label {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  margin-left: 4px;
  font-family: 'Inter', sans-serif;
}
.cal-book-btn {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 18px;
  background: linear-gradient(135deg, #4f46e5, #6366f1);
  border-radius: 10px;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  box-shadow: 0 4px 16px rgba(99,102,241,0.35);
  transition: transform 0.15s, box-shadow 0.15s;
}
.cal-book-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(99,102,241,0.5); }

/* Day header row */
.cal-day-headers {
  display: flex;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  background: var(--bg-primary);
}
.cal-gutter { width: 54px; flex-shrink: 0; }
.cal-day-cols-header {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(7, 1fr);
}
.cal-day-header-cell {
  padding: 10px 8px;
  text-align: center;
  border-left: 1px solid var(--border);
}
.cal-day-header-cell .cal-day-name {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: var(--text-muted);
  margin-bottom: 4px;
}
.cal-day-header-cell .cal-day-num {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  margin: 0 auto;
}
.cal-day-header-cell.cal-today .cal-day-num {
  background: linear-gradient(135deg, #4f46e5, #6366f1);
  color: #fff;
  box-shadow: 0 4px 12px rgba(99,102,241,0.4);
}
.cal-day-header-cell.cal-today .cal-day-name { color: #818cf8; }

/* Scrollable grid */
.cal-scroll-area {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}
.cal-scroll-area::-webkit-scrollbar { width: 6px; }
.cal-scroll-area::-webkit-scrollbar-thumb { background: rgba(99,102,241,0.3); border-radius: 3px; }
.cal-time-grid {
  display: flex;
  min-height: 880px;
}
.cal-time-labels {
  width: 58px;
  flex-shrink: 0;
  position: relative;
}
.cal-time-label {
  height: 80px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  padding-right: 10px;
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 600;
  padding-top: 4px;
  box-sizing: border-box;
  position: relative;
}
.cal-time-label-half {
  position: absolute;
  top: 40px;
  right: 10px;
  font-size: 9px;
  color: var(--text-muted);
  opacity: 0.5;
  font-weight: 500;
}
.cal-day-cols {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  position: relative;
}
.cal-day-col {
  border-left: 1px solid var(--border);
  position: relative;
}
.cal-hour-row {
  height: 80px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  box-sizing: border-box;
  position: relative;
}
.cal-hour-row::after {
  content: '';
  position: absolute;
  left: 0; right: 0;
  top: 40px;
  border-bottom: 1px dashed rgba(255,255,255,0.035);
  pointer-events: none;
}
[data-theme="light"] .cal-hour-row::after {
  border-bottom-color: rgba(0,0,0,0.06);
}
.cal-day-col.cal-today-col { background: rgba(99,102,241,0.03); }

/* Now line */
.cal-now-line {
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  background: #f43f5e;
  z-index: 10;
  pointer-events: none;
}
.cal-now-line::before {
  content: '';
  position: absolute;
  left: -4px;
  top: -4px;
  width: 10px;
  height: 10px;
  background: #f43f5e;
  border-radius: 50%;
}

/* Event blocks */
.cal-event {
  position: absolute;
  left: 3px;
  right: 3px;
  border-radius: 9px;
  padding: 6px 9px;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  cursor: pointer;
  overflow: hidden;
  z-index: 5;
  transition: filter 0.15s, transform 0.12s, box-shadow 0.15s;
  min-height: 28px;
  line-height: 1.3;
  box-shadow: 0 2px 10px rgba(0,0,0,0.28);
  display: flex;
  flex-direction: column;
  gap: 2px;
  border-left: 3px solid rgba(255,255,255,0.35);
}
.cal-event:hover {
  filter: brightness(1.1);
  transform: translateX(-1px) scale(1.018);
  box-shadow: 0 6px 20px rgba(0,0,0,0.38);
  z-index: 10;
}
.cal-event .cal-event-time {
  font-size: 10px;
  font-weight: 800;
  opacity: 1;
  letter-spacing: 0.2px;
  white-space: nowrap;
}
.cal-event .cal-event-name {
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cal-event .cal-event-type {
  font-size: 9px;
  opacity: 0.7;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cal-event .cal-event-dur {
  font-size: 9px;
  font-weight: 600;
  opacity: 0.75;
  white-space: nowrap;
  margin-top: auto;
  padding-top: 2px;
}

/* ============================================================
   PROFILE PAGE
   ============================================================ */
.profile-wrap { width: 100%; display: flex; flex-direction: column; gap: 20px; }

.profile-hero {
  display: flex;
  align-items: center;
  gap: 24px;
  background: linear-gradient(135deg, rgba(79,70,229,0.12) 0%, rgba(14,165,233,0.07) 100%);
  border: 1px solid rgba(99,102,241,0.25);
  border-radius: 20px;
  padding: 28px 32px;
}
.profile-avatar-lg {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: linear-gradient(135deg, #4f46e5, #38bdf8);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  font-weight: 800;
  color: #fff;
  flex-shrink: 0;
  font-family: 'Inter', sans-serif;
  box-shadow: 0 8px 24px rgba(99,102,241,0.4);
}
.profile-name-lg {
  font-size: 22px;
  font-weight: 800;
  color: var(--text-primary);
  margin-bottom: 4px;
  font-family: 'Inter', sans-serif;
}
.profile-email-lg { font-size: 14px; color: var(--text-muted); margin-bottom: 10px; }
.profile-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 12px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 600;
  background: rgba(99,102,241,0.15);
  border: 1px solid rgba(99,102,241,0.3);
  color: #818cf8;
}

.profile-stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}
.profile-stat-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 18px 20px;
  text-align: center;
}
.profile-stat-card .psv {
  font-size: 28px;
  font-weight: 800;
  background: linear-gradient(135deg, #a5b4fc, #38bdf8);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  font-family: 'Orbitron', sans-serif;
  line-height: 1;
  margin-bottom: 6px;
}
.profile-stat-card .psl {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  font-weight: 600;
}

.profile-cards {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 14px;
}
.profile-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 22px 24px;
}
.profile-card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-muted);
  margin-bottom: 18px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border);
}
.profile-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: var(--text-muted);
  padding: 6px 0;
  border-bottom: 1px solid rgba(255,255,255,0.03);
}
.profile-row:last-child { border-bottom: none; }
.profile-row strong { color: var(--text-primary); font-weight: 600; }

    .profile-section-title {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--text-muted);
      margin-bottom: 12px;
      margin-top: 4px;
    }
    .profile-recent-leads {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 24px;
    }
    .profile-recent-lead-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 10px;
      cursor: pointer;
      transition: border-color 0.15s;
    }
    .profile-recent-lead-row:hover { border-color: var(--accent); }
    .profile-recent-lead-avatar {
      width: 34px; height: 34px; border-radius: 50%;
      background: linear-gradient(135deg,#4f46e5,#7c3aed);
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 700; color: #fff; flex-shrink: 0;
    }
    .profile-recent-lead-name { font-size: 14px; font-weight: 600; color: var(--text); flex: 1; }
    .profile-recent-lead-meta { font-size: 12px; color: var(--text-muted); }
    .profile-recent-lead-score {
      font-size: 13px; font-weight: 700; color: var(--accent);
      font-family: 'Orbitron', monospace;
    }
    .profile-quick-actions {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 12px;
      margin-bottom: 8px;
    }
    .profile-action-btn {
      display: flex; align-items: center; gap: 10px;
      padding: 14px 18px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      color: var(--text);
      font-size: 13px; font-weight: 600;
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s;
      text-align: left;
    }
    .profile-action-btn:hover { border-color: var(--accent); background: rgba(99,102,241,0.06); }
    .profile-action-btn svg { color: var(--accent); flex-shrink: 0; }

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
  height: 52px;
  width: auto;
  object-fit: contain;
  display: block;
  flex-shrink: 0;
  filter: drop-shadow(0 0 10px rgba(14, 165, 233, 0.3));
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
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  margin-bottom: 4px;
  border: none;
  background: none;
  width: 100%;
  text-align: left;
}

.nav-item:focus-visible {
  outline: 2px solid var(--blue-bright);
  outline-offset: 2px;
}

.nav-item:hover {
  background: rgba(255,255,255,0.05);
  color: var(--text-primary);
}

.nav-item.active {
  background: linear-gradient(90deg, rgba(99, 102, 241, 0.12), rgba(99, 102, 241, 0.06));
  color: var(--blue-bright);
  border: none;
  font-weight: 600;
}

.nav-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 15%;
  height: 70%;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: linear-gradient(180deg, var(--blue-primary), var(--blue-bright));
  box-shadow: 0 0 8px rgba(99, 102, 241, 0.4);
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
  transition: opacity 0.2s ease;
}

.page-subtitle {
  font-size: 11.5px;
  color: var(--text-muted);
  margin-top: 3px;
  -webkit-text-fill-color: var(--text-muted);
  transition: opacity 0.2s ease;
  opacity: 0.8;
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
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  white-space: nowrap;
}

.btn-icon:hover {
  background: rgba(99,102,241,0.12);
  border-color: rgba(99,102,241,0.25);
  color: var(--blue-bright);
  box-shadow: 0 0 12px rgba(99,102,241,0.1);
  transform: translateY(-1px);
}

.btn-icon:active {
  transform: translateY(0) scale(0.97);
}

.btn-icon:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(99,102,241,0.25);
  border-color: var(--blue-bright);
}

    /* ── Global Search ── */
    .search-overlay {
      position: fixed;
      inset: 0;
      background: rgba(8,12,20,0.8);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      z-index: 9000;
      display: none;
      align-items: flex-start;
      justify-content: center;
      padding-top: 90px;
    }
    .search-overlay.open { display: flex; animation: searchBgIn 0.15s ease both; }
    @keyframes searchBgIn { from { opacity:0; } to { opacity:1; } }
    .search-modal {
      background: var(--bg-card);
      border: 1px solid var(--border-bright);
      border-radius: var(--radius);
      width: min(660px, 92vw);
      box-shadow: 0 32px 80px rgba(0,0,0,0.7), var(--shadow-glow);
      overflow: hidden;
      position: relative;
      animation: searchModalIn 0.2s cubic-bezier(0.16,1,0.3,1) both;
    }
    /* Match stat-card top glow line */
    .search-modal::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(99,102,241,0.6), rgba(165,180,252,0.5), transparent);
      z-index: 1;
    }
    @keyframes searchModalIn { from { transform: translateY(-14px) scale(0.97); opacity:0; } to { transform: none; opacity:1; } }
    .search-modal-bar {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
    }
    .search-modal-bar svg { color: var(--accent); flex-shrink:0; }
    .search-modal-input {
      flex: 1;
      background: none;
      border: none;
      outline: none;
      font-size: 16px;
      color: var(--text-primary);
      font-family: 'Inter', sans-serif;
    }
    .search-modal-input::placeholder { color: var(--text-secondary); }
    .search-kbd {
      background: var(--bg-card-alt);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 3px 10px;
      font-size: 11px;
      color: var(--text-secondary);
      cursor: pointer;
      font-family: 'Inter', sans-serif;
      white-space: nowrap;
      flex-shrink: 0;
      transition: var(--transition);
    }
    .search-kbd:hover { border-color: var(--accent); color: var(--text-primary); }
    .search-results {
      max-height: 420px;
      overflow-y: auto;
      padding: 6px 0;
    }
    .search-results::-webkit-scrollbar { width: 3px; }
    .search-results::-webkit-scrollbar-track { background: transparent; }
    .search-results::-webkit-scrollbar-thumb { background: var(--border-bright); border-radius: 2px; }
    .search-hint {
      padding: 32px 20px;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
    }
    .search-hint-icon { font-size: 28px; opacity: 0.3; line-height: 1; }
    .search-hint-text { font-size: 13px; color: var(--text-secondary); }
    .search-hint-shortcuts { display: flex; gap: 16px; margin-top: 4px; flex-wrap: wrap; justify-content: center; }
    .search-hint-shortcut { font-size: 11px; color: var(--text-muted); display: flex; align-items: center; gap: 5px; }
    .search-hint-shortcut kbd {
      background: var(--bg-card-alt);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 1px 6px;
      font-size: 10px;
      font-family: 'Inter', sans-serif;
      color: var(--text-secondary);
    }
    .search-section-label {
      padding: 10px 20px 3px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--text-muted);
    }
    .search-result-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 20px;
      cursor: pointer;
      transition: background 0.1s, border-left-color 0.1s;
      border-left: 3px solid transparent;
      user-select: none;
    }
    .search-result-item:hover,
    .search-result-item.active {
      background: var(--bg-card-alt);
      border-left-color: var(--accent);
    }
    .search-result-avatar {
      width: 36px; height: 36px; border-radius: var(--radius-sm);
      background: linear-gradient(135deg, var(--blue-primary), #7c3aed);
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 700; color: #fff; flex-shrink: 0;
      letter-spacing: 0.03em;
      box-shadow: 0 2px 8px rgba(99,102,241,0.3);
    }
    .search-result-body { flex: 1; min-width: 0; }
    .search-result-name {
      font-size: 13px; font-weight: 600; color: var(--text-primary);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .search-result-name mark {
      background: rgba(99,102,241,0.2); color: var(--accent-bright);
      font-weight: 700; border-radius: 3px; padding: 0 2px;
    }
    .search-result-meta {
      font-size: 11px; color: var(--text-secondary); margin-top: 2px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .search-result-tags {
      display: flex; gap: 5px; align-items: center;
      margin-left: auto; flex-shrink: 0; padding-left: 8px;
    }
    .search-result-badge {
      font-size: 10px; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.04em; padding: 2px 7px; border-radius: 20px;
      background: rgba(99,102,241,0.12); color: var(--blue-bright);
      border: 1px solid rgba(99,102,241,0.2);
    }
    .search-result-badge.qualified {
      background: rgba(34,197,94,0.1); color: var(--green);
      border-color: rgba(34,197,94,0.2);
    }
    .search-result-score {
      font-size: 11px; font-weight: 700; font-family: 'Orbitron', monospace;
      color: var(--blue-bright);
      background: rgba(99,102,241,0.1);
      padding: 2px 8px; border-radius: var(--radius-sm);
      border: 1px solid rgba(99,102,241,0.2);
      white-space: nowrap;
    }
    .search-no-results {
      padding: 36px 20px;
      text-align: center;
      color: var(--text-secondary);
      font-size: 13px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }
    .search-no-results-icon { font-size: 26px; opacity: 0.3; }
    .search-footer {
      padding: 9px 20px;
      border-top: 1px solid var(--border);
      display: flex;
      gap: 16px;
      align-items: center;
      background: var(--bg-card-alt);
    }
    .search-footer-hint { font-size: 11px; color: var(--text-muted); display: flex; align-items: center; gap: 4px; }
    .search-footer-hint kbd {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 1px 5px;
      font-size: 10px;
      font-family: 'Inter', sans-serif;
      color: var(--text-secondary);
    }
    .search-footer-count { margin-left: auto; font-size: 11px; color: var(--text-muted); }
    /* Search pill in topbar */
    .search-pill {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      background: var(--bg-card-alt);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      color: var(--text-secondary);
      font-size: 13px;
      cursor: pointer;
      transition: var(--transition);
      min-width: 170px;
      font-family: 'Inter', sans-serif;
    }
    .search-pill:hover { border-color: var(--accent); color: var(--text-primary); background: var(--bg-card-hover); }
    .search-pill svg { flex-shrink: 0; opacity: 0.7; }
    .search-pill-label { flex: 1; text-align: left; }
    .search-pill-kbd {
      font-size: 10px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 1px 5px;
      font-family: 'Inter', sans-serif;
      color: var(--text-muted);
      flex-shrink: 0;
    }
.notif-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  background: var(--red);
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  min-width: 16px;
  height: 16px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 3px;
  border: 2px solid var(--bg-topbar, var(--bg));
  pointer-events: none;
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
  padding: 22px 20px 18px;
  position: relative;
  overflow: hidden;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: default;
  box-shadow: var(--shadow-card);
}

/* Counter animation for stat values */
@keyframes countUp {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.stat-card .stat-value {
  animation: countUp 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  animation-delay: 0.1s;
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
  transform: translateY(-3px) scale(1.01);
  box-shadow: 0 12px 40px rgba(0,0,0,0.45), 0 0 0 1px rgba(99,102,241,0.15);
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

.stat-trend {
  margin-top: 4px;
  min-height: 16px;
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
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  animation: rowFadeUp 0.35s ease both;
  position: relative;
}

@keyframes rowFadeUp {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

tbody tr:nth-child(even) { background: rgba(255,255,255,0.012); }
tbody tr:hover {
  background: rgba(99, 102, 241, 0.08);
  box-shadow: inset 3px 0 0 var(--blue-bright);
  transform: scale(1.002);
}
tbody tr:active { transform: scale(0.998); }
tbody tr:last-child { border-bottom: none; }

/* Row focus state for keyboard navigation */
tbody tr:focus-visible {
  outline: 2px solid var(--blue-bright);
  outline-offset: -2px;
  background: rgba(99, 102, 241, 0.1);
}

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
  gap: 5px;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  transition: all 0.15s ease;
  letter-spacing: 0.2px;
}

.badge-new {
  background: rgba(138, 150, 170, 0.12);
  color: #8a96aa;
  border: 1px solid rgba(138,150,170,0.2);
}
.badge-inprogress {
  background: rgba(255, 149, 0, 0.1);
  color: var(--orange);
  border: 1px solid rgba(255,149,0,0.22);
  position: relative;
}
.badge-inprogress::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--orange);
  animation: pulse 1.5s ease-in-out infinite;
}
.badge-done {
  background: rgba(129, 140, 248, 0.1);
  color: var(--blue-bright);
  border: 1px solid rgba(129,140,248,0.22);
}
.badge-yes {
  background: rgba(34, 197, 94, 0.1);
  color: var(--green);
  border: 1px solid rgba(34,197,94,0.22);
}
.badge-yes::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--green);
  box-shadow: 0 0 6px rgba(34,197,94,0.5);
}
.badge-no {
  background: rgba(244, 63, 94, 0.1);
  color: var(--red);
  border: 1px solid rgba(244,63,94,0.22);
}
.badge-bron {
  background: rgba(99, 102, 241, 0.08);
  color: var(--blue-bright);
  border: 1px solid rgba(99,102,241,0.18);
  font-size: 10px;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.85); }
}

/* Score pill */
.score-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  height: 26px;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 700;
  font-family: 'Orbitron', sans-serif;
  cursor: default;
  transition: all 0.2s ease;
  padding: 0 6px;
}

.score-pill:hover {
  transform: scale(1.05);
}

.score-green {
  background: rgba(34, 197, 94, 0.12);
  color: var(--green);
  border: 1px solid rgba(34,197,94,0.25);
  box-shadow: 0 0 12px rgba(34,197,94,0.15);
}
.score-orange {
  background: rgba(245, 158, 11, 0.12);
  color: var(--orange);
  border: 1px solid rgba(245,158,11,0.25);
}
.score-red {
  background: rgba(244, 63, 94, 0.12);
  color: var(--red);
  border: 1px solid rgba(244,63,94,0.25);
}
.score-gray {
  background: rgba(138, 150, 170, 0.08);
  color: var(--text-muted);
  border: 1px solid rgba(138,150,170,0.15);
}

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
  background: linear-gradient(90deg, var(--bg-card-alt) 0%, var(--bg-card-hover) 20%, var(--bg-card-alt) 40%, var(--bg-card-alt) 100%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  border-radius: 6px;
  height: 14px;
  display: block;
  position: relative;
  overflow: hidden;
}

.skeleton::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.04), transparent);
  animation: skeleton-shine 1.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

@keyframes skeleton-shimmer {
  0% { background-position: 200% 50%; }
  100% { background-position: -200% 50%; }
}

@keyframes skeleton-shine {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

/* Skeleton stat cards */
.stat-card-skeleton {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.stat-card-skeleton .skeleton-label {
  height: 12px;
  width: 60%;
  border-radius: 4px;
}
.stat-card-skeleton .skeleton-value {
  height: 32px;
  width: 45%;
  border-radius: 6px;
}
.stat-card-skeleton .skeleton-bar {
  height: 4px;
  width: 100%;
  border-radius: 2px;
  margin-top: 8px;
}

/* Empty state */
.empty-state {
  text-align: center;
  padding: 72px 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.empty-icon {
  font-size: 56px;
  margin-bottom: 12px;
  opacity: 0.25;
  filter: grayscale(0.5);
}
.empty-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--text-secondary);
  margin-bottom: 6px;
  letter-spacing: -0.2px;
}
.empty-desc {
  font-size: 14px;
  color: var(--text-muted);
  margin-bottom: 24px;
  max-width: 320px;
  line-height: 1.6;
}
.empty-state-illustration {
  width: 120px;
  height: 120px;
  margin-bottom: 20px;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(99,102,241,0.08), rgba(56,189,248,0.05));
  border: 1px dashed rgba(99,102,241,0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48px;
  opacity: 0.6;
}

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

/* ── CRM feature styles ── */
.panel-inline-input {
  background: var(--bg-card-alt);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 13px;
  padding: 4px 10px;
  width: 100%;
  font-family: 'Inter', sans-serif;
  transition: border-color 0.15s;
}
.panel-inline-input:focus { outline: none; border-color: var(--accent); }

/* Notes */
.panel-notes-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px; }
.panel-note-item {
  background: var(--bg-card-alt);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  position: relative;
}
.panel-note-text { font-size: 13px; color: var(--text-primary); line-height: 1.5; white-space: pre-wrap; }
.panel-note-ts { font-size: 10px; color: var(--text-muted); margin-top: 4px; }
.panel-note-delete {
  position: absolute; top: 8px; right: 8px;
  background: none; border: none; cursor: pointer;
  color: var(--text-muted); font-size: 12px; padding: 2px 5px;
  border-radius: 4px; transition: color 0.1s, background 0.1s;
}
.panel-note-delete:hover { color: var(--red); background: rgba(244,63,94,0.08); }
.panel-add-note textarea {
  width: 100%; background: var(--bg-card-alt); border: 1px solid var(--border);
  border-radius: var(--radius-sm); color: var(--text-primary); font-family: 'Inter',sans-serif;
  font-size: 13px; padding: 8px 10px; resize: vertical; min-height: 60px;
  transition: border-color 0.15s;
}
.panel-add-note textarea:focus { outline: none; border-color: var(--accent); }
.btn-add-note {
  margin-top: 6px; background: rgba(99,102,241,0.12); border: 1px solid rgba(99,102,241,0.25);
  color: var(--accent); border-radius: var(--radius-sm); padding: 6px 14px;
  font-size: 12px; cursor: pointer; font-family: 'Inter',sans-serif; transition: var(--transition);
}
.btn-add-note:hover { background: rgba(99,102,241,0.2); }

/* Tasks */
.panel-tasks-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
.panel-task-item {
  display: flex; align-items: center; gap: 8px;
  background: var(--bg-card-alt); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: 8px 10px;
}
.panel-task-item.done { opacity: 0.55; }
.panel-task-check { width: 16px; height: 16px; cursor: pointer; accent-color: var(--accent); flex-shrink: 0; }
.panel-task-text { flex: 1; font-size: 13px; color: var(--text-primary); }
.panel-task-item.done .panel-task-text { text-decoration: line-through; color: var(--text-muted); }
.panel-task-due {
  font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 20px;
  background: var(--bg-card); color: var(--text-muted); border: 1px solid var(--border);
  white-space: nowrap; flex-shrink: 0;
}
.panel-task-due.overdue { background: rgba(244,63,94,0.1); color: var(--red); border-color: rgba(244,63,94,0.25); }
.panel-task-due.today { background: rgba(245,158,11,0.1); color: var(--orange); border-color: rgba(245,158,11,0.25); }
.panel-task-delete {
  background: none; border: none; cursor: pointer; color: var(--text-muted);
  font-size: 12px; padding: 2px 5px; border-radius: 4px; transition: color 0.1s;
}
.panel-task-delete:hover { color: var(--red); }
.panel-add-task { display: flex; gap: 6px; align-items: center; }
.panel-add-task input[type="text"] {
  flex: 1; background: var(--bg-card-alt); border: 1px solid var(--border);
  border-radius: var(--radius-sm); color: var(--text-primary); font-family: 'Inter',sans-serif;
  font-size: 13px; padding: 7px 10px; transition: border-color 0.15s;
}
.panel-add-task input[type="text"]:focus { outline: none; border-color: var(--accent); }
.panel-add-task input[type="date"] {
  background: var(--bg-card-alt); border: 1px solid var(--border);
  border-radius: var(--radius-sm); color: var(--text-secondary); font-family: 'Inter',sans-serif;
  font-size: 12px; padding: 7px 8px; width: 130px; transition: border-color 0.15s;
}
.panel-add-task input[type="date"]:focus { outline: none; border-color: var(--accent); }
.btn-add-task {
  background: rgba(99,102,241,0.12); border: 1px solid rgba(99,102,241,0.25);
  color: var(--accent); border-radius: var(--radius-sm); padding: 7px 14px;
  font-size: 14px; cursor: pointer; font-family: 'Inter',sans-serif; transition: var(--transition);
}
.btn-add-task:hover { background: rgba(99,102,241,0.22); }

/* Calls */
.panel-calls-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
.panel-call-item {
  display: flex; align-items: flex-start; gap: 10px;
  background: var(--bg-card-alt); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: 9px 12px;
}
.panel-call-icon { font-size: 14px; margin-top: 1px; flex-shrink: 0; }
.panel-call-body { flex: 1; min-width: 0; }
.panel-call-meta { font-size: 11px; color: var(--text-muted); margin-bottom: 2px; }
.panel-call-note { font-size: 13px; color: var(--text-primary); line-height: 1.4; }
.panel-log-call { display: flex; gap: 6px; align-items: center; }
.panel-log-call input[type="number"] {
  width: 70px; background: var(--bg-card-alt); border: 1px solid var(--border);
  border-radius: var(--radius-sm); color: var(--text-primary); font-family: 'Inter',sans-serif;
  font-size: 13px; padding: 7px 8px; transition: border-color 0.15s;
}
.panel-log-call input[type="text"] {
  flex: 1; background: var(--bg-card-alt); border: 1px solid var(--border);
  border-radius: var(--radius-sm); color: var(--text-primary); font-family: 'Inter',sans-serif;
  font-size: 13px; padding: 7px 10px; transition: border-color 0.15s;
}
.panel-log-call input:focus { outline: none; border-color: var(--accent); }
.btn-log-call {
  background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.25);
  color: var(--green); border-radius: var(--radius-sm); padding: 7px 14px;
  font-size: 12px; cursor: pointer; font-family: 'Inter',sans-serif;
  white-space: nowrap; transition: var(--transition);
}
.btn-log-call:hover { background: rgba(34,197,94,0.2); }

/* Afspraak Resultaat */
.afspraak-result { display: flex; flex-direction: column; gap: 10px; }
.afspraak-toggle-label { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; }
.afspraak-toggle-row { display: flex; gap: 8px; }
.afspraak-btn {
  flex: 1; padding: 9px 12px; border-radius: var(--radius-sm);
  border: 1px solid var(--border); background: var(--bg-card-alt);
  color: var(--text-secondary); font-size: 13px; font-weight: 600;
  cursor: pointer; font-family: 'Inter', sans-serif; transition: var(--transition);
  text-align: center;
}
.afspraak-btn:hover { border-color: var(--border-bright); color: var(--text-primary); }
.afspraak-btn.active-yes { background: rgba(34,197,94,0.12); border-color: rgba(34,197,94,0.4); color: var(--green); }
.afspraak-btn.active-no  { background: rgba(244,63,94,0.1);  border-color: rgba(244,63,94,0.35); color: var(--red); }
.afspraak-value-row { display: flex; flex-direction: column; gap: 4px; }
.afspraak-value-label { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; }
.afspraak-notitie {
  width: 100%; background: var(--bg-card-alt); border: 1px solid var(--border);
  border-radius: var(--radius-sm); color: var(--text-primary); font-family: 'Inter', sans-serif;
  font-size: 13px; padding: 8px 10px; resize: vertical; min-height: 56px; transition: border-color 0.15s;
}
.afspraak-notitie:focus { outline: none; border-color: var(--accent); }
.afspraak-status-chip {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 20px;
}
.afspraak-status-chip.yes { background: rgba(34,197,94,0.12); color: var(--green); border: 1px solid rgba(34,197,94,0.25); }
.afspraak-status-chip.no  { background: rgba(244,63,94,0.1);  color: var(--red);   border: 1px solid rgba(244,63,94,0.2); }

/* Taken widget */
.taken-widget { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px; margin-bottom: 16px; }
.taken-widget-header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.taken-widget-title { font-size: 13px; font-weight: 700; color: var(--text-primary); text-transform: uppercase; letter-spacing: 0.05em; }
.taken-widget-count { font-size: 11px; font-weight: 700; background: rgba(244,63,94,0.15); color: var(--red); padding: 2px 8px; border-radius: 20px; }
.taken-widget-empty { font-size: 13px; color: var(--text-muted); text-align: center; padding: 12px 0; }
.taken-item {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 12px; border-radius: var(--radius-sm);
  background: var(--bg-card-alt); border: 1px solid var(--border);
  cursor: pointer; margin-bottom: 6px; transition: border-color 0.15s;
}
.taken-item:hover { border-color: var(--accent); }
.taken-item.overdue { border-color: rgba(244,63,94,0.3); background: rgba(244,63,94,0.04); }
.taken-item-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--orange); flex-shrink: 0; }
.taken-item.overdue .taken-item-dot { background: var(--red); }
.taken-item-body { flex: 1; min-width: 0; }
.taken-item-text { font-size: 13px; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.taken-item-lead { font-size: 11px; color: var(--text-muted); }
.taken-item-due { font-size: 11px; font-weight: 600; color: var(--orange); white-space: nowrap; flex-shrink: 0; }
.taken-item.overdue .taken-item-due { color: var(--red); }

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
.charts-row {
  display: flex;
  gap: 16px;
  margin-bottom: 20px;
  align-items: flex-start;
}
.chart-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 20px 24px;
  flex: 1;
  min-width: 0;
}
.chart-card-sm {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 20px 24px;
  width: 260px;
  flex-shrink: 0;
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

/* ── Follow-up Queue ── */
    .nb-widget {
      background: var(--bg-card);
      border: 1px solid rgba(239,68,68,0.35);
      border-radius: 14px;
      padding: 16px 20px;
      margin-bottom: 16px;
    }
    .nb-header {
      display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;
    }
    .nb-title {
      display: flex; align-items: center; gap: 7px;
      font-size: 11px; font-weight: 700; letter-spacing: 0.08em;
      text-transform: uppercase; color: #ef4444;
    }
    .nb-count {
      background: rgba(239,68,68,0.15); color: #ef4444;
      font-size: 11px; font-weight: 700; padding: 2px 8px;
      border-radius: 20px; border: 1px solid rgba(239,68,68,0.3);
    }
    .nb-list { display: flex; flex-direction: column; gap: 8px; }
    .nb-item {
      display: flex; align-items: center; gap: 10px;
      background: var(--bg-card-alt); border-radius: 10px;
      padding: 10px 12px; cursor: default;
    }
    .nb-item-info { flex: 1; min-width: 0; }
    .nb-item-name { font-size: 13px; font-weight: 600; color: var(--text-primary); }
    .nb-item-sub  { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
    .nb-call-btn {
      display: flex; align-items: center; gap: 5px; padding: 6px 12px;
      background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3);
      border-radius: 8px; color: #ef4444; font-size: 12px; font-weight: 600;
      text-decoration: none; white-space: nowrap; transition: background 0.15s;
    }
    .nb-call-btn:hover { background: rgba(239,68,68,0.2); }

    .followup-widget {
      background: var(--bg-card);
      border: 1px solid rgba(245,158,11,0.35);
      border-radius: 14px;
      padding: 16px 20px;
      margin-bottom: 16px;
    }
    .followup-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }
    .followup-title {
      display: flex;
      align-items: center;
      gap: 7px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #f59e0b;
    }
    .followup-count {
      background: rgba(245,158,11,0.15);
      color: #f59e0b;
      font-size: 11px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 20px;
      border: 1px solid rgba(245,158,11,0.3);
    }
    .followup-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .followup-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 14px;
      background: var(--bg-card-alt);
      border: 1px solid var(--border);
      border-radius: 10px;
      cursor: pointer;
      transition: border-color 0.15s;
    }
    .followup-item:hover { border-color: #f59e0b; }
    .followup-item-name { font-size: 13px; font-weight: 600; color: var(--text); flex: 1; }
    .followup-item-meta { font-size: 11px; color: var(--text-muted); }
    .followup-item-score { font-size: 12px; font-weight: 700; font-family: 'Orbitron',monospace; color: #f59e0b; }
    .followup-call-btn {
      display: flex;
      align-items: center;
      gap: 5px;
      padding: 5px 10px;
      border-radius: 7px;
      background: rgba(245,158,11,0.12);
      border: 1px solid rgba(245,158,11,0.3);
      color: #f59e0b;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
    }
    .followup-call-btn:hover { background: rgba(245,158,11,0.22); }

/* ── Top Leads Strip ── */
    .top-leads-strip {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 16px 20px;
      margin-bottom: 16px;
    }
    .top-leads-strip-title {
      display: flex;
      align-items: center;
      gap: 7px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text-muted);
      margin-bottom: 12px;
    }
    .top-leads-strip-title svg { color: #f59e0b; }
    .top-leads-list {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .top-lead-chip {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      background: var(--bg-card-alt);
      border: 1px solid var(--border);
      border-radius: 10px;
      cursor: pointer;
      transition: border-color 0.15s;
      font-size: 13px;
    }
    .top-lead-chip:hover { border-color: var(--accent); }
    .top-lead-chip-avatar {
      width: 26px; height: 26px; border-radius: 50%;
      background: linear-gradient(135deg,#4f46e5,#7c3aed);
      display: flex; align-items: center; justify-content: center;
      font-size: 10px; font-weight: 700; color: #fff;
    }
    .top-lead-chip-name { font-weight: 600; color: var(--text); }
    .top-lead-chip-score { font-weight: 700; color: var(--accent); font-family:'Orbitron',monospace; font-size:12px; }

/* ── Today widget ── */
.today-widget {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 16px 20px;
  margin-bottom: 20px;
}
.today-widget-title {
  font-family: 'Orbitron', sans-serif;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 1.5px;
  text-transform: uppercase;
  margin-bottom: 12px;
}
.today-apt {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}
.today-apt:last-child { border-bottom: none; }
.today-apt-time {
  font-size: 12px;
  font-weight: 600;
  color: var(--blue-bright);
  min-width: 48px;
  flex-shrink: 0;
}
.today-apt-name {
  font-size: 13px;
  color: var(--text-primary);
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.today-apt-type {
  font-size: 11px;
  color: var(--text-secondary);
  flex-shrink: 0;
}
.today-empty {
  font-size: 13px;
  color: var(--text-muted);
  padding: 4px 0;
}

/* ── Nav badge ── */
.nav-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--blue-primary);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  margin-left: auto;
  flex-shrink: 0;
}

/* ── Calendar weekend columns ── */
.cal-day-col.cal-weekend-col { background: rgba(0,0,0,0.06); }
[data-theme="light"] .cal-day-col.cal-weekend-col { background: rgba(0,0,0,0.03); }

/* ── Calendar event modal ── */
.cal-modal-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.55);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  z-index: 2000;
  align-items: center;
  justify-content: center;
}
.cal-modal-overlay.open { display: flex; }
.cal-modal {
  background: var(--bg-card);
  border: 1px solid var(--border-bright);
  border-radius: 16px;
  width: 100%;
  max-width: 420px;
  box-shadow: 0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.12);
  overflow: hidden;
  animation: modal-in 0.2s cubic-bezier(0.4,0,0.2,1);
}
@keyframes modal-in {
  from { opacity: 0; transform: scale(0.95) translateY(10px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
.cal-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px 14px;
  border-bottom: 1px solid var(--border);
}
.cal-modal-header-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}
.cal-modal-close {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  padding: 2px 6px;
  border-radius: 6px;
  transition: var(--transition);
}
.cal-modal-close:hover { background: rgba(255,255,255,0.08); color: var(--text-primary); }
.cal-modal-body { padding: 16px 20px 20px; }
.cal-modal-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 7px 0;
  font-size: 13px;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border);
}
.cal-modal-row:last-of-type { border-bottom: none; }
.cal-modal-row-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.6px;
  min-width: 64px;
  padding-top: 1px;
}
.cal-modal-row-val { color: var(--text-primary); flex: 1; }
.cal-modal-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
  flex-wrap: wrap;
}
.cal-modal-btn {
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: var(--transition);
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.cal-modal-btn-primary {
  background: var(--blue-primary);
  color: #fff;
}
.cal-modal-btn-primary:hover { background: var(--blue-bright); }
.cal-modal-btn-secondary {
  background: rgba(255,255,255,0.06);
  color: var(--text-secondary);
  border: 1px solid var(--border-bright);
}
.cal-modal-btn-secondary:hover { background: rgba(255,255,255,0.1); color: var(--text-primary); }
.cal-modal-btn-danger {
  background: rgba(244,63,94,0.1);
  color: var(--red);
  border: 1px solid rgba(244,63,94,0.25);
}
.cal-modal-btn-danger:hover { background: rgba(244,63,94,0.2); }

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
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}

.export-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 28px;
}

.export-filter-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 20px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}
.export-filter-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.export-filter-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.export-select {
  background: var(--bg-card-alt);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  font-size: 13px;
  padding: 7px 28px 7px 10px;
  cursor: pointer;
  outline: none;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236366f1' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
}
.export-select:focus { border-color: var(--accent); }
.export-preview-count {
  margin-left: auto;
  font-size: 13px;
  color: var(--text-muted);
  background: var(--bg-card-alt);
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid var(--border);
}
.export-preview-count #export-count-num {
  font-weight: 700;
  color: var(--accent);
}
.export-card-featured {
  border-color: rgba(99,102,241,0.3) !important;
  background: linear-gradient(135deg, rgba(99,102,241,0.06) 0%, var(--bg-card) 100%) !important;
}
.export-card-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(99,102,241,0.12);
  border: 1px solid rgba(99,102,241,0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
  color: var(--accent);
}
.export-includes {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin: 14px 0 18px;
}
.export-include-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-muted);
}
.export-include-item svg { color: var(--green); flex-shrink: 0; }
.export-card { display: flex; flex-direction: column; }
.export-snapshot {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 16px;
}
.export-snap-item {
  background: var(--bg-card-alt);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px;
  text-align: center;
}
.export-snap-val {
  font-size: 22px;
  font-weight: 700;
  color: var(--accent);
  font-family: 'Orbitron', monospace;
  line-height: 1;
  margin-bottom: 4px;
}
.export-snap-label {
  font-size: 10px;
  color: var(--text-muted);
  font-weight: 500;
}
.export-card-stats {
  grid-column: span 1;
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
   PIPELINE (KANBAN)
   ============================================================ */
    .pipeline-header-bar {
      padding: 0 24px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .pipeline-summary-chips {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .pipeline-chip {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      background: var(--bg-card);
      border: 1px solid var(--border);
      color: var(--text-muted);
    }
    .pipeline-chip-count {
      font-family: 'Orbitron', monospace;
      font-size: 13px;
      font-weight: 700;
      color: var(--accent);
    }
.pipeline-board {
  display: flex;
  gap: 16px;
  overflow-x: auto;
  padding-bottom: 16px;
  min-height: calc(100vh - 180px);
  align-items: flex-start;
}
.pipeline-board::-webkit-scrollbar { height: 6px; }
.pipeline-board::-webkit-scrollbar-thumb { background: rgba(99,102,241,0.35); border-radius: 3px; }
.pipeline-col {
  flex: 0 0 260px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.pipeline-col-header {
  padding: 14px 16px 12px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: var(--text-muted);
}
.pipeline-col-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  border-radius: 10px;
  background: var(--bg-card-alt);
  border: 1px solid var(--border);
  font-size: 11px;
  font-weight: 700;
  color: var(--text-secondary);
  padding: 0 5px;
}
.pipeline-col-body {
  flex: 1;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  min-height: 80px;
}
.pipeline-card {
  background: var(--bg-card-alt);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px 14px;
  cursor: pointer;
  transition: border-color 0.15s, transform 0.15s;
}
.pipeline-card:hover {
  border-color: var(--blue-primary);
  transform: translateY(-1px);
}
    .pipeline-card[draggable="true"] { cursor: grab; }
    .pipeline-card[draggable="true"]:active { cursor: grabbing; opacity: 0.7; }
    .pipeline-col.drag-over {
      background: rgba(99,102,241,0.08);
      border-color: rgba(99,102,241,0.4) !important;
      outline: 2px dashed rgba(99,102,241,0.4);
      outline-offset: -4px;
    }
.pipeline-card-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pipeline-card-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.pipeline-score {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 20px;
  border-radius: 5px;
  font-size: 11px;
  font-weight: 700;
  font-family: 'Orbitron', sans-serif;
}
.pipeline-card-phone {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 5px;
}
.pipeline-card-date {
  font-size: 10px;
  color: var(--text-muted);
  margin-left: auto;
}
.pipeline-col-header.col-new    { border-top: 2px solid #8b949e; }
.pipeline-col-header.col-qual   { border-top: 2px solid var(--cyan); }
.pipeline-col-header.col-apt    { border-top: 2px solid var(--green); }
.pipeline-col-header.col-won    { border-top: 2px solid #6366f1; }
.pipeline-col-header.col-lost   { border-top: 2px solid var(--red); }

/* ============================================================
   GESPREKKEN (CONVERSATIONS)
   ============================================================ */
.conv-layout {
  display: flex;
  gap: 0;
  height: calc(100vh - 130px);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: hidden;
}
.conv-list {
  width: 300px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
.conv-list-header {
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: var(--text-muted);
  flex-shrink: 0;
}
.conv-list-item {
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  transition: background 0.12s;
}
.conv-list-item:hover { background: var(--bg-card-alt); }
.conv-list-item.active { background: rgba(99,102,241,0.08); border-left: 3px solid var(--accent); }
.conv-list-item-name {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 4px;
}
.conv-list-item-date { font-size: 11px; color: var(--text-muted); font-weight: 400; }
.conv-list-item-preview { font-size: 12px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.conv-detail {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.conv-bubble {
  padding: 10px 14px;
  border-radius: 14px;
  font-size: 13px;
  line-height: 1.55;
  max-width: 80%;
  word-break: break-word;
  margin-bottom: 4px;
}
.conv-bubble.user {
  background: linear-gradient(135deg, #4f46e5, #6366f1);
  color: #fff;
  margin-left: auto;
  border-bottom-right-radius: 4px;
}
.conv-bubble.assistant {
  background: var(--bg-card-alt);
  border: 1px solid var(--border);
  color: var(--text);
  border-bottom-left-radius: 4px;
}
.conv-bubble-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
  margin-bottom: 3px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.conv-messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.conv-header {
  padding: 18px 20px;
  border-bottom: 1px solid var(--border);
  font-size: 15px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--bg-card);
}
.conv-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 10px;
  color: var(--text-muted);
  font-size: 14px;
}
.conv-empty-icon { font-size: 40px; opacity: 0.3; }

/* ============================================================
   ANALYSE (ANALYTICS)
   ============================================================ */
.analyse-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  width: 100%;
  overflow: visible;
}
.analyse-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 22px 24px;
}
.analyse-card-full  { grid-column: 1 / -1; }
.analyse-card-span2 { grid-column: span 2; }
.analyse-card-title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-muted);
  margin-bottom: 18px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.funnel-step {
  margin-bottom: 12px;
}
.funnel-step-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}
.funnel-step-label strong { color: var(--text-primary); font-weight: 700; }
.funnel-step-pct {
  font-size: 11px;
  color: var(--text-muted);
}
.funnel-bar {
  height: 10px;
  background: var(--bg-card-alt);
  border-radius: 5px;
  overflow: hidden;
}
.funnel-bar-fill {
  height: 100%;
  border-radius: 5px;
  background: linear-gradient(90deg, var(--blue-primary), var(--cyan));
  transition: width 0.8s cubic-bezier(0.4,0,0.2,1);
}
.source-table { width: 100%; border-collapse: collapse; }
.source-table th {
  font-size: 10.5px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  padding: 6px 10px 10px;
  border-bottom: 1px solid var(--border);
  text-align: left;
}
.source-table td {
  font-size: 13px;
  color: var(--text-primary);
  padding: 8px 10px;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.source-table tr:last-child td { border-bottom: none; }
.analyse-stat-big {
  font-family: 'Orbitron', sans-serif;
  font-size: 36px;
  font-weight: 800;
  color: var(--cyan);
  line-height: 1;
  margin-bottom: 6px;
  text-shadow: 0 0 20px rgba(6,182,212,0.35);
}
.analyse-stat-label {
  font-size: 12px;
  color: var(--text-muted);
}
.analyse-revenue-row {
  display: flex;
  gap: 16px;
  width: 100%;
  margin-bottom: 16px;
}
.analyse-revenue-card {
  flex: 1;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 20px 22px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.analyse-revenue-val {
  font-family: 'Orbitron', monospace;
  font-size: 26px;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1;
}
.analyse-revenue-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  margin-top: 6px;
}
.analyse-revenue-sub {
  font-size: 11px;
  color: var(--text-muted);
}
.analyse-verlies-list {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.analyse-verlies-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: var(--text-secondary);
}
.analyse-verlies-count {
  font-weight: 700;
  color: var(--text-primary);
}

/* ============================================================
   ROW QUICK ACTIONS (Feature 2)
   ============================================================ */
.row-actions { display: flex; gap: 4px; align-items: center; opacity: 0; transition: opacity 0.15s; }
.leads-table tr:hover .row-actions { opacity: 1; }
.row-action-btn {
  width: 28px; height: 28px; border-radius: 6px; border: 1px solid var(--border);
  background: var(--bg-card-alt); cursor: pointer; display: flex;
  align-items: center; justify-content: center; font-size: 13px;
  text-decoration: none; color: var(--text-secondary); transition: var(--transition);
}
.row-action-btn:hover { border-color: var(--accent); background: rgba(99,102,241,0.1); }

/* ============================================================
   PANEL QUICK ACTIONS (Feature 3)
   ============================================================ */
.panel-quick-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.panel-quick-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 14px; border-radius: var(--radius-sm);
  border: 1px solid var(--border); background: var(--bg-card-alt);
  color: var(--text-primary); font-size: 12px; font-weight: 500;
  text-decoration: none; cursor: pointer; transition: var(--transition);
  font-family: 'Inter', sans-serif;
}
.panel-quick-btn:hover { border-color: var(--accent); background: rgba(99,102,241,0.08); color: var(--accent); }

/* ============================================================
   LEAD AGE BADGES (Feature 4)
   ============================================================ */
.age-chip {
  font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 20px;
  border: 1px solid var(--border);
}
.age-chip.fresh { display: none; }
.age-chip.warm { background: rgba(34,197,94,0.1); color: var(--green); border-color: rgba(34,197,94,0.2); }
.age-chip.cooling { background: rgba(245,158,11,0.1); color: var(--orange); border-color: rgba(245,158,11,0.2); }
.age-chip.cold { background: rgba(244,63,94,0.1); color: var(--red); border-color: rgba(244,63,94,0.2); }
.age-badge-table {
  display: inline-block; font-size: 10px; font-weight: 700;
  padding: 1px 6px; border-radius: 10px; margin-left: 6px; vertical-align: middle;
}
.age-badge-warm { background: rgba(34,197,94,0.12); color: var(--green); }
.age-badge-cooling { background: rgba(245,158,11,0.12); color: var(--orange); }
.age-badge-cold { background: rgba(244,63,94,0.12); color: var(--red); }

/* ============================================================
   REVENUE GOAL CARD (Feature 5)
   ============================================================ */
.revenue-goal-card {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 18px 20px; margin-bottom: 16px;
  position: relative; overflow: hidden;
}
.revenue-goal-card::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(99,102,241,0.5), transparent);
}
.revenue-goal-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
.revenue-goal-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); }
.revenue-goal-sub { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
.revenue-goal-edit { background: none; border: none; cursor: pointer; font-size: 14px; opacity: 0.5; transition: opacity 0.15s; }
.revenue-goal-edit:hover { opacity: 1; }
.revenue-goal-amounts { display: flex; align-items: baseline; gap: 6px; margin-bottom: 12px; }
.revenue-goal-current { font-size: 28px; font-weight: 800; color: var(--text-primary); font-family: 'Orbitron', monospace; }
.revenue-goal-slash { font-size: 18px; color: var(--text-muted); }
.revenue-goal-target { font-size: 16px; color: var(--text-secondary); font-family: 'Orbitron', monospace; }
.revenue-goal-bar-wrap { height: 6px; background: var(--bg-card-alt); border-radius: 3px; overflow: hidden; margin-bottom: 8px; border: 1px solid var(--border); }
.revenue-goal-bar { height: 100%; border-radius: 3px; background: linear-gradient(90deg, var(--accent), var(--blue-bright)); transition: width 0.6s cubic-bezier(0.4,0,0.2,1); }
.revenue-goal-pct { font-size: 12px; color: var(--text-secondary); }

/* ============================================================
   INSTELLINGEN (SETTINGS)
   ============================================================ */
.settings-wrap { width: 100%; display: flex; flex-direction: column; gap: 20px; }
.settings-section {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: hidden;
}
.settings-section-title {
  padding: 16px 20px 14px;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 8px;
}
.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border);
  gap: 20px;
}
.settings-row:last-child { border-bottom: none; }
.settings-label {
  font-size: 13px;
  color: var(--text-primary);
  font-weight: 500;
  flex-shrink: 0;
}
.settings-label-sub {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
}
.settings-value {
  font-size: 13px;
  color: var(--text-secondary);
  text-align: right;
}
.settings-input {
  background: var(--bg-card-alt);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 13px;
  font-family: 'Inter', sans-serif;
  padding: 7px 12px;
  outline: none;
  transition: border-color 0.15s;
  width: 220px;
}
.settings-input:focus { border-color: var(--blue-bright); }
.settings-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-muted);
}
.settings-coming-soon {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 20px;
  font-size: 10px;
  font-weight: 600;
  background: rgba(245,158,11,0.1);
  border: 1px solid rgba(245,158,11,0.25);
  color: var(--orange);
  letter-spacing: 0.5px;
}
.settings-danger .settings-label { color: var(--red); }
.settings-info-box {
  margin: 0 20px 16px;
  padding: 14px;
  background: rgba(99,102,241,0.06);
  border-left: 3px solid var(--blue-primary);
  border-radius: 0 8px 8px 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.55;
}
.settings-apikey {
  font-family: monospace;
  font-size: 13px;
  color: var(--text-secondary);
  letter-spacing: 0.5px;
}
.btn-show-key {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-muted);
  font-size: 11px;
  padding: 3px 8px;
  cursor: pointer;
  transition: var(--transition);
  margin-left: 8px;
}
.btn-show-key:hover { border-color: var(--blue-bright); color: var(--blue-bright); }

/* ============================================================
   ACTIVITEIT (ACTIVITY FEED)
   ============================================================ */
.activity-feed {
  display: flex;
  flex-direction: column;
  gap: 0;
  width: 100%;
}
.activity-item {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 14px 0;
  border-bottom: 1px solid var(--border);
  animation: rowFadeUp 0.3s ease both;
}
.activity-item:last-child { border-bottom: none; }
.activity-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 4px;
}
.activity-dot-new       { background: #8b949e; }
.activity-dot-qualified { background: var(--cyan); box-shadow: 0 0 8px rgba(6,182,212,0.5); }
.activity-dot-booked    { background: var(--green); box-shadow: 0 0 8px rgba(34,197,94,0.5); }
.activity-dot-won       { background: var(--blue-bright); box-shadow: 0 0 8px rgba(129,140,248,0.5); }
.activity-content { flex: 1; }
.activity-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 2px;
}
.activity-sub {
  font-size: 12px;
  color: var(--text-muted);
}
.activity-time {
  font-size: 11px;
  color: var(--text-muted);
  flex-shrink: 0;
  margin-top: 2px;
  white-space: nowrap;
}
.activity-feed-wrap {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 20px 24px;
  width: 100%;
}
.activity-feed-header {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-muted);
  margin-bottom: 4px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border);
}

/* ============================================================
   PAGES VISIBILITY
   ============================================================ */
.page { display: none !important; }
.page.active { display: block !important; }
#page-calendly.active { display: flex !important; flex-direction: row; }
.cal-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }
.cal-right-sidebar {
  width: 272px; flex-shrink: 0; border-left: 1px solid var(--border);
  background: var(--bg-card); display: flex; flex-direction: column; overflow: hidden;
}
.cal-sidebar-header {
  padding: 14px 14px 0; display: flex; align-items: center; gap: 8px; flex-shrink: 0;
}
.cal-sidebar-title {
  font-size: 12px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.08em; color: var(--text-primary); flex: 1;
}
.cal-sidebar-count {
  font-size: 11px; font-weight: 700; padding: 2px 8px;
  border-radius: 20px; background: rgba(244,63,94,0.15); color: var(--red);
}
.cal-sidebar-desc {
  padding: 4px 14px 10px; font-size: 11px; color: var(--text-muted);
  border-bottom: 1px solid var(--border); flex-shrink: 0;
}
.cal-sidebar-scroll {
  flex: 1; overflow-y: auto; padding: 10px 10px; display: flex;
  flex-direction: column; gap: 8px;
}
.cal-sidebar-empty {
  padding: 28px 14px; text-align: center; color: var(--text-muted); font-size: 13px; line-height: 1.6;
}
.cal-call-item {
  background: var(--bg-card-alt); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: 11px 12px; transition: border-color 0.15s;
  cursor: pointer;
}
.cal-call-item:hover { border-color: var(--accent); }
.cal-call-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.cal-call-avatar {
  width: 30px; height: 30px; border-radius: 7px;
  background: linear-gradient(135deg,#4f46e5,#7c3aed);
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 700; color: #fff; flex-shrink: 0;
}
.cal-call-name {
  font-size: 13px; font-weight: 600; color: var(--text-primary);
  flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.cal-call-score { font-size: 11px; font-weight: 700; font-family:'Orbitron',monospace; color: var(--accent); }
.cal-call-phone-link {
  display: flex; align-items: center; gap: 7px; padding: 8px 10px;
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: var(--radius-sm); margin-bottom: 7px;
  text-decoration: none; color: var(--text-primary);
  font-size: 13px; font-weight: 700; transition: border-color 0.15s, color 0.15s;
  font-family: 'Inter', sans-serif;
}
.cal-call-phone-link:hover { border-color: var(--green); color: var(--green); }
.cal-call-actions { display: flex; gap: 6px; }
.cal-call-btn {
  flex: 1; padding: 6px 6px; border-radius: 6px;
  border: 1px solid var(--border); background: var(--bg-card);
  color: var(--text-secondary); font-size: 11px; font-weight: 600;
  cursor: pointer; text-align: center; text-decoration: none;
  transition: var(--transition); font-family: 'Inter', sans-serif;
  display: flex; align-items: center; justify-content: center; gap: 3px;
}
.cal-call-btn:hover { border-color: var(--accent); color: var(--accent); background: rgba(99,102,241,0.08); }
.cal-call-btn.primary { background: rgba(99,102,241,0.1); border-color: rgba(99,102,241,0.25); color: var(--accent); }
.cal-call-btn.primary:hover { background: rgba(99,102,241,0.2); }
.cal-hour-row { cursor: default; }
.cal-hour-add {
  display: none; position: absolute; top: 50%; right: 6px; transform: translateY(-50%);
  width: 22px; height: 22px; border-radius: 5px; border: 1px solid rgba(99,102,241,0.35);
  background: rgba(99,102,241,0.12); color: #6366f1; font-size: 16px; font-weight: 300;
  cursor: pointer; align-items: center; justify-content: center; line-height: 1;
  transition: background 0.15s;
}
.cal-hour-add:hover { background: rgba(99,102,241,0.25); }
.cal-hour-row:hover .cal-hour-add { display: flex; }

/* ── Attendance banner ────────────────────────────────────────── */
.cal-attendance-banner {
  display: none; flex-shrink: 0;
  background: linear-gradient(135deg,rgba(245,158,11,0.08),rgba(245,158,11,0.03));
  border-bottom: 1px solid rgba(245,158,11,0.2);
  padding: 10px 16px 12px;
}
.cal-attendance-banner.visible { display: block; }
.cal-att-banner-title {
  font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em;
  color: var(--orange); margin-bottom: 9px; display: flex; align-items: center; gap: 6px;
}
.cal-att-cards { display: flex; gap: 9px; flex-wrap: wrap; }
.cal-att-card {
  background: var(--bg-card); border: 1px solid rgba(245,158,11,0.22);
  border-radius: 10px; padding: 10px 12px;
  display: flex; align-items: center; gap: 12px;
  transition: border-color 0.15s;
}
.cal-att-card:hover { border-color: rgba(245,158,11,0.4); }
.cal-att-info { min-width: 0; }
.cal-att-name { font-size: 13px; font-weight: 700; color: var(--text-primary); }
.cal-att-time { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
.cal-att-btns { display: flex; gap: 6px; flex-shrink: 0; }
.cal-att-btn {
  padding: 5px 13px; border-radius: 7px; font-size: 12px; font-weight: 700;
  border: 1px solid; cursor: pointer; transition: var(--transition); font-family:'Inter',sans-serif;
}
.cal-att-btn.yes { background:rgba(16,185,129,0.1); border-color:rgba(16,185,129,0.3); color:var(--green); }
.cal-att-btn.yes:hover { background:rgba(16,185,129,0.2); }
.cal-att-btn.no  { background:rgba(244,63,94,0.1); border-color:rgba(244,63,94,0.3); color:var(--red); }
.cal-att-btn.no:hover  { background:rgba(244,63,94,0.2); }
.cal-att-followup-input, .cal-att-followup-textarea {
  width:100%; box-sizing:border-box; padding:7px 10px;
  background:var(--bg-card); border:1px solid var(--border);
  border-radius:7px; color:var(--text-primary); font-size:12px;
  font-family:'Inter',sans-serif; outline:none; transition:border-color 0.15s;
}
.cal-att-followup-input:focus, .cal-att-followup-textarea:focus { border-color:var(--accent); }
.cal-att-followup-textarea { resize:vertical; min-height:52px; }
/* Orange pulse dot on calendar events needing attendance */
.cal-event-needs-att {
  position:absolute; top:5px; right:5px; width:8px; height:8px;
  border-radius:50%; background:var(--orange); animation:pulse 1.5s infinite;
}
/* Attendance section in cal event modal */
.cal-modal-att-section {
  margin-top:14px; padding-top:14px; border-top:1px solid var(--border);
}
.cal-modal-att-label {
  font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.07em;
  color:var(--text-muted); margin-bottom:9px;
}
.cal-modal-att-btns { display:flex; gap:8px; }
.cal-modal-att-result {
  margin-top:14px; padding:9px 14px; border-radius:9px;
  font-size:13px; font-weight:700; display:flex; align-items:center; gap:8px;
}
.cal-modal-att-result.yes { background:rgba(16,185,129,0.1); color:var(--green); }
.cal-modal-att-result.no  { background:rgba(244,63,94,0.1);  color:var(--red);   }
.cal-modal-att-result-edit {
  margin-left:auto; font-size:11px; font-weight:600; cursor:pointer;
  color:var(--text-muted); text-decoration:underline;
}
/* Follow-up form after marking attendance */
.cal-att-followup {
  margin-top:12px; display:flex; flex-direction:column; gap:10px;
  padding:12px; background:var(--bg-card-alt); border-radius:10px;
  border:1px solid var(--border); animation:modalIn 0.15s ease;
}
.cal-att-followup-label {
  font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.07em; color:var(--text-muted);
}
.cal-att-followup-input {
  width:100%; box-sizing:border-box; padding:8px 11px;
  background:var(--bg-card); border:1px solid var(--border);
  border-radius:8px; color:var(--text-primary); font-size:13px;
  font-family:'Inter',sans-serif; transition:border-color 0.15s; outline:none;
}
.cal-att-followup-input:focus { border-color:var(--accent); }
.cal-att-followup-textarea {
  width:100%; box-sizing:border-box; padding:8px 11px;
  background:var(--bg-card); border:1px solid var(--border);
  border-radius:8px; color:var(--text-primary); font-size:13px;
  font-family:'Inter',sans-serif; transition:border-color 0.15s; outline:none;
  resize:vertical; min-height:72px;
}
.cal-att-followup-textarea:focus { border-color:var(--accent); }
.cal-att-save-btn {
  padding:9px 16px; border-radius:8px; border:none; cursor:pointer;
  background:linear-gradient(135deg,#6366f1,#4f46e5); color:#fff;
  font-size:13px; font-weight:700; font-family:'Inter',sans-serif;
  transition:filter 0.15s; text-align:center;
}
.cal-att-save-btn:hover { filter:brightness(1.1); }
.cal-att-save-btn:disabled { opacity:0.5; pointer-events:none; }

/* ── Custom booking modal ─────────────────────────────────────── */
#cal-book-overlay {
  position: fixed; inset: 0; z-index: 1200;
  background: rgba(0,0,0,0.65); backdrop-filter: blur(6px);
  display: none; align-items: center; justify-content: center;
}
#cal-book-overlay.open { display: flex; }
#cal-book-modal {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: var(--radius); width: min(520px, 96vw); max-height: 90vh;
  display: flex; flex-direction: column; overflow: hidden;
  box-shadow: 0 28px 70px rgba(0,0,0,0.55);
  animation: modalIn 0.18s ease;
}
#cal-book-header {
  display: flex; align-items: center; gap: 12px;
  padding: 16px 20px; border-bottom: 1px solid var(--border); flex-shrink: 0;
}
.cal-book-icon {
  width: 36px; height: 36px; border-radius: 10px;
  background: linear-gradient(135deg,#6366f1,#4f46e5);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
#cal-book-title {
  flex: 1; font-size: 15px; font-weight: 700; color: var(--text-primary); line-height: 1.2;
}
#cal-book-subtitle { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
#cal-book-close {
  width: 30px; height: 30px; border-radius: 8px; border: 1px solid var(--border);
  background: transparent; cursor: pointer; display: flex; align-items: center;
  justify-content: center; color: var(--text-muted); transition: var(--transition); flex-shrink: 0;
}
#cal-book-close:hover { background: var(--bg-card-alt); color: var(--text-primary); }
/* Scrollable body */
#cal-book-body {
  flex: 1; overflow-y: auto; padding: 20px;
  display: flex; flex-direction: column; gap: 18px;
}
#cal-book-body::-webkit-scrollbar { width: 5px; }
#cal-book-body::-webkit-scrollbar-thumb { background: rgba(99,102,241,0.3); border-radius: 3px; }
/* Section label */
.cb-label {
  font-size: 11px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.07em; color: var(--text-muted); margin-bottom: 8px;
}
/* Event type tabs */
.cb-types { display: flex; gap: 7px; flex-wrap: wrap; }
.cb-type-btn {
  padding: 6px 14px; border-radius: 20px; border: 1px solid var(--border);
  background: var(--bg-card-alt); color: var(--text-secondary);
  font-size: 12px; font-weight: 600; cursor: pointer; transition: var(--transition);
  font-family: 'Inter',sans-serif; white-space: nowrap;
}
.cb-type-btn:hover { border-color: var(--accent); color: var(--accent); }
.cb-type-btn.active {
  background: rgba(99,102,241,0.12); border-color: var(--accent); color: var(--accent);
}
.cb-type-dur {
  font-size: 10px; opacity: 0.7; margin-left: 4px;
}
/* Date nav */
.cb-date-nav {
  display: flex; align-items: center; gap: 8px;
  background: var(--bg-card-alt); border: 1px solid var(--border);
  border-radius: 10px; padding: 8px 12px;
}
.cb-date-label {
  flex: 1; font-size: 14px; font-weight: 700; color: var(--text-primary); text-align: center;
}
.cb-date-btn {
  width: 28px; height: 28px; border-radius: 7px; border: 1px solid var(--border);
  background: transparent; cursor: pointer; display: flex; align-items: center;
  justify-content: center; color: var(--text-muted); transition: var(--transition);
  font-family: 'Inter',sans-serif;
}
.cb-date-btn:hover { background: var(--bg-card); color: var(--text-primary); border-color: var(--accent); }
/* Slot grid */
.cb-slots {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;
}
.cb-slot {
  padding: 10px 8px; border-radius: 9px; border: 1px solid var(--border);
  background: var(--bg-card-alt); color: var(--text-primary);
  font-size: 13px; font-weight: 700; cursor: pointer; text-align: center;
  transition: var(--transition); font-family: 'Inter',sans-serif;
}
.cb-slot:hover { border-color: var(--accent); background: rgba(99,102,241,0.08); color: var(--accent); }
.cb-slot.selected {
  background: rgba(99,102,241,0.15); border-color: var(--accent);
  color: var(--accent); box-shadow: 0 0 0 2px rgba(99,102,241,0.2);
}
.cb-slots-empty {
  grid-column: 1/-1; text-align: center; padding: 24px;
  color: var(--text-muted); font-size: 13px; line-height: 1.6;
}
/* Lead search */
.cb-lead-search {
  position: relative;
}
.cb-lead-input {
  width: 100%; box-sizing: border-box; padding: 9px 12px;
  background: var(--bg-card-alt); border: 1px solid var(--border);
  border-radius: 9px; color: var(--text-primary); font-size: 13px;
  font-family: 'Inter',sans-serif; transition: border-color 0.15s; outline: none;
}
.cb-lead-input:focus { border-color: var(--accent); }
.cb-field-input {
  width: 100%; box-sizing: border-box; padding: 9px 12px;
  background: var(--bg-card-alt); border: 1px solid var(--border);
  border-radius: 9px; color: var(--text-primary); font-size: 13px;
  font-family: 'Inter',sans-serif; transition: border-color 0.15s; outline: none;
}
.cb-field-input:focus { border-color: var(--accent); }
.cb-lead-dropdown {
  position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 10;
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 9px; max-height: 160px; overflow-y: auto;
  box-shadow: 0 8px 24px rgba(0,0,0,0.25);
}
.cb-lead-opt {
  padding: 8px 12px; cursor: pointer; font-size: 13px; color: var(--text-primary);
  border-bottom: 1px solid var(--border); transition: background 0.1s;
  display: flex; align-items: center; gap: 8px;
}
.cb-lead-opt:last-child { border-bottom: none; }
.cb-lead-opt:hover { background: rgba(99,102,241,0.07); }
.cb-lead-opt-score { font-size: 10px; color: var(--accent); font-weight: 700; margin-left: auto; }
/* Confirm button */
.cb-confirm-wrap { padding-top: 4px; }
.cb-confirm-btn {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  width: 100%; padding: 13px; border-radius: 10px;
  background: linear-gradient(135deg,#6366f1,#4f46e5); color: #fff;
  font-size: 14px; font-weight: 700; cursor: pointer; border: none;
  font-family: 'Inter',sans-serif; transition: filter 0.15s, transform 0.12s;
  text-decoration: none;
}
.cb-confirm-btn:hover { filter: brightness(1.1); transform: translateY(-1px); }
.cb-confirm-btn:disabled { opacity: 0.4; pointer-events: none; }
.cb-confirm-note { font-size: 11px; color: var(--text-muted); text-align: center; margin-top: 7px; }
/* Loading / empty states */
.cb-loading {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 10px; padding: 32px;
  color: var(--text-muted); font-size: 13px;
}
.cb-spinner-ring {
  width: 28px; height: 28px; border: 3px solid var(--border);
  border-top-color: var(--accent); border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
.cb-no-connection {
  padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px; line-height: 1.7;
}
.cb-no-connection a { color: var(--accent); font-weight: 600; }
/* Loading spinner for slots refresh */
.cb-slots-loading {
  grid-column: 1/-1; display: flex; align-items: center; justify-content: center;
  gap: 8px; padding: 20px; color: var(--text-muted); font-size: 12px;
}
.cal-book-spinner-ring {
  width: 16px; height: 16px; border: 2px solid var(--border);
  border-top-color: var(--accent); border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
#page-profile.active { display: block !important; }

/* ============================================================
   RESPONSIVE - TABLET & MOBILE
   ============================================================ */

/* Large desktop tweaks */
@media (max-width: 1400px) {
  .stats-grid { gap: 14px; }
}

/* Tablet landscape */
@media (max-width: 1200px) {
  .analyse-grid { grid-template-columns: repeat(2, 1fr); }
  .exports-grid { grid-template-columns: repeat(2, 1fr); }
  .profile-cards { grid-template-columns: 1fr 1fr; }
  .charts-row { flex-direction: column; }
  .chart-card-sm { width: 100%; }
}

@media (max-width: 1100px) {
  .stats-grid { grid-template-columns: repeat(3, 1fr); }
}

/* Tablet portrait */
@media (max-width: 1024px) {
  .conv-layout { flex-direction: column; height: auto; min-height: calc(100vh - 130px); }
  .conv-list { width: 100%; max-height: 280px; border-right: none; border-bottom: 1px solid var(--border); }
  .pipeline-board { gap: 12px; }
  .pipeline-col { flex: 0 0 240px; }
  .profile-stats-row { grid-template-columns: repeat(2, 1fr); }
  .cal-right-sidebar { width: 240px; }
}

/* Larger phones / small tablets */
@media (max-width: 900px) {
  .analyse-grid { grid-template-columns: 1fr; }
  .analyse-card-span2 { grid-column: span 1; }
  .profile-cards { grid-template-columns: 1fr; }
  .cal-right-sidebar { display: none; }
  .search-pill-label { display: none; }
  .search-pill { min-width: auto; padding: 8px 10px; }
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
    gap: 12px;
  }

  .stat-card {
    padding: 16px 14px 14px;
  }

  .stat-value {
    font-size: 24px;
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
    gap: 8px;
  }

  .filter-select, .search-wrapper { min-width: unset; }

  .leads-count { margin-left: 0; text-align: center; padding-top: 4px; }

  /* Hide less important table columns on mobile */
  .td-samenvatting { display: none; }

  .pipeline-board { padding-bottom: 80px; }
}

@media (max-width: 480px) {
  .stats-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .login-form-side { padding: 32px 24px; }
  .login-welcome { font-size: 28px; }
  .btn-icon span:not(.icon) { display: none; }
  .topbar-right { gap: 6px; }
  .page-title { font-size: 14px; letter-spacing: 1.5px; }
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
[data-theme="light"] .chart-card,
[data-theme="light"] .chart-card-sm {
  background: #ffffff;
  border: 1px solid var(--border);
  box-shadow: var(--shadow-card);
}

[data-theme="light"] .chart-title {
  color: var(--text-secondary);
}

/* Today widget */
[data-theme="light"] .today-widget {
  background: #ffffff;
  border: 1px solid var(--border);
  box-shadow: var(--shadow-card);
}

/* Cal modal */
[data-theme="light"] .cal-modal {
  background: #ffffff;
}
[data-theme="light"] .cal-modal-btn-secondary {
  background: rgba(0,0,0,0.04);
  color: var(--text-secondary);
}
[data-theme="light"] .cal-modal-close:hover { background: rgba(0,0,0,0.06); }

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
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
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
          <div style="position:relative">
            <input class="form-input" type="password" id="login-password" placeholder="••••••••" autocomplete="current-password" style="padding-right:44px" aria-describedby="login-error">
            <button type="button" id="btn-toggle-pw" aria-label="Wachtwoord tonen" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;padding:4px;color:#6b7280;display:flex;align-items:center" onclick="(function(){var i=document.getElementById('login-password');var b=document.getElementById('btn-toggle-pw');if(i.type==='password'){i.type='text';b.setAttribute('aria-label','Wachtwoord verbergen');b.innerHTML='<svg width=\\'16\\' height=\\'16\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'currentColor\\' stroke-width=\\'2\\' stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\'><path d=\\'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94\\'></path><path d=\\'M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19\\'></path><line x1=\\'1\\' y1=\\'1\\' x2=\\'23\\' y2=\\'23\\'></line></svg>';}else{i.type='password';b.setAttribute('aria-label','Wachtwoord tonen');b.innerHTML='<svg width=\\'16\\' height=\\'16\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'currentColor\\' stroke-width=\\'2\\' stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\'><path d=\\'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z\\'></path><circle cx=\\'12\\' cy=\\'12\\' r=\\'3\\'></circle></svg>'; }})()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            </button>
          </div>
        </div>
        <button class="btn-login" id="btn-login" aria-label="Inloggen"><span>Inloggen <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-left:6px"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></span></button>
        <div class="login-error" id="login-error" role="alert" aria-live="assertive"></div>

        <div class="login-footer">Beveiligd door <span>Helvaro</span> &mdash; AI Platform 2026</div>
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
                  <defs>
                    <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stop-color="#6366f1"/>
                      <stop offset="100%" stop-color="#38bdf8"/>
                    </linearGradient>
                  </defs>
                  <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(99,102,241,0.18)" stroke-width="8"/>
                  <circle cx="40" cy="40" r="32" fill="none" stroke="url(#ringGrad)" stroke-width="8"
                    stroke-dasharray="134" stroke-dashoffset="40" stroke-linecap="round"
                    transform="rotate(-90 40 40)" filter="drop-shadow(0 0 4px rgba(99,102,241,0.6))"/>
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
      <div class="brand-dots" id="brand-dots" role="tablist" aria-label="Slideshow navigatie">
        <button class="brand-dot active" data-target="0" role="tab" aria-selected="true" aria-label="Slide 1"></button>
        <button class="brand-dot" data-target="1" role="tab" aria-selected="false" aria-label="Slide 2"></button>
        <button class="brand-dot" data-target="2" role="tab" aria-selected="false" aria-label="Slide 3"></button>
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
      <button class="nav-item" data-page="pipeline" id="nav-pipeline">
        <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="4" height="18" rx="1"/><rect x="10" y="3" width="4" height="18" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/></svg></span>
        Pipeline
      </button>
      <button class="nav-item" data-page="calendly" id="nav-calendly">
        <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></span>
        Kalender
        <span class="nav-badge" id="cal-nav-badge" style="display:none">0</span>
      </button>
      <button class="nav-item" data-page="gesprekken" id="nav-gesprekken">
        <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span>
        Gesprekken
      </button>
      <button class="nav-item" data-page="analyse" id="nav-analyse">
        <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg></span>
        Analyse
      </button>
      <button class="nav-item" data-page="activiteit" id="nav-activiteit">
        <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></span>
        Activiteit
      </button>
      <button class="nav-item" data-page="exports" id="nav-exports">
        <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></span>
        Exports
      </button>
      <button class="nav-item" data-page="admin" id="nav-admin" style="display:none">
        <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span>
        Klanten
      </button>
      <button class="nav-item" data-page="instellingen" id="nav-instellingen">
        <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></span>
        Instellingen
      </button>
    </nav>
    <div class="sidebar-bottom">
      <div class="user-info" id="user-info-btn" onclick="navigateTo('profile')" style="cursor:pointer;" title="Bekijk profiel">
        <div class="user-avatar" id="user-avatar">HV</div>
        <div>
          <div class="user-name" id="user-name">Gebruiker</div>
          <div class="user-role">Client Account</div>
        </div>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left:auto;opacity:0.4;flex-shrink:0"><path d="M9 18l6-6-6-6"/></svg>
      </div>
      <button id="btn-back-admin" onclick="backToAdmin()" style="display:none;width:100%;padding:9px 12px;margin-bottom:6px;background:rgba(99,102,241,0.12);border:1px solid rgba(99,102,241,0.3);border-radius:8px;color:#818cf8;font-size:12px;font-weight:600;cursor:pointer;display:none;align-items:center;gap:7px">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        Klantenoverzicht
      </button>
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
            <button class="search-pill" id="btn-search" title="Zoeken (Ctrl+K)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <span class="search-pill-label">Zoeken...</span>
              <kbd class="search-pill-kbd">⌘K</kbd>
            </button>
            <button class="btn-icon" id="btn-notif" title="Notificaties" style="position:relative">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
              <span class="notif-badge" id="notif-badge" style="display:none">0</span>
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

      <!-- Charts row -->
      <div class="charts-row">
        <div class="chart-card">
          <div class="chart-title">Leads per week (laatste 8 weken)</div>
          <canvas id="leads-chart" height="80"></canvas>
        </div>
        <div class="chart-card-sm" id="bron-chart-wrap">
          <div class="chart-title">Leads per bron</div>
          <canvas id="bron-chart" height="160"></canvas>
        </div>
      </div>

      <!-- Vandaag widget -->
      <div class="today-widget" id="today-widget" style="display:none">
        <div class="today-widget-title">Vandaag</div>
        <div id="today-widget-body"><span class="today-empty">Geen afspraken vandaag</span></div>
      </div>

      <!-- Revenue Goal Card -->
      <div class="revenue-goal-card" id="revenue-goal-card">
        <div class="revenue-goal-header">
          <div>
            <div class="revenue-goal-label">Omzet Doel</div>
            <div class="revenue-goal-sub" id="revenue-goal-sub">deze maand</div>
          </div>
          <button class="revenue-goal-edit" id="revenue-goal-edit" title="Doel aanpassen">✏️</button>
        </div>
        <div class="revenue-goal-amounts">
          <span class="revenue-goal-current" id="revenue-goal-current">€0</span>
          <span class="revenue-goal-slash">/</span>
          <span class="revenue-goal-target" id="revenue-goal-target">€5.000</span>
        </div>
        <div class="revenue-goal-bar-wrap">
          <div class="revenue-goal-bar" id="revenue-goal-bar" style="width:0%"></div>
        </div>
        <div class="revenue-goal-pct" id="revenue-goal-pct">0% van doel bereikt</div>
      </div>

      <!-- Follow-up Queue -->
      <div class="followup-widget" id="followup-widget" style="display:none">
        <div class="followup-header">
          <div class="followup-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.68A2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92"/></svg>
            Opvolging Nodig
          </div>
          <span class="followup-count" id="followup-count">0</span>
        </div>
        <div class="followup-list" id="followup-list"></div>
      </div>

      <!-- Niet Bereikbaar Widget -->
      <div class="nb-widget" id="nb-widget" style="display:none">
        <div class="nb-header">
          <div class="nb-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0119 12.55M5 5a10.94 10.94 0 0114.06 14.06M10.71 5.05A16 16 0 0122.56 9M1.42 9a16 16 0 0114.26 2.26M5.33 14a16 16 0 006.39 6.6M9 5a8 8 0 017.94 7"/></svg>
            Niet bereikbaar via WhatsApp
          </div>
          <span class="nb-count" id="nb-count">0</span>
        </div>
        <div class="nb-list" id="nb-list"></div>
      </div>

      <!-- Taken Widget -->
      <div class="taken-widget" id="taken-widget" style="display:none">
        <div class="taken-widget-header">
          <span class="taken-widget-title">Openstaande Taken</span>
          <span class="taken-widget-count" id="taken-widget-count">0</span>
        </div>
        <div id="taken-widget-list"></div>
      </div>

      <!-- Top Leads Strip -->
      <div class="top-leads-strip" id="top-leads-strip" style="display:none">
        <div class="top-leads-strip-title">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          Top Leads
        </div>
        <div class="top-leads-list" id="top-leads-list"></div>
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
          <table class="leads-table">
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
                <th>Acties</th>
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

      <!-- Export filter bar -->
      <div class="export-filter-bar">
        <div class="export-filter-group">
          <label class="export-filter-label">Periode</label>
          <select class="export-select" id="export-period" onchange="updateExportPreview()">
            <option value="7">Afgelopen 7 dagen</option>
            <option value="30" selected>Afgelopen 30 dagen</option>
            <option value="90">Afgelopen 90 dagen</option>
            <option value="all">Alle tijd</option>
          </select>
        </div>
        <div class="export-filter-group">
          <label class="export-filter-label">Status</label>
          <select class="export-select" id="export-status" onchange="updateExportPreview()">
            <option value="all">Alle leads</option>
            <option value="qualified">Alleen gekwalificeerd</option>
            <option value="unqualified">Niet gekwalificeerd</option>
          </select>
        </div>
        <div class="export-preview-count" id="export-preview-count">
          <span id="export-count-num">—</span> leads geselecteerd
        </div>
      </div>

      <div class="exports-grid">

        <!-- CSV Export Card -->
        <div class="export-card export-card-featured">
          <div class="export-card-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          </div>
          <div class="export-card-title orbitron gradient-text">CSV Export</div>
          <p class="export-card-desc">Download gefilterde leads als CSV voor Excel, Google Sheets of uw CRM.</p>
          <div class="export-includes">
            <div class="export-include-item"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Naam &amp; contactgegevens</div>
            <div class="export-include-item"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Kwalificatiescores</div>
            <div class="export-include-item"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> AI samenvattingen</div>
            <div class="export-include-item"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Bronnaam &amp; datum</div>
          </div>
          <button class="btn-icon btn-primary-sm export-btn" id="btn-download-csv" style="width:100%;justify-content:center;padding:13px;margin-top:auto">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            CSV downloaden
          </button>
        </div>

        <!-- Weekly Rapport Card -->
        <div class="export-card">
          <div class="export-card-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
          </div>
          <div class="export-card-title orbitron gradient-text">Weekrapport</div>
          <p class="export-card-desc">Gedetailleerd overzicht met statistieken en gekwalificeerde leads van de afgelopen 7 dagen.</p>
          <div class="export-includes">
            <div class="export-include-item"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Leads &amp; conversie stats</div>
            <div class="export-include-item"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Gekwalificeerde leads lijst</div>
            <div class="export-include-item"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> AI scores &amp; samenvattingen</div>
          </div>
          <button class="btn-icon btn-primary-sm" id="btn-load-rapport" style="width:100%;justify-content:center;padding:13px;margin-top:auto">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>
            Rapport laden
          </button>
          <div id="rapport-content" style="display:none;margin-top:20px">
            <button class="btn-icon btn-primary-sm" id="btn-download-pdf" style="width:100%;justify-content:center;padding:10px;margin-bottom:16px;background:rgba(244,63,94,0.1);border-color:rgba(244,63,94,0.3);color:#f43f5e" onclick="exportPDF()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              Downloaden als PDF
            </button>
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

        <!-- Quick Stats Card -->
        <div class="export-card export-card-stats">
          <div class="export-card-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
          </div>
          <div class="export-card-title orbitron gradient-text">Snapshot</div>
          <p class="export-card-desc">Live overzicht van uw geselecteerde periode.</p>
          <div class="export-snapshot" id="export-snapshot">
            <div class="export-snap-item">
              <div class="export-snap-val" id="snap-total">—</div>
              <div class="export-snap-label">Totaal leads</div>
            </div>
            <div class="export-snap-item">
              <div class="export-snap-val" id="snap-qualified">—</div>
              <div class="export-snap-label">Gekwalificeerd</div>
            </div>
            <div class="export-snap-item">
              <div class="export-snap-val" id="snap-rate">—</div>
              <div class="export-snap-label">Conversie %</div>
            </div>
            <div class="export-snap-item">
              <div class="export-snap-val" id="snap-avg-score">—</div>
              <div class="export-snap-label">Gem. score</div>
            </div>
          </div>
        </div>

      </div>
    </main>

    <main class="page-content page" id="page-admin">
      <div id="admin-content">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
          <span style="font-size:13px;color:var(--text-muted)" id="admin-client-count"></span>
          <button class="btn-icon btn-primary-sm" onclick="openNewClientModal()" style="display:flex;align-items:center;gap:6px;padding:9px 16px">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
            Nieuwe klant
          </button>
        </div>
        <div class="admin-grid" id="admin-grid">
          <div style="color:var(--text-muted);font-size:14px">Klanten laden...</div>
        </div>
      </div>
    </main>

    <!-- New client modal -->
    <div id="new-client-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:1000;align-items:center;justify-content:center">
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:16px;padding:32px;width:100%;max-width:440px;margin:16px">
        <h3 style="margin-bottom:4px;font-size:17px">Nieuwe klant aanmaken</h3>
        <p style="color:var(--text-muted);font-size:13px;margin-bottom:24px">Vul de gegevens in — API key en formulier-URL worden automatisch gegenereerd.</p>
        <div style="display:flex;flex-direction:column;gap:14px">
          <div>
            <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:6px">NAAM KLANT *</label>
            <input id="nc-name" type="text" placeholder="bijv. Immo Janssen" style="width:100%;padding:10px 12px;background:var(--bg-card-alt);border:1px solid var(--border);border-radius:8px;color:var(--text-primary);font-size:14px;outline:none">
          </div>
          <div>
            <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:6px">PROJECTCODE * <span style="color:var(--text-muted);font-weight:400">(alleen letters, cijfers, _)</span></label>
            <input id="nc-code" type="text" placeholder="bijv. IMMO_JANSSEN" style="width:100%;padding:10px 12px;background:var(--bg-card-alt);border:1px solid var(--border);border-radius:8px;color:var(--text-primary);font-size:14px;outline:none;font-family:monospace;text-transform:uppercase">
          </div>
          <div>
            <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:6px">E-MAIL <span style="font-weight:400">(welkomstmail)</span></label>
            <input id="nc-email" type="email" placeholder="klant@bedrijf.be" style="width:100%;padding:10px 12px;background:var(--bg-card-alt);border:1px solid var(--border);border-radius:8px;color:var(--text-primary);font-size:14px;outline:none">
          </div>
          <div>
            <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:6px">CALENDLY LINK <span style="font-weight:400">(optioneel)</span></label>
            <input id="nc-calendly" type="url" placeholder="https://calendly.com/..." style="width:100%;padding:10px 12px;background:var(--bg-card-alt);border:1px solid var(--border);border-radius:8px;color:var(--text-primary);font-size:14px;outline:none">
          </div>
          <div id="nc-error" style="display:none;color:var(--red);font-size:13px;padding:10px 12px;background:rgba(244,63,94,0.1);border-radius:8px"></div>
          <div id="nc-success" style="display:none;background:var(--bg-card-alt);border:1px solid var(--border);border-radius:10px;padding:16px">
            <div style="font-weight:600;margin-bottom:10px;color:var(--green)">✓ Klant aangemaakt</div>
            <div style="font-size:13px;display:flex;flex-direction:column;gap:6px">
              <div><span style="color:var(--text-muted)">API Key: </span><code id="nc-result-key" style="font-size:12px;background:var(--bg-primary);padding:2px 6px;border-radius:4px"></code></div>
              <div><span style="color:var(--text-muted)">Formulier: </span><a id="nc-result-url" href="#" target="_blank" style="color:var(--accent-bright);font-size:12px"></a></div>
            </div>
          </div>
        </div>
        <div style="display:flex;gap:10px;margin-top:20px">
          <button onclick="closeNewClientModal()" style="flex:1;padding:10px;background:var(--bg-card-alt);border:1px solid var(--border);border-radius:8px;color:var(--text-primary);font-size:14px;cursor:pointer">Annuleren</button>
          <button id="nc-submit" onclick="submitNewClient()" style="flex:2;padding:10px;background:var(--accent);border:none;border-radius:8px;color:#fff;font-size:14px;font-weight:600;cursor:pointer">Aanmaken</button>
        </div>
      </div>
    </div>

    <main class="page-content page" id="page-calendly" style="padding:0;height:calc(100vh - 56px);overflow:hidden;">

      <!-- Calendar main area -->
      <div class="cal-main">
        <!-- Calendar toolbar -->
        <div class="cal-toolbar">
          <button class="cal-today-btn" onclick="calToday()">Vandaag</button>
          <button class="cal-nav-btn" onclick="calPrev()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <button class="cal-nav-btn" onclick="calNext()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>
          </button>
          <span id="cal-range-label" class="cal-range-label"></span>
          <button id="calendly-open-btn" class="cal-book-btn" onclick="openCalBookModal(new Date().toISOString().slice(0,10),null)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
            Boek afspraak
          </button>
        </div>

        <!-- Attendance banner — appears 5h after appointment -->
        <div class="cal-attendance-banner" id="cal-attendance-banner">
          <div class="cal-att-banner-title">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            Afspraken zonder resultaat
          </div>
          <div class="cal-att-cards" id="cal-att-cards"></div>
        </div>

        <!-- Day headers -->
        <div class="cal-day-headers">
          <div class="cal-gutter"></div>
          <div id="cal-day-cols-header" class="cal-day-cols-header"></div>
        </div>

        <!-- Scrollable time grid -->
        <div class="cal-scroll-area" id="cal-scroll-area">
          <div class="cal-time-grid">
            <div class="cal-time-labels" id="cal-time-labels"></div>
            <div class="cal-day-cols" id="cal-day-cols"></div>
          </div>
        </div>
      </div>

      <!-- Te Bellen sidebar -->
      <div class="cal-right-sidebar">
        <div class="cal-sidebar-header">
          <span class="cal-sidebar-title">Te Bellen</span>
          <span class="cal-sidebar-count" id="cal-sidebar-count">0</span>
        </div>
        <div class="cal-sidebar-desc">Gekwalificeerd · nog geen afspraak</div>
        <div class="cal-sidebar-scroll" id="cal-sidebar-list">
          <div class="cal-sidebar-empty">Laden...</div>
        </div>
      </div>

    </main>

    <!-- Pipeline Page -->
    <main class="page-content page" id="page-pipeline">
      <div class="pipeline-header-bar">
        <div id="pipeline-summary" class="pipeline-summary-chips"></div>
      </div>
      <div class="pipeline-board" id="pipeline-board">
        <div style="color:var(--text-muted);font-size:14px">Pipeline laden...</div>
      </div>
    </main>

    <!-- Gesprekken Page -->
    <main class="page-content page" id="page-gesprekken" style="padding:0">
      <div class="conv-layout">
        <div class="conv-list" id="conv-list">
          <div class="conv-list-header">Gesprekken</div>
          <div id="conv-list-body">
            <div style="padding:20px;color:var(--text-muted);font-size:13px">Laden...</div>
          </div>
        </div>
        <div class="conv-detail" id="conv-detail">
          <div class="conv-empty">
            <div class="conv-empty-icon">💬</div>
            <div>Selecteer een gesprek</div>
          </div>
        </div>
      </div>
    </main>

    <!-- Analyse Page -->
    <main class="page-content page" id="page-analyse">
      <!-- Revenue Analytics Row -->
      <div class="analyse-revenue-row" id="analyse-revenue-row">
        <div class="analyse-revenue-card">
          <div class="analyse-revenue-val" id="analyse-omzet-val">€0</div>
          <div class="analyse-revenue-label">Gesloten Omzet</div>
          <div class="analyse-revenue-sub">afspraken die kwamen</div>
        </div>
        <div class="analyse-revenue-card">
          <div class="analyse-revenue-val" id="analyse-gem-val">€0</div>
          <div class="analyse-revenue-label">Gem. Deal Waarde</div>
          <div class="analyse-revenue-sub" id="analyse-gem-sub">0 deals met waarde</div>
        </div>
        <div class="analyse-revenue-card">
          <div class="analyse-revenue-val" id="analyse-showup-val" style="color:var(--green)">—</div>
          <div class="analyse-revenue-label">Show-up Rate</div>
          <div class="analyse-revenue-sub" id="analyse-showup-sub">van geboekte afspraken</div>
        </div>
        <div class="analyse-revenue-card">
          <div class="analyse-revenue-val" id="analyse-winrate-val" style="color:var(--green)">0%</div>
          <div class="analyse-revenue-label">Win Rate</div>
          <div class="analyse-revenue-sub">verloren vs totaal</div>
          <div class="analyse-verlies-list" id="analyse-verlies-list"></div>
        </div>
      </div>
      <div class="analyse-grid" id="analyse-grid">
        <!-- Funnel -->
        <div class="analyse-card">
          <div class="analyse-card-title">Conversie Funnel</div>
          <div id="funnel-content"><div style="color:var(--text-muted);font-size:13px">Laden...</div></div>
        </div>
        <!-- Source Performance -->
        <div class="analyse-card">
          <div class="analyse-card-title">Prestaties per Bron</div>
          <div id="source-table-wrap"><div style="color:var(--text-muted);font-size:13px">Laden...</div></div>
        </div>
        <!-- Days of week chart -->
        <div class="analyse-card">
          <div class="analyse-card-title">Leads per Weekdag</div>
          <canvas id="analyse-days-chart" height="120"></canvas>
        </div>
        <!-- Lead score distribution — spans 2 cols -->
        <div class="analyse-card analyse-card-span2">
          <div class="analyse-card-title">Score Verdeling</div>
          <canvas id="analyse-score-chart" height="100"></canvas>
        </div>
        <!-- Avg response time — col 3 beside score chart -->
        <div class="analyse-card">
          <div class="analyse-card-title">Gemiddelde Reactietijd</div>
          <div id="analyse-response-wrap" style="display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;padding-top:16px">
            <div class="analyse-stat-big" id="analyse-response-val">—</div>
            <div class="analyse-stat-label">seconden gemiddeld</div>
            <div style="margin-top:20px;width:100%">
              <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px">Conversie samenvatting</div>
              <div id="analyse-conv-summary" style="display:flex;flex-direction:column;gap:8px"></div>
            </div>
          </div>
        </div>
        <!-- Hours chart (full width) -->
        <div class="analyse-card analyse-card-full">
          <div class="analyse-card-title">Leads per Uur van de Dag</div>
          <canvas id="analyse-hours-chart" height="70"></canvas>
        </div>
      </div>
    </main>

    <!-- Instellingen Page -->
    <main class="page-content page" id="page-instellingen">
      <div class="settings-wrap">
        <!-- AI Instellingen -->
        <div class="settings-section">
          <div class="settings-section-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            AI Instellingen
          </div>
          <div class="settings-info-box">
            Instellingen zoals de AI-naam en Calendly-link worden beheerd door het Helvaro-team. Neem contact op via <a href="mailto:sindi.s@usehelvaro.pro" style="color:var(--accent);text-decoration:none">sindi.s@usehelvaro.pro</a> om wijzigingen door te voeren.
          </div>
          <div class="settings-row">
            <div>
              <div class="settings-label">AI Naam</div>
              <div class="settings-label-sub">De naam die uw AI-assistent gebruikt</div>
            </div>
            <div class="settings-value" id="set-ai-name">Helvaro AI</div>
          </div>
          <div class="settings-row">
            <div>
              <div class="settings-label">Calendly Link</div>
              <div class="settings-label-sub">Uw boekingspagina URL</div>
            </div>
            <div class="settings-value" id="set-calendly-url" style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">—</div>
          </div>
        </div>

        <!-- Notificaties -->
        <div class="settings-section">
          <div class="settings-section-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            Notificaties
          </div>
          <div class="settings-row">
            <div>
              <div class="settings-label">Wekelijks rapport e-mail</div>
              <div class="settings-label-sub">Ontvang elke maandag een samenvattingsmail</div>
            </div>
            <div class="settings-toggle">
              <span class="settings-coming-soon">Binnenkort beschikbaar</span>
            </div>
          </div>
          <div class="settings-row">
            <div>
              <div class="settings-label">Browser notificaties</div>
              <div class="settings-label-sub">Meldingen bij nieuwe leads</div>
            </div>
            <div class="settings-toggle">
              <span class="settings-coming-soon">Binnenkort beschikbaar</span>
            </div>
          </div>
        </div>

        <!-- Account -->
        <div class="settings-section">
          <div class="settings-section-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            Account
          </div>
          <div class="settings-row">
            <div class="settings-label">Naam</div>
            <div class="settings-value" id="set-naam">—</div>
          </div>
          <div class="settings-row">
            <div class="settings-label">E-mail</div>
            <div class="settings-value" id="set-email">—</div>
          </div>
          <div class="settings-row">
            <div class="settings-label">Plan</div>
            <div class="settings-value">
              <span style="display:inline-flex;align-items:center;padding:3px 12px;border-radius:20px;font-size:11px;font-weight:600;background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);color:#818cf8">Pro</span>
            </div>
          </div>
          <div class="settings-row">
            <div>
              <div class="settings-label">API Sleutel</div>
              <div class="settings-label-sub">Gebruik dit voor directe API-toegang</div>
            </div>
            <div>
              <span class="settings-apikey" id="set-apikey-display">••••••••</span>
              <button class="btn-show-key" id="btn-toggle-apikey">Toon</button>
            </div>
          </div>
        </div>

        <!-- Support -->
        <div class="settings-section">
          <div class="settings-section-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            Support
          </div>
          <div class="settings-row">
            <div>
              <div class="settings-label">Hulp nodig?</div>
              <div class="settings-label-sub">Ons team helpt u graag verder</div>
            </div>
            <a href="mailto:sindi.s@usehelvaro.pro" class="btn-icon" style="text-decoration:none;border-color:rgba(99,102,241,0.35);color:var(--accent);background:rgba(99,102,241,0.08)">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              Mail sturen
            </a>
          </div>
          <div class="settings-row">
            <div>
              <div class="settings-label">E-mailadres support</div>
              <div class="settings-label-sub">Bereikbaar op werkdagen</div>
            </div>
            <div class="settings-value"><a href="mailto:sindi.s@usehelvaro.pro" style="color:var(--accent);text-decoration:none">sindi.s@usehelvaro.pro</a></div>
          </div>
        </div>

        <!-- Gevaar zone -->
        <div class="settings-section">
          <div class="settings-section-title" style="color:var(--red)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            Gevaar zone
          </div>
          <div class="settings-row settings-danger">
            <div>
              <div class="settings-label">Uitloggen</div>
              <div class="settings-label-sub">Beëindig uw huidige sessie</div>
            </div>
            <button class="btn-icon" onclick="logout()" style="border-color:rgba(244,63,94,0.35);color:var(--red);background:rgba(244,63,94,0.08)">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              Uitloggen
            </button>
          </div>
        </div>
      </div>
    </main>

    <!-- Activiteit Page -->
    <main class="page-content page" id="page-activiteit">
      <div class="activity-feed-wrap">
        <div class="activity-feed-header">Recente Activiteit</div>
        <div class="activity-feed" id="activity-feed">
          <div style="padding:20px 0;color:var(--text-muted);font-size:13px">Laden...</div>
        </div>
      </div>
    </main>

    <!-- Profile page -->
    <main class="page-content page" id="page-profile">
      <div class="profile-wrap">
        <!-- Hero card -->
        <div class="profile-hero">
          <div class="profile-avatar-lg" id="profile-avatar-lg">HV</div>
          <div>
            <div class="profile-name-lg" id="profile-name-lg">Gebruiker</div>
            <div class="profile-email-lg" id="profile-email-lg">—</div>
            <span class="profile-badge">Client Account</span>
          </div>
        </div>

        <!-- Stats row -->
        <div class="profile-stats-row" id="profile-stats-row"></div>

        <!-- Info cards -->
        <div class="profile-cards">
          <div class="profile-card">
            <div class="profile-card-title">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              Account
            </div>
            <div class="profile-row"><span>Naam</span><strong id="pf-naam">—</strong></div>
            <div class="profile-row"><span>E-mail</span><strong id="pf-email">—</strong></div>
            <div class="profile-row"><span>Type</span><strong>Client Account</strong></div>
          </div>

          <div class="profile-card">
            <div class="profile-card-title">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              Calendly
            </div>
            <div class="profile-row"><span>Status</span><span id="pf-cal-status" style="font-size:12px;font-weight:600;padding:2px 10px;border-radius:20px;background:rgba(107,114,128,0.15);color:#9ca3af;">Niet gekoppeld</span></div>
            <div class="profile-row"><span>Booking link</span>
              <a id="pf-calendly" href="#" target="_blank" style="color:#818cf8;font-size:13px;font-weight:600;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px;">—</a>
            </div>
            <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap;">
              <a id="pf-connect-btn" href="#" style="display:inline-flex;align-items:center;gap:6px;padding:9px 18px;background:linear-gradient(135deg,#4f46e5,#6366f1);border-radius:10px;color:#fff;font-size:13px;font-weight:700;text-decoration:none;box-shadow:0 4px 14px rgba(99,102,241,0.4);">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
                Koppel Calendly
              </a>
              <a id="pf-calendly-open" href="#" target="_blank" style="display:none;align-items:center;gap:6px;padding:9px 14px;background:var(--bg-card-alt);border:1px solid var(--border);border-radius:10px;color:var(--text-primary);font-size:13px;font-weight:600;text-decoration:none;">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                Openen
              </a>
            </div>
          </div>

          <div class="profile-card">
            <div class="profile-card-title">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              Activiteit
            </div>
            <div class="profile-row"><span>Totaal leads</span><strong id="pf-total">—</strong></div>
            <div class="profile-row"><span>Gekwalificeerd</span><strong id="pf-qual">—</strong></div>
            <div class="profile-row"><span>Afspraken</span><strong id="pf-booked">—</strong></div>
            <div class="profile-row"><span>Conversie</span><strong id="pf-conv">—</strong></div>
          </div>
        </div>

        <!-- Recent Leads on Profile -->
        <div class="profile-section-title">Recente Leads</div>
        <div class="profile-recent-leads" id="profile-recent-leads">
          <div style="color:var(--text-muted);font-size:13px">Laden...</div>
        </div>

        <!-- Quick Actions -->
        <div class="profile-section-title">Snelle Acties</div>
        <div class="profile-quick-actions">
          <button class="profile-action-btn" onclick="navigateTo('dashboard')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            Naar Dashboard
          </button>
          <button class="profile-action-btn" onclick="navigateTo('calendly')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Kalender Bekijken
          </button>
          <button class="profile-action-btn" onclick="navigateTo('gesprekken')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            Gesprekken
          </button>
          <button class="profile-action-btn" onclick="navigateTo('exports')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Data Exporteren
          </button>
        </div>
      </div>
    </main>

  </div>
</div>

<!-- Global Search Overlay -->
<div class="search-overlay" id="search-overlay">
  <div class="search-modal" id="search-modal">
    <div class="search-modal-bar">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
      <input class="search-modal-input" id="search-modal-input" type="text" placeholder="Zoek op naam, telefoon, bron of samenvatting..." autocomplete="off" spellcheck="false">
      <kbd class="search-kbd" id="search-esc-btn">Esc</kbd>
    </div>
    <div class="search-results" id="search-results">
      <div class="search-hint">
        <div class="search-hint-icon">🔍</div>
        <div class="search-hint-text">Begin met typen om leads te zoeken</div>
        <div class="search-hint-shortcuts">
          <span class="search-hint-shortcut"><kbd>↑↓</kbd> navigeren</span>
          <span class="search-hint-shortcut"><kbd>↵</kbd> openen</span>
          <span class="search-hint-shortcut"><kbd>Esc</kbd> sluiten</span>
        </div>
      </div>
    </div>
    <div class="search-footer" id="search-footer" style="display:none">
      <span class="search-footer-hint"><kbd>↑↓</kbd> navigeren</span>
      <span class="search-footer-hint"><kbd>↵</kbd> openen</span>
      <span class="search-footer-hint"><kbd>Esc</kbd> sluiten</span>
      <span class="search-footer-count" id="search-footer-count"></span>
    </div>
  </div>
</div>

<!-- Custom Calendly Booking Modal -->
<div id="cal-book-overlay" onclick="if(event.target===this)closeCalBookModal()">
  <div id="cal-book-modal">
    <div id="cal-book-header">
      <div class="cal-book-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
      </div>
      <div style="flex:1;min-width:0">
        <div id="cal-book-title">Afspraak inplannen</div>
        <div id="cal-book-subtitle"></div>
      </div>
      <button id="cal-book-close" onclick="closeCalBookModal()">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <!-- Body is rendered dynamically by JS -->
    <div id="cal-book-body"></div>
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

<!-- Calendar Event Modal -->
<div class="cal-modal-overlay" id="cal-event-modal" onclick="closeCalModal(event)">
  <div class="cal-modal" id="cal-modal-inner">
    <div class="cal-modal-header">
      <div class="cal-modal-header-title" id="cal-modal-title">Afspraak</div>
      <button class="cal-modal-close" onclick="closeCalModal()">&times;</button>
    </div>
    <div class="cal-modal-body" id="cal-modal-body"></div>
  </div>
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
  userEmail:   '',
  stats: null,
  knownLeadIds: null,
  newLeadCount: 0,
  adminLoaded: false,
  adminClients: [],
  adminApiKey: '',
  leadsChart: null,
  bronChart: null,
  analyseDaysChart: null,
  analyseScoreChart: null,
  analyseHoursChart: null,
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

const SESSION_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

function saveSession(apiKey, clientName, projectCode, email) {
  localStorage.setItem('hvk', apiKey);
  localStorage.setItem('hv-client', clientName || '');
  localStorage.setItem('hv-project', projectCode || '');
  localStorage.setItem('hv-exp', String(Date.now() + SESSION_TTL));
  if (email) localStorage.setItem('hv-email', email);
  state.apiKey     = apiKey;
  state.clientName = clientName || '';
  state.userEmail  = email || localStorage.getItem('hv-email') || '';
}

function clearSession() {
  ['hvk', 'hv-client', 'hv-project', 'hv-exp', 'hv-email'].forEach(k => localStorage.removeItem(k));
  state.apiKey     = '';
  state.clientName = '';
  state.userEmail  = '';
}

function tryAutoLogin() {
  const key = localStorage.getItem('hvk');
  const exp = parseInt(localStorage.getItem('hv-exp') || '0', 10);
  if (!key) return false;
  // Expire after 24 hours — clear stale session
  if (Date.now() > exp) { clearSession(); return false; }
  state.apiKey     = key;
  state.clientName = localStorage.getItem('hv-client') || '';
  state.userEmail  = localStorage.getItem('hv-email')  || '';
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

async function patchLead(id, fields) {
  const resp = await fetch(\`\${API_BASE}/leads?id=\${encodeURIComponent(id)}\`, {
    method: 'PATCH',
    headers: { 'x-api-key': state.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(fields)
  });
  if (!resp.ok) throw new Error(\`Opslaan mislukt: \${resp.status}\`);
  return resp.json();
}

function parseNotities(lead) {
  const raw = (lead.notities || '').trim();
  const empty = { notes: [], tasks: [], calls: [], afspraak: null };
  if (!raw || !raw.startsWith('{')) {
    return { ...empty, notes: raw ? [{ id: 'legacy', text: raw, ts: lead.datum || new Date().toISOString() }] : [] };
  }
  try {
    const d = JSON.parse(raw);
    return {
      notes:    Array.isArray(d.notes) ? d.notes : [],
      tasks:    Array.isArray(d.tasks) ? d.tasks : [],
      calls:    Array.isArray(d.calls) ? d.calls : [],
      afspraak: d.afspraak || null
    };
  } catch { return empty; }
}

function serializeNotities(data) {
  const obj = { _v: 1, notes: data.notes || [], tasks: data.tasks || [], calls: data.calls || [] };
  if (data.afspraak !== undefined) obj.afspraak = data.afspraak;
  return JSON.stringify(obj);
}

async function saveNotitiesData(leadId, data) {
  const json = serializeNotities(data);
  return patchLead(leadId, { notities: json });
}

function relativeTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'zojuist';
  if (mins < 60) return mins + 'm geleden';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'u geleden';
  return Math.floor(hrs / 24) + 'd geleden';
}

function taskDueLabel(due) {
  if (!due) return { label: '', cls: '' };
  const today = new Date().toISOString().slice(0, 10);
  if (due < today) return { label: 'Verlopen', cls: 'overdue' };
  if (due === today) return { label: 'Vandaag', cls: 'today' };
  const d = new Date(due);
  return { label: d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }), cls: '' };
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
// ── LocalStorage lead cache ────────────────────────────────────────────────
// Persists the last successful Airtable response so the dashboard stays
// populated across page reloads even when Airtable is temporarily rate-limited.
const LS_LEADS_KEY = 'hvk_leads_cache';
const LS_LEADS_TTL = 24 * 60 * 60 * 1000; // 24 hours
function saveLeadsToLS(leads, stats) {
  try { localStorage.setItem(LS_LEADS_KEY, JSON.stringify({ leads, stats, ts: Date.now() })); } catch {}
}
function loadLeadsFromLS() {
  try {
    const c = JSON.parse(localStorage.getItem(LS_LEADS_KEY) || '{}');
    if (c.leads && c.leads.length > 0 && Date.now() - (c.ts || 0) < LS_LEADS_TTL) return c;
  } catch {}
  return null;
}

async function refreshData(skipFetch = false) {
  const btn = document.getElementById('btn-refresh');
  if (btn) btn.classList.add('spin');

  try {
    if (!skipFetch) {
      const data = await fetchLeads();

      if (data.rateLimited || data.stale) {
        // Airtable is busy — keep whatever data we already have in state.
        // Fall back to localStorage if state is empty (e.g. first load after reload).
        if (!state.leads || state.leads.length === 0) {
          const lsCache = loadLeadsFromLS();
          if (lsCache) {
            state.leads = lsCache.leads;
            state.stats = lsCache.stats || {};
          }
        }
        const ts = document.getElementById('timestamp-info');
        if (ts) ts.textContent = data.stale ? 'Gecachte data (Airtable bezet)' : 'Tijdelijk bezet — vorige data weergegeven';
        // Still re-render with whatever we have (so UI shows cached data)
      } else {
        // Fresh successful response — update state and persist to localStorage
        state.leads    = data.leads || [];
        state.stats    = data.stats || {};
        state.clientName  = data.client?.naam    || 'Gebruiker';
        state.calendlyUrl = data.client?.calendly || '';
        state.lastFetch   = Date.now();
        if (state.leads.length > 0) saveLeadsToLS(state.leads, state.stats);
      }
    }
    // When skipFetch=true, state is already populated by init() — go straight to render

    updateUserInfo();
    renderStats();
    applyFilters();
    updateTimestamp();
    renderChart();
    renderBronChart();
    detectNewLeads(state.leads);
    if (state.currentPage === 'exports') updateExportPreview();

    // Top leads strip
    const topStrip = document.getElementById('top-leads-strip');
    const topList  = document.getElementById('top-leads-list');
    if (topStrip && topList && state.leads && state.leads.length > 0) {
      const top5 = [...state.leads]
        .filter(l => l.leadScore != null)
        .sort((a,b) => (b.leadScore || 0) - (a.leadScore || 0))
        .slice(0, 6);
      if (top5.length > 0) {
        topStrip.style.display = 'block';
        topList.innerHTML = top5.map(l => {
          const name = l.naam || 'Onbekend';
          const score = l.leadScore ?? '—';
          const initials = name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
          return \`<div class="top-lead-chip" onclick="(function(){var lead=state.leads.find(x=>String(x.id)==='\${escHtml(String(l.id))}');if(lead)openPanel(lead);})()">
            <div class="top-lead-chip-avatar">\${initials}</div>
            <span class="top-lead-chip-name">\${escHtml(name.split(' ')[0])}</span>
            <span class="top-lead-chip-score">\${score}</span>
          </div>\`;
        }).join('');
      }
    }
    // Follow-up queue
    const followupWidget = document.getElementById('followup-widget');
    const followupList   = document.getElementById('followup-list');
    const followupCount  = document.getElementById('followup-count');
    if (followupWidget && followupList) {
      const needsFollowup = (state.leads || [])
        .filter(l => l.qualified === true && !l.afspraakGeboekt)
        .sort((a,b) => (b.leadScore||0) - (a.leadScore||0))
        .slice(0, 5);
      if (needsFollowup.length > 0) {
        followupWidget.style.display = 'block';
        if (followupCount) followupCount.textContent = needsFollowup.length;
        followupList.innerHTML = needsFollowup.map(l => {
          const name = l.naam || 'Onbekend';
          const score = l.leadScore ?? '—';
          const bron  = l.bron || 'Onbekende bron';
          return \`<div class="followup-item" onclick="(function(){var lead=state.leads.find(x=>String(x.id)==='\${escHtml(String(l.id))}');if(lead)openPanel(lead);})()">
            <div style="flex:1;min-width:0">
              <div class="followup-item-name">\${escHtml(name)}</div>
              <div class="followup-item-meta">\${escHtml(bron)}</div>
            </div>
            <span class="followup-item-score">\${score}</span>
            <button class="followup-call-btn" onclick="event.stopPropagation();if(navigator.clipboard)navigator.clipboard.writeText('\${escHtml(l.telefoon||'')}').then(()=>toast('Nummer gekopieerd','success'))">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07"/><path d="M1 1l22 22"/></svg>
              Kopieer
            </button>
          </div>\`;
        }).join('');
      } else {
        followupWidget.style.display = 'none';
      }
    }

    // Niet bereikbaar widget
    renderNietBereikbaar();

    // Taken widget
    renderTakenWidget();

    // Revenue goal card
    renderRevenueGoal();

    // Bell: count leads from last 24h as "new"
    const bell = document.getElementById('notif-badge');
    if (bell) {
      const fresh = (state.leads||[]).filter(l => l.datum && new Date(l.datum) > new Date(Date.now()-86400000)).length;
      if (fresh > 0) { bell.style.display='flex'; bell.textContent=fresh>9?'9+':fresh; bell.dataset.count=fresh; }
      else { bell.style.display='none'; }
    }
  } catch (err) {
    const ts = document.getElementById('timestamp-info');
    if (ts) ts.textContent = 'Verbinding mislukt — opnieuw proberen over 90s';
    console.warn('refreshData error:', err.message);
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
// Poll for new leads every 5 minutes with random startup jitter (30–90s) so
// multiple dashboard sessions never fire simultaneously and stay well below
// Airtable's 5 req/s base-level rate limit.
const POLL_INTERVAL = 10 * 60 * 1000; // 10 minutes — halved Airtable polling load
const pollJitter    = Math.random() * 60000 + 30000; // 30–90s startup offset
setTimeout(() => {
  if (state.apiKey) refreshData();
  setInterval(() => { if (state.apiKey) refreshData(); }, POLL_INTERVAL);
}, pollJitter);

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

  // Update notification bell
  const badge = document.getElementById('notif-badge');
  if (badge) {
    const unread = parseInt(badge.dataset.count || '0') + fresh.length;
    if (unread > 0) {
      badge.style.display = 'flex';
      badge.textContent = unread > 9 ? '9+' : unread;
      badge.dataset.count = unread;
    }
  }
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
   BRON DONUT CHART
   ============================================================ */
function renderBronChart() {
  const wrap   = document.getElementById('bron-chart-wrap');
  const canvas = document.getElementById('bron-chart');
  if (!wrap || !canvas || typeof Chart === 'undefined') return;

  // Count leads by bron
  const counts = {};
  state.leads.forEach(l => {
    if (l.bron) counts[l.bron] = (counts[l.bron] || 0) + 1;
  });
  const labels = Object.keys(counts);
  if (labels.length === 0) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';

  const palette = ['#6366f1','#06b6d4','#8b5cf6','#22c55e','#f59e0b','#8b949e'];
  const data    = labels.map(k => counts[k]);
  const colors  = labels.map((_, i) => palette[i % palette.length]);

  const isLight = document.documentElement.getAttribute('data-theme') === 'light';

  if (state.bronChart) state.bronChart.destroy();
  state.bronChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors, borderWidth: 0, hoverOffset: 4 }]
    },
    options: {
      responsive: true,
      cutout: '65%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: isLight ? '#5c6478' : '#8b949e',
            font: { size: 11 },
            boxWidth: 10,
            padding: 8
          }
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
    const countEl = document.getElementById('admin-client-count');
    if (countEl) countEl.textContent = clients.length + ' klant' + (clients.length !== 1 ? 'en' : '');
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
    grid.innerHTML = \`<div style="color:var(--red);font-size:14px">\${escHtml(err.message)}</div>\`;
  }
}

function openNewClientModal() {
  document.getElementById('nc-name').value     = '';
  document.getElementById('nc-code').value     = '';
  document.getElementById('nc-email').value    = '';
  document.getElementById('nc-calendly').value = '';
  document.getElementById('nc-error').style.display   = 'none';
  document.getElementById('nc-success').style.display = 'none';
  document.getElementById('nc-submit').disabled = false;
  document.getElementById('nc-submit').textContent = 'Aanmaken';
  const modal = document.getElementById('new-client-modal');
  modal.style.display = 'flex';
  setTimeout(() => document.getElementById('nc-name').focus(), 50);
}

function closeNewClientModal() {
  document.getElementById('new-client-modal').style.display = 'none';
}

// Auto-fill project code from client name
document.addEventListener('DOMContentLoaded', () => {
  const nameEl = document.getElementById('nc-name');
  const codeEl = document.getElementById('nc-code');
  if (nameEl && codeEl) {
    nameEl.addEventListener('input', () => {
      if (!codeEl._edited) {
        codeEl.value = nameEl.value.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30);
      }
    });
    codeEl.addEventListener('input', () => { codeEl._edited = true; });
  }
  document.getElementById('new-client-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('new-client-modal')) closeNewClientModal();
  });
});

async function submitNewClient() {
  const btn     = document.getElementById('nc-submit');
  const errEl   = document.getElementById('nc-error');
  const succEl  = document.getElementById('nc-success');
  const name     = document.getElementById('nc-name').value.trim();
  const code     = document.getElementById('nc-code').value.trim().toUpperCase();
  const email    = document.getElementById('nc-email').value.trim();
  const calendly = document.getElementById('nc-calendly').value.trim();

  errEl.style.display = 'none';
  if (!name || !code) { errEl.textContent = 'Naam en projectcode zijn verplicht.'; errEl.style.display = 'block'; return; }

  btn.disabled = true;
  btn.textContent = 'Aanmaken...';
  try {
    const resp = await fetch('/api/admin', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': state.apiKey },
      body:    JSON.stringify({ clientName: name, projectCode: code, email, calendlyLink: calendly })
    });
    const data = await resp.json();
    if (!resp.ok) { errEl.textContent = data.error || 'Aanmaken mislukt.'; errEl.style.display = 'block'; btn.disabled = false; btn.textContent = 'Aanmaken'; return; }

    document.getElementById('nc-result-key').textContent = data.apiKey;
    const urlEl = document.getElementById('nc-result-url');
    urlEl.textContent = data.formUrl;
    urlEl.href = data.formUrl;
    succEl.style.display = 'block';
    btn.textContent = 'Sluiten';
    btn.disabled = false;
    btn.onclick = () => { closeNewClientModal(); state.adminLoaded = false; loadAdminClients(); };
  } catch {
    errEl.textContent = 'Netwerkfout. Probeer opnieuw.';
    errEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Aanmaken';
  }
}

function switchToClient(index) {
  const client = state.adminClients && state.adminClients[index];
  if (!client || !client.apiKey) return;
  state.adminApiKey = state.adminApiKey || state.apiKey; // save admin token before overwriting
  state.apiKey = client.apiKey;
  state.knownLeadIds = null;
  state.adminLoaded = false;
  const backBtn = document.getElementById('btn-back-admin');
  if (backBtn) { backBtn.style.display = 'flex'; }
  navigateTo('dashboard');
  refreshData();
}

function backToAdmin() {
  if (state.adminApiKey) state.apiKey = state.adminApiKey; // restore admin token
  state.adminLoaded = false;
  navigateTo('admin');
  const backBtn = document.getElementById('btn-back-admin');
  if (backBtn) backBtn.style.display = 'none';
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

  // Trend: compare this week vs last week
  const now = Date.now();
  const weekMs = 7 * 86400000;
  const thisWeekLeads = (state.leads || []).filter(l => l.datum && new Date(l.datum) > new Date(now - weekMs));
  const lastWeekLeads = (state.leads || []).filter(l => l.datum && new Date(l.datum) > new Date(now - 2*weekMs) && new Date(l.datum) <= new Date(now - weekMs));
  const thisWeekQual  = thisWeekLeads.filter(l => l.qualified).length;
  const lastWeekQual  = lastWeekLeads.filter(l => l.qualified).length;
  const thisWeekBooked = thisWeekLeads.filter(l => l.afspraakGeboekt).length;
  const lastWeekBooked = lastWeekLeads.filter(l => l.afspraakGeboekt).length;
  const trendDiff = (a, b) => {
    const d = a - b;
    if (d === 0) return '<span style="color:var(--text-muted);font-size:11px">— zelfde</span>';
    const arrow = d > 0 ? '↑' : '↓';
    const col = d > 0 ? 'var(--green)' : 'var(--red)';
    return \`<span style="color:\${col};font-size:11px;font-weight:700">\${arrow} \${Math.abs(d)} vs vorige week</span>\`;
  };

  const cards = [
    {
      label: 'Totaal Leads',
      value: s.total || 0,
      suffix: '',
      desc: 'Alle ontvangen leads',
      color: '',
      fill: 100,
      trend: trendDiff(thisWeekLeads.length, lastWeekLeads.length)
    },
    {
      label: 'Gekwalificeerd',
      value: s.qualified || 0,
      suffix: '',
      desc: 'Door AI gekwalificeerd',
      color: 'cyan',
      fill: total ? Math.round((s.qualified / total) * 100) : 0,
      trend: trendDiff(thisWeekQual, lastWeekQual)
    },
    {
      label: 'Afspraken',
      value: s.booked || 0,
      suffix: '',
      desc: 'Geboekte afspraken',
      color: 'green',
      fill: total ? Math.round((s.booked / total) * 100) : 0,
      trend: trendDiff(thisWeekBooked, lastWeekBooked)
    },
    {
      label: 'Conversie',
      value: s.conversionRate || 0,
      suffix: '%',
      desc: 'Van lead naar afspraak',
      color: 'orange',
      fill: s.conversionRate || 0,
      trend: ''
    },
    {
      label: 'Deze Maand',
      value: s.thisMonth || 0,
      suffix: '',
      desc: 'Nieuwe leads deze maand',
      color: 'blue',
      fill: total ? Math.round(((s.thisMonth || 0) / total) * 100) : 0,
      trend: ''
    },
    {
      label: 'Gem. Reactie',
      value: s.avgResponseTime || 0,
      suffix: 'u',
      desc: 'Gemiddelde reactietijd',
      color: '',
      fill: 60,
      trend: ''
    }
  ];

  grid.innerHTML = cards.map(c => \`
    <div class="stat-card">
      <div class="stat-label">\${c.label}</div>
      <div class="stat-value \${c.color}" data-target="\${c.value}" data-suffix="\${c.suffix}">0\${c.suffix ? \`<span class="stat-unit">\${c.suffix}</span>\` : ''}</div>
      <div class="stat-desc">\${c.desc}</div>
      <div class="stat-trend">\${c.trend || ''}</div>
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
  renderCalSidebar();
  if (state.currentPage === 'calendly') renderAppointments();
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

function scoreBar(score) {
  if (score == null || score === '') return '<span style="color:var(--text-muted)">—</span>';
  const n = parseInt(score) || 0;
  const color = n >= 8 ? '#10b981' : n >= 5 ? '#f59e0b' : '#f43f5e';
  const pct = Math.round(n / 10 * 100);
  return \`<div style="display:flex;align-items:center;gap:6px">
    <div style="width:40px;height:5px;background:var(--bg-card-alt);border-radius:3px;overflow:hidden">
      <div style="width:\${pct}%;height:100%;background:\${color};border-radius:3px"></div>
    </div>
    <span style="font-size:12px;font-weight:700;color:\${color};font-family:'Orbitron',monospace">\${n}</span>
  </div>\`;
}

function renderTable() {
  const tbody = document.getElementById('leads-tbody');
  if (!tbody) return;

  if (state.leads.length === 0) {
    tbody.innerHTML = \`<tr><td colspan="11" style="padding:60px 20px;text-align:center">
      <div style="max-width:400px;margin:0 auto">
        <div style="font-size:48px;margin-bottom:16px">🚀</div>
        <div style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:8px">Welkom bij Helvaro!</div>
        <div style="font-size:14px;color:var(--text-muted);line-height:1.7;margin-bottom:24px">Uw AI-assistent staat klaar om leads te kwalificeren. Zodra de eerste gesprekken binnenkomen, verschijnen ze hier automatisch.</div>
        <div style="display:flex;flex-direction:column;gap:12px;text-align:left;background:var(--bg-card-alt);border:1px solid var(--border);border-radius:12px;padding:20px">
          <div style="display:flex;gap:10px;align-items:flex-start"><span style="color:var(--green);font-weight:700;flex-shrink:0">1.</span><span style="font-size:13px;color:var(--text-muted)">Deel uw WhatsApp-nummer of website link met potentiële klanten</span></div>
          <div style="display:flex;gap:10px;align-items:flex-start"><span style="color:var(--green);font-weight:700;flex-shrink:0">2.</span><span style="font-size:13px;color:var(--text-muted)">Helvaro AI voert het gesprek en kwalificeert automatisch</span></div>
          <div style="display:flex;gap:10px;align-items:flex-start"><span style="color:var(--green);font-weight:700;flex-shrink:0">3.</span><span style="font-size:13px;color:var(--text-muted)">Gekwalificeerde leads verschijnen hier met score en samenvatting</span></div>
        </div>
        <div style="margin-top:20px;font-size:12px;color:var(--text-muted)">Hulp nodig? Mail ons via <a href="mailto:sindi.s@usehelvaro.pro" style="color:var(--accent)">sindi.s@usehelvaro.pro</a></div>
      </div>
    </td></tr>\`;
    return;
  }

  if (state.filteredLeads.length === 0) {
    const hasFilters = getActiveFilterCount() > 0;
    tbody.innerHTML = \`
      <tr>
        <td colspan="11">
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
    // Age badge for table
    const ageDays = leadAgeDays(lead);
    const ageClass = leadAgeClass(ageDays);
    const ageBadge = ageClass === 'fresh' ? '' :
      ageClass === 'warm' ? \`<span class="age-badge-table age-badge-warm">\${ageDays}d</span>\` :
      ageClass === 'cooling' ? \`<span class="age-badge-table age-badge-cooling">\${ageDays}d</span>\` :
      \`<span class="age-badge-table age-badge-cold">🔥 \${ageDays}d</span>\`;
    // Quick action buttons
    const rawPhone = (lead.telefoon || '').replace(/\\D/g, '');
    const waPhone = rawPhone.startsWith('0') ? '31' + rawPhone.slice(1) : rawPhone;
    const waLink = waPhone ? 'https://wa.me/' + waPhone : '#';
    const telLink = lead.telefoon ? 'tel:' + escHtml(lead.telefoon) : '#';
    return \`
      <tr data-id="\${lead.id}" \${delay}>
        <td class="td-naam">\${escHtml(lead.naam) || '—'}\${ageBadge}</td>
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
        <td>\${scoreBar(lead.leadScore)}</td>
        <td>\${lead.opgepikt ? '<span style="color:var(--green)">✓</span>' : '<span style="color:var(--text-muted)">—</span>'}</td>
        <td style="white-space:nowrap;font-size:12px;color:var(--text-secondary)">\${formatDate(lead.datum)}</td>
        <td class="td-arrow">›</td>
        <td onclick="event.stopPropagation()">
          <div class="row-actions">
            <a class="row-action-btn" href="\${telLink}" title="Bellen">📞</a>
            <a class="row-action-btn" href="\${waLink}" target="_blank" rel="noopener" title="WhatsApp">💬</a>
          </div>
        </td>
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
  const panelAgeDays = leadAgeDays(lead);
  const panelAgeClass = leadAgeClass(panelAgeDays);
  bronBadge.innerHTML = (lead.bron ? \`<span class="badge badge-bron">\${escHtml(lead.bron)}</span>\` : '') +
    \`<span class="age-chip age-\${panelAgeClass}">\${panelAgeDays}d oud</span>\`;

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
            <option value="verloren"    \${lead.status === 'verloren'    ? 'selected' : ''}>Verloren</option>
          </select>
        </span>
      </div>
      <div class="panel-row" id="verloren-reden-row" style="display:\${lead.status === 'verloren' ? 'flex' : 'none'}">
        <span class="panel-row-label">Verlies reden</span>
        <span class="panel-row-value">
          <select class="status-select" id="panel-verlies-reden">
            <option value="">— Kies reden —</option>
            <option value="Prijs te hoog"       \${lead.reden === 'Prijs te hoog'       ? 'selected' : ''}>Prijs te hoog</option>
            <option value="Geen timing"          \${lead.reden === 'Geen timing'          ? 'selected' : ''}>Geen timing</option>
            <option value="Concurrent gekozen"   \${lead.reden === 'Concurrent gekozen'   ? 'selected' : ''}>Concurrent gekozen</option>
            <option value="Geen interesse"       \${lead.reden === 'Geen interesse'       ? 'selected' : ''}>Geen interesse</option>
            <option value="Geen reactie"         \${lead.reden === 'Geen reactie'         ? 'selected' : ''}>Geen reactie</option>
            <option value="Andere reden"         \${lead.reden === 'Andere reden'         ? 'selected' : ''}>Andere reden</option>
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
      <div class="panel-row">
        <span class="panel-row-label">Deal waarde (€)</span>
        <span class="panel-row-value" style="flex:1;max-width:160px">
          <input type="text" class="panel-inline-input" id="panel-deal-input" placeholder="€0" value="\${escHtml(lead.verwachteWaarde || '')}">
        </span>
      </div>
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

  // Snelle Acties section (Feature 3)
  (function() {
    const naam = encodeURIComponent(lead.naam || '');
    const naamRaw = lead.naam || '';
    const rawPhone = (lead.telefoon || '').replace(/\\D/g, '');
    const waPhone = rawPhone.startsWith('0') ? '31' + rawPhone.slice(1) : rawPhone;
    const waLink = waPhone
      ? 'https://wa.me/' + waPhone + '?text=Hallo%20' + naam + '%2C%20bedankt%20voor%20uw%20interesse.'
      : '#';
    const opvolgingBody = encodeURIComponent('Hallo ' + naamRaw + ', bedankt voor uw interesse. Ik wilde even opvolgen over ons gesprek. Wanneer schikt het u voor een korte call?');
    const offerteBody = encodeURIComponent('Hallo ' + naamRaw + ', zoals besproken stuur ik u hierbij meer informatie over onze diensten. Heeft u nog vragen?');
    const mailtoOpvolging = 'mailto:?subject=Opvolging%20' + naam + '&body=' + opvolgingBody;
    const mailtoOfferte = 'mailto:?subject=Offerte%20' + naam + '&body=' + offerteBody;
    const telLink = lead.telefoon ? 'tel:' + escHtml(lead.telefoon) : '#';
    bodyHTML += \`
      <div class="panel-section">
        <div class="panel-section-title">Snelle Acties</div>
        <div class="panel-quick-actions">
          <a class="panel-quick-btn" href="\${telLink}">📞 Bellen</a>
          <a class="panel-quick-btn" href="\${waLink}" target="_blank" rel="noopener">💬 WhatsApp</a>
          <a class="panel-quick-btn email-btn" href="\${mailtoOpvolging}">✉️ Opvolging</a>
          <a class="panel-quick-btn email-btn" href="\${mailtoOfferte}">📄 Offerte</a>
        </div>
      </div>
    \`;
  })();

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

  // Notes section (timestamped)
  const nData = parseNotities(lead);
  function renderNotesList(notes) {
    if (!notes.length) return '<div style="color:var(--text-muted);font-size:12px;padding:4px 0">Nog geen notities</div>';
    return notes.map(n => \`<div class="panel-note-item">
      <div class="panel-note-text">\${escHtml(n.text)}</div>
      <div class="panel-note-ts">\${relativeTime(n.ts)}</div>
      <button class="panel-note-delete" data-note-id="\${escHtml(n.id)}">✕</button>
    </div>\`).join('');
  }
  function renderTasksList(tasks) {
    if (!tasks.length) return '<div style="color:var(--text-muted);font-size:12px;padding:4px 0">Geen taken</div>';
    return tasks.map(t => {
      const dl = taskDueLabel(t.due);
      return \`<div class="panel-task-item\${t.done ? ' done' : ''}" data-task-id="\${escHtml(t.id)}">
        <input type="checkbox" class="panel-task-check" \${t.done ? 'checked' : ''}>
        <span class="panel-task-text">\${escHtml(t.text)}</span>
        \${dl.label ? \`<span class="panel-task-due \${dl.cls}">\${dl.label}</span>\` : ''}
        <button class="panel-task-delete" data-task-id="\${escHtml(t.id)}">✕</button>
      </div>\`;
    }).join('');
  }
  function renderCallsList(calls) {
    if (!calls.length) return '<div style="color:var(--text-muted);font-size:12px;padding:4px 0">Geen gesprekken gelogd</div>';
    return calls.map(c => \`<div class="panel-call-item">
      <div class="panel-call-icon">📞</div>
      <div class="panel-call-body">
        <div class="panel-call-meta">\${c.duur} min &bull; \${relativeTime(c.ts)}</div>
        \${c.notitie ? \`<div class="panel-call-note">\${escHtml(c.notitie)}</div>\` : ''}
      </div>
    </div>\`).join('');
  }

  // Afspraak Resultaat — only show when appointment is booked
  if (lead.afspraakGeboekt) {
    const af = nData.afspraak || {};
    const isYes = af.verschenen === true;
    const isNo  = af.verschenen === false;
    bodyHTML += \`
    <div class="panel-section" id="afspraak-result-section">
      <div class="panel-section-title">Afspraak Resultaat</div>
      <div class="afspraak-result">
        <div>
          <div class="afspraak-toggle-label">Verschenen?</div>
          <div class="afspraak-toggle-row" style="margin-top:6px">
            <button class="afspraak-btn\${isYes ? ' active-yes' : ''}" id="btn-afspraak-ja">✓ Ja, verschenen</button>
            <button class="afspraak-btn\${isNo  ? ' active-no'  : ''}" id="btn-afspraak-nee">✗ No-show</button>
          </div>
        </div>
        <div class="afspraak-value-row">
          <div class="afspraak-value-label">Gesloten waarde</div>
          <input type="text" class="panel-inline-input" id="afspraak-waarde" placeholder="€0" value="\${escHtml(af.gesloten || '')}">
        </div>
        <div>
          <div class="afspraak-value-label" style="margin-bottom:4px">Resultaat notitie</div>
          <textarea class="afspraak-notitie" id="afspraak-notitie" placeholder="Hoe ging het gesprek?">\${escHtml(af.notitie || '')}</textarea>
        </div>
        <button class="btn-add-note" id="btn-save-afspraak">Opslaan</button>
      </div>
    </div>\`;
  }

  bodyHTML += \`
    <div class="panel-section">
      <div class="panel-section-title">Notities</div>
      <div class="panel-notes-list" id="panel-notes-list">\${renderNotesList(nData.notes)}</div>
      <div class="panel-add-note">
        <textarea id="panel-note-input" placeholder="Notitie toevoegen..." rows="2"></textarea>
        <button class="btn-add-note" id="btn-add-note">+ Toevoegen</button>
      </div>
    </div>
    <div class="panel-section">
      <div class="panel-section-title">Taken</div>
      <div class="panel-tasks-list" id="panel-tasks-list">\${renderTasksList(nData.tasks)}</div>
      <div class="panel-add-task">
        <input type="text" id="panel-task-input" placeholder="Nieuwe taak...">
        <input type="date" id="panel-task-date">
        <button class="btn-add-task" id="btn-add-task">+</button>
      </div>
    </div>
    <div class="panel-section">
      <div class="panel-section-title">Belgeschiedenis</div>
      <div class="panel-calls-list" id="panel-calls-list">\${renderCallsList(nData.calls)}</div>
      <div class="panel-log-call">
        <input type="number" id="panel-call-duur" placeholder="Min." min="1">
        <input type="text" id="panel-call-note" placeholder="Aantekeningen...">
        <button class="btn-log-call" id="btn-log-call">📞 Loggen</button>
      </div>
    </div>
  \`;

  document.getElementById('panel-body').innerHTML = bodyHTML;

  // Helper to persist and re-render notities
  async function persistNotities(data) {
    const json = serializeNotities(data);
    const idx = state.leads.findIndex(l => l.id === lead.id);
    if (idx !== -1) state.leads[idx].notities = json;
    state.activeLead.notities = json;
    await saveNotitiesData(lead.id, data);
    renderTakenWidget();
  }

  // Status change handler
  const statusSelect = document.getElementById('panel-status-select');
  if (statusSelect) {
    statusSelect.addEventListener('change', async () => {
      const newStatus = statusSelect.value;
      const redenRow = document.getElementById('verloren-reden-row');
      if (redenRow) redenRow.style.display = newStatus === 'verloren' ? 'flex' : 'none';
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

  // Afspraak Resultaat handlers
  if (lead.afspraakGeboekt) {
    async function saveAfspraak() {
      const data = parseNotities(state.activeLead);
      data.afspraak = data.afspraak || {};
      const waarde = (document.getElementById('afspraak-waarde')?.value || '').trim();
      const notitie = (document.getElementById('afspraak-notitie')?.value || '').trim();
      if (waarde) data.afspraak.gesloten = waarde;
      if (notitie) data.afspraak.notitie = notitie;
      await persistNotities(data);
      // Also update verwachteWaarde if closed value entered
      if (waarde) {
        await patchLead(lead.id, { dealWaarde: waarde });
        const idx = state.leads.findIndex(l => l.id === lead.id);
        if (idx !== -1) state.leads[idx].verwachteWaarde = waarde;
        state.activeLead.verwachteWaarde = waarde;
      }
      toast('Afspraak resultaat opgeslagen', 'success');
    }

    function setVerschenen(val) {
      const data = parseNotities(state.activeLead);
      data.afspraak = { ...(data.afspraak || {}), verschenen: val };
      persistNotities(data).then(() => toast(val ? '✓ Verschenen opgeslagen' : '✗ No-show opgeslagen', 'success'));
      // Update button styles immediately
      const jaBtn  = document.getElementById('btn-afspraak-ja');
      const neeBtn = document.getElementById('btn-afspraak-nee');
      if (jaBtn)  { jaBtn.classList.toggle('active-yes', val === true);  jaBtn.classList.remove('active-no'); }
      if (neeBtn) { neeBtn.classList.toggle('active-no', val === false); neeBtn.classList.remove('active-yes'); }
    }

    const jaBtn  = document.getElementById('btn-afspraak-ja');
    const neeBtn = document.getElementById('btn-afspraak-nee');
    const saveBtn = document.getElementById('btn-save-afspraak');
    if (jaBtn)   jaBtn.addEventListener('click', () => setVerschenen(true));
    if (neeBtn)  neeBtn.addEventListener('click', () => setVerschenen(false));
    if (saveBtn) saveBtn.addEventListener('click', saveAfspraak);
  }

  // Verlies reden handler
  const verliesRedenSelect = document.getElementById('panel-verlies-reden');
  if (verliesRedenSelect) {
    verliesRedenSelect.addEventListener('change', async () => {
      const reden = verliesRedenSelect.value;
      try {
        await patchLead(lead.id, { verliesReden: reden });
        const idx = state.leads.findIndex(l => l.id === lead.id);
        if (idx !== -1) state.leads[idx].reden = reden;
        state.activeLead.reden = reden;
        toast('Verliesreden opgeslagen', 'success');
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  // Deal waarde handler
  const dealInput = document.getElementById('panel-deal-input');
  if (dealInput) {
    dealInput.addEventListener('blur', async () => {
      const val = dealInput.value.trim();
      try {
        await patchLead(lead.id, { dealWaarde: val });
        const idx = state.leads.findIndex(l => l.id === lead.id);
        if (idx !== -1) state.leads[idx].verwachteWaarde = val;
        state.activeLead.verwachteWaarde = val;
        toast('Deal waarde opgeslagen', 'success');
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  // Notes: add note
  const btnAddNote = document.getElementById('btn-add-note');
  if (btnAddNote) {
    btnAddNote.addEventListener('click', async () => {
      const inp = document.getElementById('panel-note-input');
      const text = inp ? inp.value.trim() : '';
      if (!text) return;
      const data = parseNotities(state.activeLead);
      const note = { id: 'n_' + Date.now(), text, ts: new Date().toISOString() };
      data.notes = [note, ...data.notes];
      try {
        await persistNotities(data);
        if (inp) inp.value = '';
        const list = document.getElementById('panel-notes-list');
        if (list) list.innerHTML = renderNotesList(data.notes);
        toast('Notitie toegevoegd', 'success');
      } catch (err) { toast(err.message, 'error'); }
    });
  }

  // Notes: delete note (event delegation)
  const notesList = document.getElementById('panel-notes-list');
  if (notesList) {
    notesList.addEventListener('click', async e => {
      const btn = e.target.closest('.panel-note-delete');
      if (!btn) return;
      const nid = btn.dataset.noteId;
      const data = parseNotities(state.activeLead);
      data.notes = data.notes.filter(n => n.id !== nid);
      try {
        await persistNotities(data);
        notesList.innerHTML = renderNotesList(data.notes);
      } catch (err) { toast(err.message, 'error'); }
    });
  }

  // Tasks: add task
  const btnAddTask = document.getElementById('btn-add-task');
  if (btnAddTask) {
    btnAddTask.addEventListener('click', async () => {
      const inp = document.getElementById('panel-task-input');
      const dateInp = document.getElementById('panel-task-date');
      const text = inp ? inp.value.trim() : '';
      if (!text) return;
      const data = parseNotities(state.activeLead);
      const task = { id: 't_' + Date.now(), text, due: dateInp ? dateInp.value : '', done: false, ts: new Date().toISOString() };
      data.tasks = [task, ...data.tasks];
      try {
        await persistNotities(data);
        if (inp) inp.value = '';
        if (dateInp) dateInp.value = '';
        const list = document.getElementById('panel-tasks-list');
        if (list) list.innerHTML = renderTasksList(data.tasks);
        toast('Taak toegevoegd', 'success');
      } catch (err) { toast(err.message, 'error'); }
    });
  }

  // Tasks: toggle done + delete (event delegation)
  const tasksList = document.getElementById('panel-tasks-list');
  if (tasksList) {
    tasksList.addEventListener('change', async e => {
      const cb = e.target.closest('.panel-task-check');
      if (!cb) return;
      const item = cb.closest('.panel-task-item');
      const tid = item ? item.dataset.taskId : null;
      if (!tid) return;
      const data = parseNotities(state.activeLead);
      const task = data.tasks.find(t => t.id === tid);
      if (task) task.done = cb.checked;
      try {
        await persistNotities(data);
        tasksList.innerHTML = renderTasksList(data.tasks);
      } catch (err) { toast(err.message, 'error'); }
    });
    tasksList.addEventListener('click', async e => {
      const btn = e.target.closest('.panel-task-delete');
      if (!btn) return;
      const tid = btn.dataset.taskId;
      const data = parseNotities(state.activeLead);
      data.tasks = data.tasks.filter(t => t.id !== tid);
      try {
        await persistNotities(data);
        tasksList.innerHTML = renderTasksList(data.tasks);
      } catch (err) { toast(err.message, 'error'); }
    });
  }

  // Calls: log call
  const btnLogCall = document.getElementById('btn-log-call');
  if (btnLogCall) {
    btnLogCall.addEventListener('click', async () => {
      const duurInp = document.getElementById('panel-call-duur');
      const noteInp = document.getElementById('panel-call-note');
      const duur = duurInp ? parseInt(duurInp.value) || 0 : 0;
      const notitie = noteInp ? noteInp.value.trim() : '';
      const data = parseNotities(state.activeLead);
      const call = { id: 'c_' + Date.now(), duur, notitie, ts: new Date().toISOString() };
      data.calls = [call, ...data.calls];
      try {
        await persistNotities(data);
        if (duurInp) duurInp.value = '';
        if (noteInp) noteInp.value = '';
        const list = document.getElementById('panel-calls-list');
        if (list) list.innerHTML = renderCallsList(data.calls);
        toast('Gesprek gelogd', 'success');
      } catch (err) { toast(err.message, 'error'); }
    });
  }

  // Show panel
  document.getElementById('panel-backdrop').classList.add('visible');
  document.getElementById('detail-panel').classList.add('visible');
}

function closePanel() {
  document.getElementById('panel-backdrop').classList.remove('visible');
  document.getElementById('detail-panel').classList.remove('visible');
  state.activeLead = null;
}

/* ============================================================
   NIET BEREIKBAAR WIDGET
   ============================================================ */
function renderNietBereikbaar() {
  const widget  = document.getElementById('nb-widget');
  const listEl  = document.getElementById('nb-list');
  const countEl = document.getElementById('nb-count');
  if (!widget || !listEl) return;

  const failed = (state.leads || []).filter(lead => {
    const data = parseNotities(lead);
    return data.waFailed === true;
  });

  if (failed.length === 0) {
    widget.style.display = 'none';
    return;
  }

  widget.style.display = '';
  if (countEl) countEl.textContent = failed.length;

  listEl.innerHTML = failed.map(lead => {
    const f    = lead.fields || {};
    const name = f['fldbk0LVNckOU0bqA'] || f['Name']  || '(onbekend)';
    const rawPhone = f['fld6YaitW0lMqHUrd'] || f['Phone'] || '';
    // Convert stored international digits-only number back to callable format
    const telHref  = rawPhone ? 'tel:+' + rawPhone : '#';
    const dateRaw  = f['fldR0r13EU4RwrtvH'] || '';
    const dateStr  = dateRaw ? new Date(dateRaw).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' }) : '';
    return \`<div class="nb-item">
      <div class="nb-item-info">
        <span class="nb-item-name">\${escHtml(name)}</span>
        \${dateStr ? \`<span class="nb-item-sub">\${dateStr}</span>\` : ''}
      </div>
      <a class="nb-call-btn" href="\${telHref}">📞 Bellen</a>
    </div>\`;
  }).join('');
}

/* ============================================================
   TAKEN WIDGET
   ============================================================ */
function renderTakenWidget() {
  const widget = document.getElementById('taken-widget');
  const listEl = document.getElementById('taken-widget-list');
  const countEl = document.getElementById('taken-widget-count');
  if (!widget || !listEl) return;

  const today = new Date().toISOString().slice(0, 10);
  const items = [];
  (state.leads || []).forEach(lead => {
    const data = parseNotities(lead);
    (data.tasks || []).forEach(t => {
      if (t.done) return;
      if (!t.due || t.due > today) {
        // include today and overdue only
        if (t.due !== today && t.due > today) return;
      }
      items.push({ lead, task: t });
    });
  });

  // Sort: overdue first, then today
  items.sort((a, b) => {
    if (a.task.due < b.task.due) return -1;
    if (a.task.due > b.task.due) return 1;
    return 0;
  });

  if (items.length === 0) {
    widget.style.display = 'none';
    return;
  }

  widget.style.display = 'block';
  if (countEl) countEl.textContent = items.length;

  listEl.innerHTML = items.map(({ lead, task }) => {
    const isOverdue = task.due < today;
    const dueLbl = isOverdue ? 'Verlopen' : 'Vandaag';
    return \`<div class="taken-item\${isOverdue ? ' overdue' : ''}" onclick="(function(){navigateTo('dashboard');setTimeout(function(){var l=state.leads.find(function(x){return String(x.id)==='\${escHtml(String(lead.id))}';});if(l)openPanel(l);},120);})()">
      <div class="taken-item-dot"></div>
      <div class="taken-item-body">
        <div class="taken-item-text">\${escHtml(task.text)}</div>
        <div class="taken-item-lead">\${escHtml(lead.naam || '—')}</div>
      </div>
      <div class="taken-item-due">\${dueLbl}</div>
    </div>\`;
  }).join('');
}

document.getElementById('panel-close').addEventListener('click', closePanel);
document.getElementById('panel-backdrop').addEventListener('click', closePanel);

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const bookOverlay = document.getElementById('cal-book-overlay');
    if (bookOverlay && bookOverlay.classList.contains('open')) { closeCalBookModal(); return; }
    closePanel();
  }
});

/* ============================================================
   NAVIGATION
   ============================================================ */

/* ── Calendar event modal ── */
function openCalEvent(idx) {
  const ev = calState.lastEvents && calState.lastEvents[idx];
  if (!ev) return;
  const overlay = document.getElementById('cal-event-modal');
  const body    = document.getElementById('cal-modal-body');
  const title   = document.getElementById('cal-modal-title');
  if (!overlay || !body) return;

  const start  = new Date(ev.startTime);
  const end    = new Date(ev.endTime);
  const fmtT   = d => String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
  const fmtD   = d => d.toLocaleDateString('nl-NL', { weekday:'long', day:'numeric', month:'long' });

  title.textContent = escHtml(ev.name || 'Afspraak');

  const durMin  = Math.round((end - start) / 60000) || 30;
  const durH    = Math.floor(durMin / 60);
  const durM    = durMin % 60;
  const durLbl  = durH > 0 ? (durM > 0 ? \`\${durH}u \${durM}min\` : \`\${durH}u\`) : \`\${durMin}min\`;
  const rows = [
    { label: 'Datum',   val: fmtD(start) },
    { label: 'Tijd',    val: fmtT(start) + ' – ' + fmtT(end) },
    { label: 'Duur',    val: durLbl },
    { label: 'Type',    val: ev.eventType || '—' },
    { label: 'E-mail',  val: ev.email     || '—' },
  ].map(r => \`<div class="cal-modal-row"><span class="cal-modal-row-label">\${r.label}</span><span class="cal-modal-row-val">\${escHtml(String(r.val))}</span></div>\`).join('');

  const joinBtn = ev.joinUrl
    ? \`<a href="\${escHtml(ev.joinUrl)}" target="_blank" class="cal-modal-btn cal-modal-btn-primary">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>
        Deelnemen
      </a>\`
    : '';
  const rescheduleBtn = ev.rescheduleUrl
    ? \`<a href="\${escHtml(ev.rescheduleUrl)}" target="_blank" class="cal-modal-btn cal-modal-btn-secondary">Verzetten</a>\`
    : '';
  const cancelBtn = ev.cancelUrl
    ? \`<a href="\${escHtml(ev.cancelUrl)}" target="_blank" class="cal-modal-btn cal-modal-btn-danger">Annuleren</a>\`
    : '';

  // Attendance section for past events (>5h ago)
  let attSection = '';
  const fiveHoursAgo = Date.now() - 5 * 60 * 60 * 1000;
  if (start.getTime() < fiveHoursAgo) {
    const ml = matchLeadToEvent(ev.name);
    if (ml) {
      const nd  = parseNotities(ml);
      const v   = nd.afspraak ? nd.afspraak.verschenen : undefined;
      const lid = escHtml(String(ml.id));
      const gesloten = nd.afspraak?.gesloten || '';
      const notitie  = escHtml(nd.afspraak?.notitie || '');

      if (v === true) {
        // Already marked as came — show result + stored deal info
        attSection = \`<div class="cal-modal-att-section">
          <div class="cal-modal-att-label">Afspraak resultaat</div>
          <div class="cal-modal-att-result yes">
            ✅ Gekomen
            <span class="cal-modal-att-result-edit" onclick="calAttStartEdit('\${lid}',true)">Bewerken</span>
          </div>
          \${gesloten ? \`<div style="font-size:12px;color:var(--green);font-weight:600;margin-top:6px;">💰 Deal: \${escHtml(gesloten)}</div>\` : ''}
          \${nd.afspraak?.notitie ? \`<div style="font-size:12px;color:var(--text-muted);margin-top:4px;white-space:pre-wrap;">\${escHtml(nd.afspraak.notitie)}</div>\` : ''}
        </div>\`;
      } else if (v === false) {
        // Already marked as no-show — show result + reason
        attSection = \`<div class="cal-modal-att-section">
          <div class="cal-modal-att-label">Afspraak resultaat</div>
          <div class="cal-modal-att-result no">
            ❌ Niet gekomen
            <span class="cal-modal-att-result-edit" onclick="calAttStartEdit('\${lid}',false)">Bewerken</span>
          </div>
          \${nd.afspraak?.notitie ? \`<div style="font-size:12px;color:var(--text-muted);margin-top:4px;white-space:pre-wrap;">\${escHtml(nd.afspraak.notitie)}</div>\` : ''}
        </div>\`;
      } else {
        // Not yet marked — show buttons
        attSection = \`<div class="cal-modal-att-section" id="cal-att-section-\${lid}">
          <div class="cal-modal-att-label">Kwam deze persoon?</div>
          <div class="cal-modal-att-btns">
            <button class="cal-att-btn yes" onclick="calAttShowForm('\${lid}',true)">✅ Gekomen</button>
            <button class="cal-att-btn no"  onclick="calAttShowForm('\${lid}',false)">❌ Niet gekomen</button>
          </div>
        </div>\`;
      }
    }
  }

  body.innerHTML = rows + \`<div class="cal-modal-actions">\${joinBtn}\${rescheduleBtn}\${cancelBtn}</div>\` + attSection;
  overlay.classList.add('open');
}

/* Show follow-up form inside the calendar event modal */
function calAttShowForm(leadId, verschenen) {
  const section = document.getElementById('cal-att-section-' + leadId);
  if (!section) return;

  if (verschenen) {
    section.innerHTML = \`
      <div class="cal-modal-att-label">Afspraak resultaat — ✅ Gekomen</div>
      <div class="cal-att-followup" id="cal-att-followup">
        <div>
          <div class="cal-att-followup-label">Hebben ze iets gekocht? (optioneel)</div>
          <input id="cal-att-deal" class="cal-att-followup-input" type="text" placeholder="bijv. €1.500 of Pakket Pro" />
        </div>
        <div>
          <div class="cal-att-followup-label">Notities over het gesprek</div>
          <textarea id="cal-att-note" class="cal-att-followup-textarea" placeholder="Wat is er besproken? Volgende stap?"></textarea>
        </div>
        <button class="cal-att-save-btn" onclick="calAttSave('\${escHtml(leadId)}',true)">
          💾 Opslaan
        </button>
      </div>\`;
  } else {
    section.innerHTML = \`
      <div class="cal-modal-att-label">Afspraak resultaat — ❌ Niet gekomen</div>
      <div class="cal-att-followup" id="cal-att-followup">
        <div>
          <div class="cal-att-followup-label">Reden / notitie (optioneel)</div>
          <textarea id="cal-att-note" class="cal-att-followup-textarea" placeholder="bijv. geen antwoord, verkeerd nummer, wil herplannen..."></textarea>
        </div>
        <button class="cal-att-save-btn" onclick="calAttSave('\${escHtml(leadId)}',false)">
          💾 Opslaan
        </button>
      </div>\`;
  }
}

/* Re-open form for editing already-saved attendance */
function calAttStartEdit(leadId, verschenen) {
  const section = document.querySelector('.cal-modal-att-section');
  if (!section) return;
  section.id = 'cal-att-section-' + leadId;
  const lead = (state.leads || []).find(l => String(l.id) === leadId);
  const nd = lead ? parseNotities(lead) : {};

  if (verschenen) {
    section.innerHTML = \`
      <div class="cal-modal-att-label">Afspraak resultaat — ✅ Gekomen</div>
      <div class="cal-att-followup">
        <div>
          <div class="cal-att-followup-label">Deal waarde</div>
          <input id="cal-att-deal" class="cal-att-followup-input" type="text" value="\${escHtml(nd.afspraak?.gesloten||'')}" placeholder="bijv. €1.500" />
        </div>
        <div>
          <div class="cal-att-followup-label">Notities</div>
          <textarea id="cal-att-note" class="cal-att-followup-textarea">\${escHtml(nd.afspraak?.notitie||'')}</textarea>
        </div>
        <button class="cal-att-save-btn" onclick="calAttSave('\${escHtml(leadId)}',true)">💾 Opslaan</button>
      </div>\`;
  } else {
    section.innerHTML = \`
      <div class="cal-modal-att-label">Afspraak resultaat — ❌ Niet gekomen</div>
      <div class="cal-att-followup">
        <div>
          <div class="cal-att-followup-label">Notitie</div>
          <textarea id="cal-att-note" class="cal-att-followup-textarea">\${escHtml(nd.afspraak?.notitie||'')}</textarea>
        </div>
        <button class="cal-att-save-btn" onclick="calAttSave('\${escHtml(leadId)}',false)">💾 Opslaan</button>
      </div>\`;
  }
}

async function calAttSave(leadId, verschenen) {
  const dealEl = document.getElementById('cal-att-deal');
  const noteEl = document.getElementById('cal-att-note');
  const btn    = document.querySelector('.cal-att-save-btn');
  const deal   = dealEl ? dealEl.value.trim() : '';
  const note   = noteEl ? noteEl.value.trim() : '';

  if (btn) { btn.disabled = true; btn.textContent = 'Opslaan...'; }

  await markAttendance(leadId, verschenen, deal, note);

  // Close modal
  const overlay = document.getElementById('cal-event-modal');
  if (overlay) overlay.classList.remove('open');
}

function closeCalModal(e) {
  if (e && e.target !== document.getElementById('cal-event-modal')) return;
  const overlay = document.getElementById('cal-event-modal');
  if (overlay) overlay.classList.remove('open');
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') { const o = document.getElementById('cal-event-modal'); if (o) o.classList.remove('open'); } });

/* ── Today widget ── */
function renderTodayWidget(events) {
  const widget = document.getElementById('today-widget');
  const body   = document.getElementById('today-widget-body');
  if (!widget || !body) return;

  if (!state.calendlyUrl) { widget.style.display = 'none'; return; }
  widget.style.display = '';

  const todayStr = new Date().toDateString();
  const todayEvs = (events || []).filter(ev => new Date(ev.startTime).toDateString() === todayStr)
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

  if (todayEvs.length === 0) {
    body.innerHTML = '<span class="today-empty">Geen afspraken vandaag</span>';
    return;
  }
  body.innerHTML = todayEvs.map(ev => {
    const s    = new Date(ev.startTime);
    const e    = new Date(ev.endTime);
    const fmtT = d => String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
    return \`<div class="today-apt">
      <span class="today-apt-time">\${fmtT(s)}</span>
      <span class="today-apt-name">\${escHtml(ev.name || 'Afspraak')}</span>
      <span class="today-apt-type">\${escHtml(ev.eventType || '')}</span>
    </div>\`;
  }).join('');
}

/* ── Cal nav badge ── */
function updateCalBadge(events) {
  const badge  = document.getElementById('cal-nav-badge');
  if (!badge) return;
  const todayStr = new Date().toDateString();
  const count    = (events || []).filter(ev => new Date(ev.startTime).toDateString() === todayStr).length;
  if (count === 0) { badge.style.display = 'none'; return; }
  badge.textContent = count;
  badge.style.display = 'inline-flex';
}

/* ── Week Calendar ── */
const CAL_START_HOUR = 8;
const CAL_HOURS      = 13;   // 8 AM – 9 PM
const CAL_ROW_H      = 80;

const calState = { weekStart: null, cache: {}, lastEvents: [] };

function calGetMonday(d) {
  const dt = new Date(d);
  const diff = dt.getDay() === 0 ? -6 : 1 - dt.getDay();
  dt.setDate(dt.getDate() + diff);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function calToday() { calState.weekStart = calGetMonday(new Date()); renderCalendar(); }
function calPrev()  { calState.weekStart.setDate(calState.weekStart.getDate() - 7); renderCalendar(); }
function calNext()  { calState.weekStart.setDate(calState.weekStart.getDate() + 7); renderCalendar(); }

/* ── Custom Calendly booking modal ──────────────────────────── */
const calBookState = {
  date:          '',        // YYYY-MM-DD
  eventTypes:    [],
  selectedType:  null,      // uri string
  selectedSlot:  null,      // ISO string
  selectedLead:  null,      // lead object
  slots:         [],
  loading:       false,
  bookName:      '',        // pre-fill for Calendly
  bookEmail:     '',        // pre-fill for Calendly
};

function bookSlot(dateStr, hour) {
  openCalBookModal(dateStr, null);
}

function openCalBookModal(dateStr, prefillLead) {
  const overlay = document.getElementById('cal-book-overlay');
  if (!overlay) return;

  // Set initial state
  calBookState.date         = dateStr || new Date().toISOString().slice(0, 10);
  calBookState.selectedSlot = null;
  calBookState.selectedLead = prefillLead || null;
  calBookState.slots        = [];
  calBookState.eventTypes   = [];
  calBookState.selectedType = null;
  calBookState.bookName     = prefillLead ? (prefillLead.naam || '') : '';
  calBookState.bookEmail    = prefillLead ? (prefillLead.email || '') : '';

  // Update subtitle
  const subtitle = document.getElementById('cal-book-subtitle');
  if (subtitle) {
    const nl  = ['zo','ma','di','wo','do','vr','za'];
    const mns = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
    const d   = new Date(calBookState.date + 'T12:00:00');
    const day = nl[d.getDay()];
    subtitle.textContent = day.charAt(0).toUpperCase() + day.slice(1) + ' ' + d.getDate() + ' ' + mns[d.getMonth()];
  }

  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  renderCalBookBody();
  fetchCalSlots();
}

function closeCalBookModal() {
  const overlay = document.getElementById('cal-book-overlay');
  if (overlay) overlay.classList.remove('open');
  document.body.style.overflow = '';
}

function renderCalBookBody() {
  const body = document.getElementById('cal-book-body');
  if (!body) return;

  const mns = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
  const nl  = ['zo','ma','di','wo','do','vr','za'];
  const d   = new Date(calBookState.date + 'T12:00:00');
  const dateLbl = nl[d.getDay()].charAt(0).toUpperCase() + nl[d.getDay()].slice(1) + ' ' + d.getDate() + ' ' + mns[d.getMonth()];

  // Event type tabs
  const typesHtml = calBookState.eventTypes.length > 1
    ? \`<div>
        <div class="cb-label">Type afspraak</div>
        <div class="cb-types">
          \${calBookState.eventTypes.map(et => {
            const active = et.uri === calBookState.selectedType ? ' active' : '';
            const dur    = et.duration ? \`<span class="cb-type-dur">(\${et.duration}min)</span>\` : '';
            return \`<button class="cb-type-btn\${active}" onclick="calBookSelectType('\${escHtml(et.uri)}')">\${escHtml(et.name)}\${dur}</button>\`;
          }).join('')}
        </div>
      </div>\`
    : '';

  // Date nav
  const dateNavHtml = \`<div>
    <div class="cb-label">Datum</div>
    <div class="cb-date-nav">
      <button class="cb-date-btn" onclick="calBookNavDate(-1)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <div class="cb-date-label">\${dateLbl}</div>
      <button class="cb-date-btn" onclick="calBookNavDate(1)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>
      </button>
    </div>
  </div>\`;

  // Slots
  let slotsHtml;
  if (calBookState.loading) {
    slotsHtml = \`<div class="cb-slots"><div class="cb-slots-loading"><div class="cal-book-spinner-ring"></div> Beschikbare tijden laden...</div></div>\`;
  } else if (calBookState.slots.length === 0) {
    slotsHtml = \`<div class="cb-slots"><div class="cb-slots-empty">Geen beschikbare tijden op \${dateLbl}.<br>Kies een andere datum.</div></div>\`;
  } else {
    slotsHtml = \`<div class="cb-slots">\${calBookState.slots.map(slot => {
      const t     = new Date(slot.startTime);
      const hh    = String(t.getHours()).padStart(2,'0');
      const mm    = String(t.getMinutes()).padStart(2,'0');
      const sel   = slot.startTime === calBookState.selectedSlot ? ' selected' : '';
      const isoEsc = escHtml(slot.startTime);
      return \`<button class="cb-slot\${sel}" onclick="calBookSelectSlot('\${isoEsc}')">\${hh}:\${mm}</button>\`;
    }).join('')}</div>\`;
  }

  // Lead picker + name/email (shown when slot selected)
  let leadHtml = '';
  if (calBookState.selectedSlot) {
    const qualified = (state.leads || [])
      .filter(l => l.qualified)
      .sort((a, b) => (b.leadScore || 0) - (a.leadScore || 0))
      .slice(0, 30);
    leadHtml = \`<div>
      <div class="cb-label">Koppel aan lead <span style="font-weight:400;text-transform:none;letter-spacing:0">(optioneel)</span></div>
      <div class="cb-lead-search">
        <input class="cb-lead-input" id="cb-lead-input" type="text"
          placeholder="Zoek op naam..."
          value="\${escHtml(calBookState.selectedLead ? (calBookState.selectedLead.naam || '') : '')}"
          oninput="calBookFilterLeads(this.value)"
          onfocus="calBookFilterLeads(this.value)"
        />
        <div class="cb-lead-dropdown" id="cb-lead-dropdown" style="display:none">
          \${qualified.map(l => {
            const lid    = escHtml(String(l.id));
            const name   = escHtml(l.naam || 'Onbekend');
            const score  = l.leadScore || '';
            return \`<div class="cb-lead-opt" onclick="calBookPickLead('\${lid}')">
              <span>\${name}</span>
              \${score ? \`<span class="cb-lead-opt-score">\${score}</span>\` : ''}
            </div>\`;
          }).join('')}
        </div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:2px">
      <div>
        <div class="cb-label">Naam</div>
        <input class="cb-field-input" id="cb-book-name" type="text" placeholder="Volledige naam"
          value="\${escHtml(calBookState.bookName)}"
          oninput="calBookState.bookName=this.value" />
      </div>
      <div>
        <div class="cb-label">E-mailadres</div>
        <input class="cb-field-input" id="cb-book-email" type="email" placeholder="naam@bedrijf.nl"
          value="\${escHtml(calBookState.bookEmail)}"
          oninput="calBookState.bookEmail=this.value" />
      </div>
    </div>\`;
  }

  // Confirm button
  let confirmHtml = '';
  if (calBookState.selectedSlot) {
    const selType = calBookState.eventTypes.find(e => e.uri === calBookState.selectedType);
    const bookUrl = selType ? selType.bookingUrl : (state.calendlyUrl || '');
    const t       = new Date(calBookState.selectedSlot);
    const hh      = String(t.getHours()).padStart(2,'0');
    const mm      = String(t.getMinutes()).padStart(2,'0');
    let fullUrl = bookUrl + (bookUrl.includes('?') ? '&' : '?') + 'date=' + calBookState.date;
    if (calBookState.bookName)  fullUrl += '&name='  + encodeURIComponent(calBookState.bookName);
    if (calBookState.bookEmail) fullUrl += '&email=' + encodeURIComponent(calBookState.bookEmail);
    confirmHtml = \`<div class="cb-confirm-wrap">
      <a class="cb-confirm-btn" href="\${escHtml(fullUrl)}" target="_blank" onclick="calBookBeforeConfirm(this)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
        Bevestig \${hh}:\${mm} in Calendly
      </a>
      <div class="cb-confirm-note">Calendly opent in een nieuw venster — naam &amp; e-mail zijn alvast ingevuld</div>
    </div>\`;
  }

  body.innerHTML = typesHtml + dateNavHtml +
    \`<div><div class="cb-label">Beschikbare tijden</div>\${slotsHtml}</div>\` +
    leadHtml + confirmHtml;
}

async function fetchCalSlots() {
  calBookState.loading = true;
  calBookState.slots   = [];
  renderCalBookBody();

  try {
    const typeParam = calBookState.selectedType
      ? '&event_type=' + encodeURIComponent(calBookState.selectedType)
      : '';
    const resp = await fetch(
      \`\${API_BASE}/calendly-slots?date=\${calBookState.date}\${typeParam}\`,
      { headers: { 'x-api-key': state.apiKey } }
    );
    const data = await resp.json();

    if (!data.connected) {
      calBookState.loading = false;
      const body = document.getElementById('cal-book-body');
      if (body) body.innerHTML = \`<div class="cb-no-connection">
        Calendly is niet verbonden.<br>
        Ga naar <a href="#" onclick="closeCalBookModal();navigateTo('instellingen')">Instellingen</a> om te verbinden.
      </div>\`;
      return;
    }

    calBookState.eventTypes = data.eventTypes || [];
    if (!calBookState.selectedType && calBookState.eventTypes.length) {
      calBookState.selectedType = data.selectedEventType || calBookState.eventTypes[0].uri;
    }
    calBookState.slots   = data.slots || [];
    calBookState.loading = false;
    renderCalBookBody();

  } catch (e) {
    calBookState.loading = false;
    calBookState.slots   = [];
    renderCalBookBody();
  }
}

function calBookSelectType(uri) {
  if (calBookState.selectedType === uri) return;
  calBookState.selectedType = uri;
  calBookState.selectedSlot = null;
  fetchCalSlots();
}

function calBookSelectSlot(iso) {
  calBookState.selectedSlot = calBookState.selectedSlot === iso ? null : iso;
  renderCalBookBody();
}

function calBookNavDate(delta) {
  const d = new Date(calBookState.date + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  calBookState.date         = d.toISOString().slice(0, 10);
  calBookState.selectedSlot = null;

  // Update subtitle
  const nl  = ['zo','ma','di','wo','do','vr','za'];
  const mns = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
  const day = nl[d.getDay()];
  const subtitle = document.getElementById('cal-book-subtitle');
  if (subtitle) subtitle.textContent = day.charAt(0).toUpperCase() + day.slice(1) + ' ' + d.getDate() + ' ' + mns[d.getMonth()];

  fetchCalSlots();
}

function calBookFilterLeads(q) {
  const dropdown = document.getElementById('cb-lead-dropdown');
  if (!dropdown) return;
  const lower = (q || '').toLowerCase();
  const opts   = dropdown.querySelectorAll('.cb-lead-opt');
  let visible  = 0;
  opts.forEach(opt => {
    const name = opt.querySelector('span') ? opt.querySelector('span').textContent.toLowerCase() : '';
    const show  = !lower || name.includes(lower);
    opt.style.display = show ? '' : 'none';
    if (show) visible++;
  });
  dropdown.style.display = visible > 0 ? 'block' : 'none';
}

function calBookPickLead(leadId) {
  const lead = (state.leads || []).find(l => String(l.id) === leadId);
  calBookState.selectedLead = lead || null;
  if (lead) {
    calBookState.bookName  = lead.naam  || calBookState.bookName;
    calBookState.bookEmail = lead.email || calBookState.bookEmail;
  }
  const input    = document.getElementById('cb-lead-input');
  const dropdown = document.getElementById('cb-lead-dropdown');
  if (input)    input.value = lead ? (lead.naam || '') : '';
  if (dropdown) dropdown.style.display = 'none';
  // Update name/email inputs if already rendered
  const nameInput  = document.getElementById('cb-book-name');
  const emailInput = document.getElementById('cb-book-email');
  if (nameInput  && lead && lead.naam)  nameInput.value  = lead.naam;
  if (emailInput && lead && lead.email) emailInput.value = lead.email;
}

function calBookBeforeConfirm(el) {
  // Read latest values from inputs before navigating (href is set on render, refresh it)
  const nameEl  = document.getElementById('cb-book-name');
  const emailEl = document.getElementById('cb-book-email');
  if (nameEl)  calBookState.bookName  = nameEl.value;
  if (emailEl) calBookState.bookEmail = emailEl.value;

  const selType = calBookState.eventTypes.find(e => e.uri === calBookState.selectedType);
  const bookUrl = selType ? selType.bookingUrl : (state.calendlyUrl || '');
  let url = bookUrl + (bookUrl.includes('?') ? '&' : '?') + 'date=' + calBookState.date;
  if (calBookState.bookName)  url += '&name='  + encodeURIComponent(calBookState.bookName);
  if (calBookState.bookEmail) url += '&email=' + encodeURIComponent(calBookState.bookEmail);
  el.href = url;
  closeCalBookModal();
}

// Hide lead dropdown when clicking outside
document.addEventListener('click', e => {
  const dd = document.getElementById('cb-lead-dropdown');
  const inp = document.getElementById('cb-lead-input');
  if (dd && inp && !dd.contains(e.target) && e.target !== inp) {
    dd.style.display = 'none';
  }
});

function renderCalSidebar() {
  const listEl  = document.getElementById('cal-sidebar-list');
  const countEl = document.getElementById('cal-sidebar-count');
  if (!listEl) return;

  const leads = (state.leads || []).filter(l => l.qualified && !l.afspraakGeboekt)
    .sort((a, b) => (b.leadScore || 0) - (a.leadScore || 0));

  if (countEl) countEl.textContent = leads.length;

  if (leads.length === 0) {
    listEl.innerHTML = \`<div class="cal-sidebar-empty">✅ Alle gekwalificeerde leads hebben een afspraak!</div>\`;
    return;
  }

  listEl.innerHTML = leads.map(l => {
    const name     = l.naam || 'Onbekend';
    const initials = name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0,2).toUpperCase() || 'HV';
    const phone    = l.telefoon || '';
    const score    = l.leadScore || '';
    const rawPhone = phone.replace(/\D/g,'');
    const waPhone  = rawPhone.startsWith('0') ? '31' + rawPhone.slice(1) : rawPhone;
    const waLink   = \`https://wa.me/\${waPhone}?text=\${encodeURIComponent('Hallo ' + name + ', ik wilde graag een afspraak inplannen. Wanneer schikt het u?')}\`;
    const calUrl   = state.calendlyUrl || '';
    const idStr    = escHtml(String(l.id));
    return \`<div class="cal-call-item" onclick="(function(){var lead=state.leads.find(x=>String(x.id)==='\${idStr}');if(lead)openPanel(lead);})()">
      <div class="cal-call-header">
        <div class="cal-call-avatar">\${escHtml(initials)}</div>
        <span class="cal-call-name">\${escHtml(name)}</span>
        \${score !== '' ? \`<span class="cal-call-score">\${score}</span>\` : ''}
      </div>
      \${phone ? \`<a class="cal-call-phone-link" href="tel:\${escHtml(phone)}" onclick="event.stopPropagation()">
        <span>📞</span> \${escHtml(phone)}
      </a>\` : '<div style="font-size:11px;color:var(--text-muted);margin-bottom:7px">Geen telefoonnummer</div>'}
      <div class="cal-call-actions">
        \${phone ? \`<a class="cal-call-btn" href="tel:\${escHtml(phone)}" onclick="event.stopPropagation()">📞 Bellen</a>\` : ''}
        \${waPhone ? \`<a class="cal-call-btn" href="\${escHtml(waLink)}" target="_blank" onclick="event.stopPropagation()">💬 WA</a>\` : ''}
        <button class="cal-call-btn primary" onclick="event.stopPropagation();openCalBookModal(new Date().toISOString().slice(0,10),(state.leads||[]).find(x=>String(x.id)==='\${idStr}'))">📅 Boeken</button>
      </div>
    </div>\`;
  }).join('');
}

/* ── Attendance tracking ─────────────────────────────────────── */
function matchLeadToEvent(evName) {
  const n = (evName || '').toLowerCase().replace(/\s+/g,' ').trim();
  if (!n) return null;
  const leads = state.leads || [];
  // Exact match first
  let found = leads.find(l => (l.naam||'').toLowerCase().replace(/\s+/g,' ').trim() === n);
  if (found) return found;
  // Partial: every word of event name appears in lead name (or vice versa)
  const evWords = n.split(' ').filter(w => w.length > 2);
  found = leads.find(l => {
    const ln = (l.naam||'').toLowerCase();
    return evWords.length > 0 && evWords.every(w => ln.includes(w));
  });
  return found || null;
}

function renderAttendanceBanner() {
  const banner = document.getElementById('cal-attendance-banner');
  const cards  = document.getElementById('cal-att-cards');
  if (!banner || !cards) return;

  const fiveHoursAgo = Date.now() - 5 * 60 * 60 * 1000;
  const events = calState.lastEvents || [];

  const pending = [];
  events.forEach(ev => {
    if (new Date(ev.startTime).getTime() > fiveHoursAgo) return;
    const lead = matchLeadToEvent(ev.name);
    if (!lead) return;
    const nData = parseNotities(lead);
    const v = nData.afspraak ? nData.afspraak.verschenen : undefined;
    if (v === true || v === false) return; // already marked
    pending.push({ ev, lead });
  });

  if (pending.length === 0) { banner.classList.remove('visible'); return; }
  banner.classList.add('visible');

  const mns = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
  const nl  = ['zo','ma','di','wo','do','vr','za'];

  cards.innerHTML = pending.map(({ ev, lead }) => {
    const start   = new Date(ev.startTime);
    const dayLbl  = nl[start.getDay()] + ' ' + start.getDate() + ' ' + mns[start.getMonth()];
    const timeLbl = String(start.getHours()).padStart(2,'0') + ':' + String(start.getMinutes()).padStart(2,'0');
    const idStr   = escHtml(String(lead.id));
    return \`<div class="cal-att-card" id="cal-att-card-\${idStr}">
      <div class="cal-att-info">
        <div class="cal-att-name">\${escHtml(lead.naam || ev.name || '?')}</div>
        <div class="cal-att-time">\${dayLbl} · \${timeLbl}</div>
      </div>
      <div class="cal-att-btns" id="cal-att-btns-\${idStr}">
        <button class="cal-att-btn yes" onclick="bannerAttYes('\${idStr}')">✅ Gekomen</button>
        <button class="cal-att-btn no"  onclick="markAttendance('\${idStr}',false,'','');renderAttendanceBanner()">❌ Niet</button>
      </div>
    </div>\`;
  }).join('');
}

async function markAttendance(leadId, verschenen, gesloten, notitie) {
  const lead = (state.leads || []).find(l => String(l.id) === String(leadId));
  if (!lead) return;

  const nData = parseNotities(lead);
  const geslotenClean = String(gesloten || '').trim();
  const notitieClean  = String(notitie  || '').trim();
  nData.afspraak = Object.assign({}, nData.afspraak || {}, {
    verschenen,
    ...(gesloten !== undefined ? { gesloten: geslotenClean } : {}),
    ...(notitie  !== undefined ? { notitie:  notitieClean  } : {}),
  });
  const notitiesStr = serializeNotities(nData);

  // Optimistic update in state
  lead.notities = notitiesStr;
  // If deal value entered → also update verwachteWaarde so revenue goal updates immediately
  if (geslotenClean) lead.verwachteWaarde = geslotenClean;

  const card = document.getElementById('cal-att-card-' + leadId);
  if (card) { card.style.opacity = '0.4'; card.style.pointerEvents = 'none'; }

  try {
    const fields = { notities: notitiesStr };
    if (geslotenClean) fields.dealWaarde = geslotenClean;
    await patchLead(leadId, fields);
    toast(verschenen ? '✅ Opgeslagen — gekomen' : '❌ Opgeslagen — niet gekomen', 'success');
  } catch(e) {
    toast('Opslaan mislukt', 'error');
    if (card) { card.style.opacity = '1'; card.style.pointerEvents = ''; }
    return;
  }

  // Auto-update revenue goal tracker
  renderRevenueGoal();
  renderAttendanceBanner();
  if (calState.lastEvents) renderAttendanceDots();
}

/* Expand banner card to ask deal + note when "Gekomen" clicked */
function bannerAttYes(leadId) {
  const btnsEl = document.getElementById('cal-att-btns-' + leadId);
  if (!btnsEl) return;
  btnsEl.outerHTML = \`<div id="cal-att-form-\${escHtml(leadId)}" style="margin-top:8px;display:flex;flex-direction:column;gap:7px;width:100%">
    <input id="cal-att-deal-\${escHtml(leadId)}" class="cal-att-followup-input" type="text" placeholder="💰 Deal waarde (bijv. €1.500)" style="font-size:12px;padding:7px 10px" />
    <textarea id="cal-att-note-\${escHtml(leadId)}" class="cal-att-followup-textarea" placeholder="📝 Notities over het gesprek..." style="font-size:12px;min-height:56px;padding:7px 10px"></textarea>
    <div style="display:flex;gap:6px">
      <button class="cal-att-save-btn" style="flex:1;padding:7px" onclick="bannerAttSave('\${escHtml(leadId)}')">💾 Opslaan</button>
      <button class="cal-att-btn no" style="flex:0 0 auto" onclick="markAttendance('\${escHtml(leadId)}',false,'','');renderAttendanceBanner()">❌ Niet</button>
    </div>
  </div>\`;
}

async function bannerAttSave(leadId) {
  const dealEl = document.getElementById('cal-att-deal-' + leadId);
  const noteEl = document.getElementById('cal-att-note-' + leadId);
  const deal   = dealEl ? dealEl.value.trim() : '';
  const note   = noteEl ? noteEl.value.trim() : '';
  await markAttendance(leadId, true, deal, note);
}

function renderAttendanceDots() {
  // Re-render just the event dots without full calendar refresh
  const fiveHoursAgo = Date.now() - 5 * 60 * 60 * 1000;
  (calState.lastEvents || []).forEach((ev, idx) => {
    const el = document.querySelector(\`[data-ev-idx="\${idx}"]\`);
    if (!el) return;
    const dot = el.querySelector('.cal-event-needs-att');
    if (new Date(ev.startTime).getTime() < fiveHoursAgo) {
      const lead = matchLeadToEvent(ev.name);
      if (lead) {
        const nData = parseNotities(lead);
        const v = nData.afspraak ? nData.afspraak.verschenen : undefined;
        if (v !== true && v !== false) {
          if (!dot) { const d = document.createElement('div'); d.className='cal-event-needs-att'; el.appendChild(d); }
          return;
        }
      }
    }
    if (dot) dot.remove();
  });
}

function renderAppointments() {
  if (!calState.weekStart) calState.weekStart = calGetMonday(new Date());
  renderCalSidebar();
  renderCalendar();
}

async function renderCalendar() {
  const ws = calState.weekStart;
  if (!ws) return;

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(ws); d.setDate(d.getDate() + i); return d;
  });

  // Range label
  const startM = days[0].toLocaleDateString('nl-NL', { month: 'short' });
  const endM   = days[6].toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' });
  const label  = startM === days[6].toLocaleDateString('nl-NL', { month: 'short' })
    ? days[0].toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })
    : startM + ' – ' + endM;
  const rangeEl = document.getElementById('cal-range-label');
  if (rangeEl) rangeEl.textContent = label.charAt(0).toUpperCase() + label.slice(1);

  const today    = new Date(); today.setHours(0,0,0,0);
  const dayNames = ['ZO','MA','DI','WO','DO','VR','ZA'];

  // Day headers
  const headerEl = document.getElementById('cal-day-cols-header');
  if (headerEl) {
    headerEl.innerHTML = days.map(d => {
      const isToday = d.getTime() === today.getTime();
      return \`<div class="cal-day-header-cell\${isToday ? ' cal-today' : ''}">
        <div class="cal-day-name">\${dayNames[d.getDay()]}</div>
        <div class="cal-day-num">\${d.getDate()}</div>
      </div>\`;
    }).join('');
  }

  // Time labels (with half-hour ticks)
  const timeLabels = document.getElementById('cal-time-labels');
  if (timeLabels) {
    timeLabels.innerHTML = Array.from({ length: CAL_HOURS }, (_, i) => {
      const h   = CAL_START_HOUR + i;
      const lbl = h < 12 ? h + ':00' : (h === 12 ? '12:00' : (h - 12) + ':00');
      const halfLbl = h < 11 ? (h) + ':30' : (h === 11 ? '11:30' : (h === 12 ? '12:30' : (h - 12) + ':30'));
      return \`<div class="cal-time-label">\${lbl}<span class="cal-time-label-half">\${halfLbl}</span></div>\`;
    }).join('');
  }

  // Render skeleton columns immediately, then fill events
  const colsEl = document.getElementById('cal-day-cols');
  if (!colsEl) return;

  const renderCols = (events) => {
    const eventColors = ['#6366f1','#4f46e5','#8b5cf6','#0ea5e9','#06b6d4'];

    // Store events for modal lookup
    calState.lastEvents = events;

    // Update today widget and nav badge
    renderTodayWidget(events);
    updateCalBadge(events);
    renderAttendanceBanner();

    colsEl.innerHTML = days.map(d => {
      const isToday   = d.getTime() === today.getTime();
      const dow       = d.getDay();
      const isWeekend = dow === 0 || dow === 6;
      const dateStr = d.toISOString().slice(0, 10);
      const rows = Array.from({ length: CAL_HOURS }, (_, hIdx) => {
        const h = CAL_START_HOUR + hIdx;
        return \`<div class="cal-hour-row"><button class="cal-hour-add" onclick="bookSlot('\${dateStr}',\${h})" title="Boek afspraak \${h}:00">+</button></div>\`;
      }).join('');

      let nowLine = '';
      if (isToday) {
        const now = new Date();
        const mins = (now.getHours() - CAL_START_HOUR) * 60 + now.getMinutes();
        if (mins >= 0 && mins < CAL_HOURS * 60)
          nowLine = \`<div class="cal-now-line" style="top:\${Math.round((mins / 60) * CAL_ROW_H)}px"></div>\`;
      }

      // Events for this day
      const dayDate   = d.toDateString();
      const dayEvents = events.filter(ev => new Date(ev.startTime).toDateString() === dayDate);

      const fiveHoursAgo = Date.now() - 5 * 60 * 60 * 1000;
      const evHtml = dayEvents.map(ev => {
        const evIdx    = events.indexOf(ev);
        const start    = new Date(ev.startTime);
        const end      = new Date(ev.endTime);
        const startMin = (start.getHours() - CAL_START_HOUR) * 60 + start.getMinutes();
        const durMin   = Math.round((end - start) / 60000) || 30;
        const top      = Math.round((startMin / 60) * CAL_ROW_H);
        const height   = Math.max(Math.round((durMin / 60) * CAL_ROW_H) - 3, 28);
        const color    = eventColors[(ev.name || '').charCodeAt(0) % eventColors.length];
        const hh       = String(start.getHours()).padStart(2,'0');
        const mm       = String(start.getMinutes()).padStart(2,'0');
        const endHH    = String(end.getHours()).padStart(2,'0');
        const endMM    = String(end.getMinutes()).padStart(2,'0');
        const fullName = escHtml(ev.name || 'Afspraak');
        const eventTypeTxt = escHtml(ev.eventType || '');
        // Duration label
        const durH   = Math.floor(durMin / 60);
        const durM   = durMin % 60;
        const durLbl = durH > 0
          ? (durM > 0 ? \`\${durH}u \${durM}min\` : \`\${durH}u\`)
          : \`\${durMin}min\`;
        // Orange dot: past event where matched lead has no attendance marked
        let attDot = '';
        if (start.getTime() < fiveHoursAgo) {
          const ml = matchLeadToEvent(ev.name);
          if (ml) {
            const nd = parseNotities(ml);
            const v  = nd.afspraak ? nd.afspraak.verschenen : undefined;
            if (v !== true && v !== false) attDot = '<div class="cal-event-needs-att"></div>';
          }
        }
        // Adaptive body based on available height
        let bodyHtml;
        if (height < 30) {
          // Tiny: just start time
          bodyHtml = \`<div class="cal-event-time">\${hh}:\${mm}</div>\`;
        } else if (height < 50) {
          // Small: time + name
          bodyHtml = \`<div class="cal-event-time">\${hh}:\${mm} – \${endHH}:\${endMM}</div><div class="cal-event-name">\${fullName}</div>\`;
        } else if (height < 72) {
          // Medium: time range + name + duration
          bodyHtml = \`<div class="cal-event-time">\${hh}:\${mm} – \${endHH}:\${endMM}</div><div class="cal-event-name">\${fullName}</div><div class="cal-event-dur">⏱ \${durLbl}</div>\`;
        } else {
          // Tall: full info
          bodyHtml = \`<div class="cal-event-time">\${hh}:\${mm} – \${endHH}:\${endMM}</div><div class="cal-event-name">\${fullName}</div>\${eventTypeTxt ? \`<div class="cal-event-type">\${eventTypeTxt}</div>\` : ''}<div class="cal-event-dur">⏱ \${durLbl}</div>\`;
        }
        return \`<div class="cal-event" data-ev-idx="\${evIdx}" style="top:\${top}px;height:\${height}px;background:linear-gradient(135deg,\${color},\${color}cc);cursor:pointer;position:relative;" title="\${fullName} · \${hh}:\${mm}–\${endHH}:\${endMM} (\${durLbl})" onclick="openCalEvent(\${evIdx})">\${bodyHtml}\${attDot}</div>\`;
      }).join('');

      const colClass = \`cal-day-col\${isToday ? ' cal-today-col' : ''}\${isWeekend ? ' cal-weekend-col' : ''}\`;
      return \`<div class="\${colClass}">\${rows}\${nowLine}\${evHtml}</div>\`;
    }).join('');

    // Scroll to current hour on first load (1 hour context above, clamped to 0)
    const scrollEl = document.getElementById('cal-scroll-area');
    if (scrollEl && scrollEl.dataset.scrolled !== '1') {
      scrollEl.dataset.scrolled = '1';
      const curHour = new Date().getHours();
      if (curHour >= CAL_START_HOUR && curHour < CAL_START_HOUR + CAL_HOURS) {
        scrollEl.scrollTop = Math.max(0, (curHour - CAL_START_HOUR - 1) * CAL_ROW_H);
      } else {
        scrollEl.scrollTop = 0;
      }
    }
  };

  // Draw skeleton first
  renderCols([]);

  // Fetch real events from Calendly API
  const weekKey = ws.toISOString().slice(0, 10);
  if (calState.cache[weekKey]) return renderCols(calState.cache[weekKey]);

  try {
    const minISO = days[0].toISOString();
    const end    = new Date(days[6]); end.setHours(23, 59, 59, 999);
    const maxISO = end.toISOString();
    const resp   = await fetch(\`\${API_BASE}/calendly-events?min=\${encodeURIComponent(minISO)}&max=\${encodeURIComponent(maxISO)}\`,
      { headers: { 'x-api-key': state.apiKey } });
    if (resp.ok) {
      const data = await resp.json();
      calState.cache[weekKey] = data.events || [];
      renderCols(calState.cache[weekKey]);
    }
  } catch (e) { /* stay with empty */ }
}

/* ── Profile page ── */
function renderProfile() {
  const s = state;
  // Avatar
  const initials = (s.clientName || 'HV').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
  const avEl = document.getElementById('profile-avatar-lg');
  const nameEl = document.getElementById('profile-name-lg');
  const emailEl = document.getElementById('profile-email-lg');
  if (avEl)    avEl.textContent   = initials;
  if (nameEl)  nameEl.textContent = s.clientName || '—';
  if (emailEl) emailEl.textContent = s.userEmail || localStorage.getItem('hv-email') || '—';

  // Calendly — wire connect button
  const connectBtn = document.getElementById('pf-connect-btn');
  if (connectBtn) connectBtn.href = \`/api/calendly-oauth-start?key=\${s.apiKey}\`;

  const calLink = s.calendlyUrl || '';
  const pfCal   = document.getElementById('pf-calendly');
  const pfBtn   = document.getElementById('pf-calendly-btn');
  if (pfCal) { pfCal.textContent = calLink || '—'; pfCal.href = calLink || '#'; }
  if (pfBtn) pfBtn.href = calLink || '#';

  // Check if Calendly is connected via API
  if (s.apiKey) {
    fetch(\`/api/calendly-events?min=\${new Date().toISOString()}&max=\${new Date(Date.now()+86400000).toISOString()}\`, {
      headers: { 'x-api-key': s.apiKey }
    }).then(r => r.json()).then(data => {
      const statusEl = document.getElementById('pf-cal-status');
      const btnEl    = document.getElementById('pf-connect-btn');
      const openEl   = document.getElementById('pf-calendly-open');
      if (data.connected) {
        if (statusEl) {
          statusEl.textContent = 'Verbonden';
          statusEl.style.background = 'rgba(16,185,129,0.15)';
          statusEl.style.color = '#10b981';
        }
        if (btnEl)  btnEl.style.display = 'none';
        if (openEl) {
          openEl.style.display = 'inline-flex';
          if (calLink) openEl.href = calLink;
        }
      } else {
        if (statusEl) {
          statusEl.textContent = 'Niet gekoppeld';
          statusEl.style.background = 'rgba(107,114,128,0.15)';
          statusEl.style.color = '#9ca3af';
        }
        if (btnEl)  btnEl.style.display = 'inline-flex';
        if (openEl) openEl.style.display = 'none';
      }
    }).catch(() => {});
  }

  // Info rows
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('pf-naam',   s.clientName || '—');
  set('pf-email',  s.userEmail  || localStorage.getItem('hv-email') || '—');

  // Stats
  const st = s.stats || {};
  set('pf-total',  st.total          || (s.leads||[]).length || '0');
  set('pf-qual',   st.qualified      || (s.leads||[]).filter(l=>l.qualified).length || '0');
  set('pf-booked', st.booked         || (s.leads||[]).filter(l=>l.afspraakGeboekt).length || '0');
  set('pf-conv',   (st.conversionRate||0) + '%');

  // Recent leads on profile
  const recentEl = document.getElementById('profile-recent-leads');
  if (recentEl) {
    const recents = (state.leads || []).slice(0, 5);
    if (recents.length === 0) {
      recentEl.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:8px 0">Geen leads gevonden</div>';
    } else {
      recentEl.innerHTML = recents.map(l => {
        const name  = l.fields?.['Naam'] || l.naam || 'Onbekend';
        const score = l.fields?.['Score'] ?? l.leadScore ?? '—';
        const bron  = l.fields?.['Bron'] || l.bron || '';
        const initials = name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
        const qual = l.fields?.['Qualified'] === true || l.qualified === true || (l.fields?.['Score'] >= 7) || l.leadScore >= 7;
        return \`<div class="profile-recent-lead-row" onclick="openLead('\${l.id}')">
          <div class="profile-recent-lead-avatar">\${initials}</div>
          <div style="flex:1;min-width:0">
            <div class="profile-recent-lead-name">\${escHtml(name)}</div>
            <div class="profile-recent-lead-meta">\${escHtml(bron || 'Onbekende bron')}</div>
          </div>
          \${qual ? '<span style="font-size:10px;padding:3px 8px;border-radius:20px;background:rgba(16,185,129,0.15);color:#10b981;font-weight:700">&#10003; Gekw.</span>' : ''}
          <div class="profile-recent-lead-score">\${score}</div>
        </div>\`;
      }).join('');
    }
  }

  // Stats row
  const statsRow = document.getElementById('profile-stats-row');
  if (statsRow) {
    const items = [
      { v: st.total     || (s.leads||[]).length || 0, l: 'Leads' },
      { v: st.qualified || (s.leads||[]).filter(l=>l.qualified).length || 0, l: 'Gekwalificeerd' },
      { v: st.booked    || (s.leads||[]).filter(l=>l.afspraakGeboekt).length || 0, l: 'Afspraken' },
      { v: (st.conversionRate||0) + '%', l: 'Conversie' }
    ];
    statsRow.innerHTML = items.map(i =>
      \`<div class="profile-stat-card"><div class="psv">\${i.v}</div><div class="psl">\${i.l}</div></div>\`
    ).join('');
  }
}

function navigateTo(page) {
  state.currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const pageEl = document.getElementById(\`page-\${page}\`);
  const navEl = document.getElementById(\`nav-\${page}\`);
  if (pageEl) pageEl.classList.add('active');
  if (navEl) navEl.classList.add('active');

  const titles = {
    dashboard:    { title: 'Dashboard',     sub: 'Overzicht van uw gekwalificeerde leads' },
    exports:      { title: 'Exports',       sub: 'Rapporten en data-export' },
    calendly:     { title: 'Kalender',      sub: 'Uw afspraken en beschikbaarheid' },
    admin:        { title: 'Klanten',       sub: 'Overzicht van alle klanten' },
    profile:      { title: 'Profiel',       sub: 'Uw accountgegevens en statistieken' },
    pipeline:     { title: 'Pipeline',      sub: 'Kanban overzicht van uw leads' },
    gesprekken:   { title: 'Gesprekken',    sub: 'AI-conversaties met uw leads' },
    analyse:      { title: 'Analyse',       sub: 'Statistieken en prestatieanalyse' },
    instellingen: { title: 'Instellingen',  sub: 'Beheer uw accountinstellingen' },
    activiteit:   { title: 'Activiteit',    sub: 'Recente gebeurtenissen en updates' }
  };

  const t = titles[page] || { title: page, sub: '' };
  document.getElementById('topbar-title').textContent = t.title;
  document.getElementById('topbar-subtitle').textContent = t.sub;

  // Show refresh + CSV export only on dashboard
  const isDash = page === 'dashboard';
  const btnRefresh = document.getElementById('btn-refresh');
  const btnExport  = document.getElementById('btn-export-csv');
  const tsInfo     = document.getElementById('timestamp-info');
  if (btnRefresh) btnRefresh.style.display = isDash ? '' : 'none';
  if (btnExport)  btnExport.style.display  = isDash ? '' : 'none';
  if (tsInfo)     tsInfo.style.display     = isDash ? '' : 'none';

  // Load admin page on first visit
  if (page === 'admin' && !state.adminLoaded) {
    state.adminLoaded = true;
    loadAdminClients();
  }

  if (page === 'calendly')     renderAppointments();
  if (page === 'profile')      renderProfile();
  if (page === 'pipeline')     renderPipeline();
  if (page === 'gesprekken')   renderGesprekken();
  if (page === 'analyse')      renderAnalyse();
  if (page === 'instellingen') renderInstellingen();
  if (page === 'exports')      updateExportPreview();
  if (page === 'activiteit')   renderActiviteit();

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

const bellBtn = document.getElementById('btn-notif');
if (bellBtn) {
  bellBtn.addEventListener('click', () => {
    const badge = document.getElementById('notif-badge');
    if (badge) { badge.style.display='none'; badge.dataset.count='0'; }
    navigateTo('activiteit');
  });
}

  // Global search
  const searchBtn = document.getElementById('btn-search');
  if (searchBtn) searchBtn.addEventListener('click', openSearch);

  // Close when clicking outside the modal
  const searchOverlay = document.getElementById('search-overlay');
  if (searchOverlay) {
    searchOverlay.addEventListener('mousedown', e => {
      const modal = document.getElementById('search-modal');
      if (modal && !modal.contains(e.target)) closeSearch();
    });
  }

  // Esc button in modal
  const searchEscBtn = document.getElementById('search-esc-btn');
  if (searchEscBtn) searchEscBtn.addEventListener('click', closeSearch);

  document.addEventListener('keydown', e => {
    const overlay = document.getElementById('search-overlay');
    const isOpen = overlay && overlay.classList.contains('open');
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); isOpen ? closeSearch() : openSearch(); return; }
    if (e.key === 'Escape' && isOpen) { e.stopPropagation(); closeSearch(); return; }
    if (!isOpen) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const items = document.querySelectorAll('#search-results .search-result-item');
      if (!items.length) return;
      if (e.key === 'ArrowDown') _searchActiveIndex = (_searchActiveIndex + 1) % items.length;
      else _searchActiveIndex = (_searchActiveIndex - 1 + items.length) % items.length;
      _searchUpdateActive();
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const items = document.querySelectorAll('#search-results .search-result-item');
      const idx = _searchActiveIndex >= 0 ? _searchActiveIndex : 0;
      if (items[idx]) items[idx].click();
    }
  });

  const searchInput = document.getElementById('search-modal-input');
  if (searchInput) {
    searchInput.addEventListener('input', runGlobalSearch);
    // Reset active index on new input
    searchInput.addEventListener('keydown', e => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter') _searchActiveIndex = -1;
    });
  }

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
async function startDashboard(skipRefresh = false) {
  document.getElementById('login-page').style.display = 'none';
  document.getElementById('dashboard-app').classList.add('visible');
  requestNotificationPermission();

  // Handle Calendly OAuth redirect params
  const urlParams = new URLSearchParams(window.location.search);
  const calResult = urlParams.get('calendly');
  if (calResult) {
    // Clean up URL without reload
    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, document.title, cleanUrl);
    if (calResult === 'connected') {
      setTimeout(() => toast('Calendly succesvol gekoppeld! Je afspraken worden nu automatisch gesynchroniseerd.', 'success', 'Calendly gekoppeld'), 600);
      // Navigate to profile so user sees the updated status
      setTimeout(() => navigateTo('profile'), 800);
    } else if (calResult === 'denied') {
      setTimeout(() => toast('Calendly koppeling geannuleerd.', 'info', 'Geannuleerd'), 600);
    } else if (calResult === 'error' || calResult === 'save_error') {
      setTimeout(() => toast('Er is iets misgegaan bij het koppelen van Calendly. Probeer het opnieuw.', 'error', 'Fout'), 600);
    }
  }

  // Detect admin key by trying the admin endpoint
  try {
    const r = await fetch(\`\${API_BASE}/admin\`, { headers: { 'x-api-key': state.apiKey } });
    if (r.ok) {
      const adminNav = document.getElementById('nav-admin');
      if (adminNav) adminNav.style.display = '';
    }
  } catch { /* not admin */ }
  // skipRefresh=true when init() already fetched leads — avoid a second Airtable call
  await refreshData(skipRefresh);
}

document.getElementById('btn-login').addEventListener('click', handleLogin);
document.getElementById('login-password').addEventListener('keydown', e => {
  // Guard: don't fire a second request while a countdown is in progress
  if (e.key === 'Enter' && !document.getElementById('btn-login').disabled) handleLogin();
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
  btn.querySelector('span').textContent = 'Inloggen...';
  btn.classList.add('loading');
  btn.disabled = true;

  try {
    const authResp = await fetch(AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const authData = await authResp.json();

    // 503 = Airtable temporarily rate-limited — auto-retry with countdown so the
    // user never has to click INLOGGEN again and can't accidentally spam requests.
    if (authResp.status === 503) {
      let remaining = authData.retryAfter || 30;
      errEl.textContent = \`Even geduld — opnieuw proberen in \${remaining}s...\`;
      errEl.classList.add('visible');
      const tick = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
          clearInterval(tick);
          btn.querySelector('span').textContent = 'Inloggen...';
          btn.classList.add('loading');
          handleLogin();
        } else {
          errEl.textContent = \`Even geduld — opnieuw proberen in \${remaining}s...\`;
        }
      }, 1000);
      return; // btn stays disabled during countdown
    }

    if (!authResp.ok) {
      errEl.textContent = authData.error || 'Inloggen mislukt.';
      errEl.classList.add('visible');
      btn.querySelector('span').textContent = 'Inloggen';
      btn.classList.remove('loading');
      btn.disabled = false;
      return;
    }
    saveSession(authData.apiKey, authData.clientName, authData.projectCode, email);
    state.clientName = authData.clientName || email.split('@')[0];

    // Auth succeeded — load leads separately so a transient 429 on the
    // first data fetch doesn't look like a login failure.
    try {
      const data = await fetchLeads();
      state.leads = data.leads || [];
      state.stats = data.stats || {};
      state.clientName = authData.clientName || data.client?.naam || state.clientName;
      state.lastFetch = Date.now();
    } catch (_) {
      // Leads fetch failed (Airtable busy) — proceed with empty state.
      // The 90-second polling loop will populate the dashboard automatically.
      state.leads = [];
      state.stats = {};
      state.lastFetch = 0;
    }

    await startDashboard();
  } catch (err) {
    errEl.textContent = 'Verbindingsfout. Probeer opnieuw.';
    errEl.classList.add('visible');
    btn.querySelector('span').textContent = 'Inloggen';
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

/* ============================================================
   PIPELINE (KANBAN)
   ============================================================ */
let _searchActiveIndex = -1;

function _highlightMatch(text, q) {
  if (!q || !text) return escHtml(text || '');
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return escHtml(text);
  return escHtml(text.slice(0, idx)) + \`<mark>\${escHtml(text.slice(idx, idx + q.length))}</mark>\` + escHtml(text.slice(idx + q.length));
}

function openSearch() {
  const overlay = document.getElementById('search-overlay');
  if (!overlay) return;
  _searchActiveIndex = -1;
  overlay.classList.add('open');
  document.getElementById('search-footer')?.style && (document.getElementById('search-footer').style.display = 'none');
  setTimeout(() => {
    const inp = document.getElementById('search-modal-input');
    if (inp) { inp.focus(); inp.select(); }
  }, 40);
}

function closeSearch() {
  const overlay = document.getElementById('search-overlay');
  if (overlay) overlay.classList.remove('open');
  const inp = document.getElementById('search-modal-input');
  if (inp) inp.value = '';
  const resultsEl = document.getElementById('search-results');
  if (resultsEl) resultsEl.innerHTML = \`<div class="search-hint"><div class="search-hint-icon">🔍</div><div class="search-hint-text">Begin met typen om leads te zoeken</div><div class="search-hint-shortcuts"><span class="search-hint-shortcut"><kbd>↑↓</kbd> navigeren</span><span class="search-hint-shortcut"><kbd>↵</kbd> openen</span><span class="search-hint-shortcut"><kbd>Esc</kbd> sluiten</span></div></div>\`;
  const footer = document.getElementById('search-footer');
  if (footer) footer.style.display = 'none';
  _searchActiveIndex = -1;
}

function _searchOpenLead(leadId) {
  closeSearch();
  const lead = state.leads.find(x => String(x.id) === String(leadId));
  if (!lead) return;
  navigateTo('dashboard');
  setTimeout(() => openPanel(lead), 120);
}

function _searchUpdateActive() {
  const items = document.querySelectorAll('#search-results .search-result-item');
  items.forEach((el, i) => {
    el.classList.toggle('active', i === _searchActiveIndex);
    if (i === _searchActiveIndex) el.scrollIntoView({ block: 'nearest' });
  });
}

function runGlobalSearch() {
  const q = (document.getElementById('search-modal-input')?.value || '').trim();
  const resultsEl = document.getElementById('search-results');
  const footer = document.getElementById('search-footer');
  const countEl = document.getElementById('search-footer-count');
  if (!resultsEl) return;
  _searchActiveIndex = -1;

  if (!q) {
    resultsEl.innerHTML = \`<div class="search-hint"><div class="search-hint-icon">🔍</div><div class="search-hint-text">Begin met typen om leads te zoeken</div><div class="search-hint-shortcuts"><span class="search-hint-shortcut"><kbd>↑↓</kbd> navigeren</span><span class="search-hint-shortcut"><kbd>↵</kbd> openen</span><span class="search-hint-shortcut"><kbd>Esc</kbd> sluiten</span></div></div>\`;
    if (footer) footer.style.display = 'none';
    return;
  }

  const ql = q.toLowerCase();
  const matches = (state.leads || []).filter(l =>
    (l.naam || '').toLowerCase().includes(ql) ||
    (l.telefoon || '').toLowerCase().includes(ql) ||
    (l.bron || '').toLowerCase().includes(ql) ||
    (l.samenvatting || '').toLowerCase().includes(ql) ||
    (l.status || '').toLowerCase().includes(ql)
  ).slice(0, 12);

  if (matches.length === 0) {
    resultsEl.innerHTML = \`<div class="search-no-results"><div class="search-no-results-icon">🔭</div><div>Geen leads gevonden voor "<strong>\${escHtml(q)}</strong>"</div></div>\`;
    if (footer) footer.style.display = 'none';
    return;
  }

  const html = [\`<div class="search-section-label">Leads (\${matches.length})</div>\`];
  matches.forEach((l, i) => {
    const name = l.naam || 'Onbekend';
    const initials = name.split(' ').filter(Boolean).map(w=>w[0]).join('').slice(0,2).toUpperCase() || 'HV';
    const score = l.leadScore !== null && l.leadScore !== undefined ? l.leadScore : '';
    const phonePart = l.telefoon ? \`📞 \${l.telefoon}\` : '';
    const bronPart = l.bron ? \`· \${l.bron}\` : '';
    const datePart = l.datum ? \`· \${new Date(l.datum).toLocaleDateString('nl-NL',{day:'numeric',month:'short'})}\` : '';
    const meta = [phonePart, bronPart, datePart].filter(Boolean).join(' ');
    const isQualified = l.qualified === true || l.qualified === 'true' || l.qualified === 1;
    const hasAppointment = l.afspraakGeboekt === true || l.afspraakGeboekt === 'true' || l.afspraakGeboekt === 1;
    const namePart = _highlightMatch(name, ql !== q ? q : ql);
    const idStr = escHtml(String(l.id));
    html.push(\`<div class="search-result-item" data-lead-id="\${idStr}" onclick="_searchOpenLead('\${idStr}')">
      <div class="search-result-avatar">\${escHtml(initials)}</div>
      <div class="search-result-body">
        <div class="search-result-name">\${namePart}</div>
        <div class="search-result-meta">\${escHtml(meta)}</div>
      </div>
      <div class="search-result-tags">
        \${isQualified ? \`<span class="search-result-badge qualified">✓ Qualified</span>\` : ''}
        \${hasAppointment ? \`<span class="search-result-badge">📅 Afspraak</span>\` : ''}
        \${score !== '' ? \`<span class="search-result-score">\${score}</span>\` : ''}
      </div>
    </div>\`);
  });

  resultsEl.innerHTML = html.join('');
  if (footer) {
    footer.style.display = 'flex';
    if (countEl) countEl.textContent = matches.length + ' resultaat' + (matches.length !== 1 ? 'en' : '');
  }
}

let _pipelineDragId = null;

function pipelineDragStart(event, leadId) {
  _pipelineDragId = String(leadId);
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', String(leadId));
}

async function pipelineDrop(event, newStatus) {
  event.preventDefault();
  document.querySelectorAll('.pipeline-col').forEach(c => c.classList.remove('drag-over'));
  const leadId = _pipelineDragId || event.dataTransfer.getData('text/plain');
  if (!leadId) return;
  _pipelineDragId = null;

  const lead = state.leads.find(l => String(l.id) === String(leadId));
  if (!lead || lead.status === newStatus) return;

  // Optimistic update
  lead.status = newStatus;
  renderPipeline();
  toast('Lead verplaatst naar ' + newStatus, 'success');

  // Persist
  try {
    await patchStatus(lead.id, newStatus);
  } catch (e) {
    toast('Kon status niet opslaan', 'error');
  }
}

function renderPipeline() {
  const board = document.getElementById('pipeline-board');
  if (!board) return;

  const leads = state.leads;
  const cols = [
    {
      id: 'new',
      label: 'Nieuw',
      cls: 'col-new',
      leads: leads.filter(l => !l.qualified && !l.afspraakGeboekt && !l.opgepikt && !(l.qualified === false && l.status === 'completed'))
    },
    {
      id: 'qualified',
      label: 'Gekwalificeerd',
      cls: 'col-qual',
      leads: leads.filter(l => l.qualified === true && !l.afspraakGeboekt && !l.opgepikt)
    },
    {
      id: 'afspraak',
      label: 'Afspraak',
      cls: 'col-apt',
      leads: leads.filter(l => l.afspraakGeboekt === true && !l.opgepikt)
    },
    {
      id: 'won',
      label: 'Gewonnen',
      cls: 'col-won',
      leads: leads.filter(l => l.opgepikt === true)
    },
    {
      id: 'lost',
      label: 'Verloren',
      cls: 'col-lost',
      leads: leads.filter(l => l.qualified === false && l.status === 'completed')
    }
  ];

  board.innerHTML = cols.map(col => {
    const cards = col.leads.map(l => {
      const sc = l.leadScore || 0;
      const scCls = sc >= 8 ? 'score-green' : sc >= 5 ? 'score-orange' : sc > 0 ? 'score-red' : 'score-gray';
      const dateStr = l.datum ? new Date(l.datum).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit' }) : '';
      return \`<div class="pipeline-card" draggable="true" ondragstart="pipelineDragStart(event,'\${escHtml(String(l.id))}')" onclick="(function(){var lead=state.leads.find(x=>String(x.id)==='\${escHtml(String(l.id))}');if(lead)openPanel(lead);})()">
        <div class="pipeline-card-name">\${escHtml(l.naam) || '—'}</div>
        <div class="pipeline-card-meta">
          \${sc > 0 ? \`<span class="pipeline-score \${scCls}">\${sc}</span>\` : ''}
          \${l.bron ? \`<span class="badge badge-bron" style="font-size:10px">\${escHtml(l.bron)}</span>\` : ''}
          <span class="pipeline-card-date">\${dateStr}</span>
        </div>
        \${l.telefoon ? \`<div class="pipeline-card-phone">📞 \${escHtml(l.telefoon)}</div>\` : ''}
      </div>\`;
    }).join('');

    return \`<div class="pipeline-col" ondragover="event.preventDefault();this.classList.add('drag-over')" ondragleave="this.classList.remove('drag-over')" ondrop="pipelineDrop(event,'\${col.id}')">
      <div class="pipeline-col-header \${col.cls}">
        \${col.label}
        <span class="pipeline-col-count">\${col.leads.length}</span>
      </div>
      <div class="pipeline-col-body">\${cards || \`<div style="color:var(--text-muted);font-size:12px;padding:8px 4px">Geen leads</div>\`}</div>
    </div>\`;
  }).join('');

  // Summary chips
  const summaryEl = document.getElementById('pipeline-summary');
  if (summaryEl) {
    const colNames = ['Nieuw', 'Gekwalificeerd', 'Afspraak', 'Gewonnen', 'Verloren'];
    const colCounts = {};
    cols.forEach(c => { colCounts[c.label] = c.leads.length; });
    const total = (state.leads || []).length;
    // Pipeline deal value: sum verwachteWaarde of non-verloren leads
    const pipelineValue = (state.leads || [])
      .filter(l => l.status !== 'verloren')
      .reduce((sum, l) => {
        const raw = String(l.verwachteWaarde || '').replace(/[^0-9.,]/g, '').replace(',', '.');
        return sum + (parseFloat(raw) || 0);
      }, 0);
    const valueFormatted = pipelineValue > 0
      ? '€' + pipelineValue.toLocaleString('nl-NL', { maximumFractionDigits: 0 })
      : null;
    summaryEl.innerHTML = \`<div class="pipeline-chip"><span>Totaal</span><span class="pipeline-chip-count">\${total}</span></div>\`
      + colNames.map(c => \`<div class="pipeline-chip"><span>\${c}</span><span class="pipeline-chip-count">\${colCounts[c] || 0}</span></div>\`).join('')
      + (valueFormatted ? \`<div class="pipeline-chip"><span>Pipeline waarde</span><span class="pipeline-chip-count" style="color:var(--green)">\${valueFormatted}</span></div>\` : '');
  }
}

/* ============================================================
   GESPREKKEN (CONVERSATIONS)
   ============================================================ */
function renderGesprekken() {
  const listBody = document.getElementById('conv-list-body');
  if (!listBody) return;

  const withConvs = state.leads.filter(l => {
    if (!l.conversatieGeschiedenis) return false;
    try { const p = JSON.parse(l.conversatieGeschiedenis); return Array.isArray(p) && p.length > 0; }
    catch { return false; }
  }).sort((a, b) => new Date(b.datum || 0) - new Date(a.datum || 0));

  if (withConvs.length === 0) {
    listBody.innerHTML = \`<div style="padding:20px;color:var(--text-muted);font-size:13px">Geen gesprekken gevonden</div>\`;
    return;
  }

  listBody.innerHTML = withConvs.map(l => {
    let preview = '';
    try {
      const msgs = JSON.parse(l.conversatieGeschiedenis);
      const last = msgs[msgs.length - 1];
      preview = last ? (last.content || '').slice(0, 50) + ((last.content || '').length > 50 ? '...' : '') : '';
    } catch {}
    const dateStr = l.datum ? new Date(l.datum).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit' }) : '';
    return \`<div class="conv-list-item" id="conv-item-\${escHtml(String(l.id))}" onclick="openConversation('\${escHtml(String(l.id))}')" >
      <div class="conv-list-item-name">
        <span>\${escHtml(l.naam) || '—'}</span>
        <span class="conv-list-item-date">\${dateStr}</span>
      </div>
      <div class="conv-list-item-preview">\${escHtml(preview)}</div>
    </div>\`;
  }).join('');
}

function openConversation(leadId) {
  const lead = state.leads.find(l => String(l.id) === String(leadId));
  if (!lead) return;

  // Mark active
  document.querySelectorAll('.conv-list-item').forEach(el => el.classList.remove('active'));
  const activeItem = document.getElementById(\`conv-item-\${leadId}\`);
  if (activeItem) activeItem.classList.add('active');

  const detail = document.getElementById('conv-detail');
  if (!detail) return;

  let msgs = [];
  try { msgs = JSON.parse(lead.conversatieGeschiedenis || '[]'); } catch {}

  const bubbles = msgs.map(m => {
    const isUser = m.role === 'user';
    const label = isUser ? '👤 Lead' : '🤖 AI';
    const content = (m.content || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\\n/g,'<br>');
    return \`<div>
      <div class="conv-bubble-label">\${label}</div>
      <div class="conv-bubble \${isUser ? 'user' : 'assistant'}">\${content}</div>
    </div>\`;
  }).join('');

  const scoreNum = lead.leadScore || 0;
  const scCls = scoreNum >= 8 ? 'score-green' : scoreNum >= 5 ? 'score-orange' : scoreNum > 0 ? 'score-red' : 'score-gray';

  detail.innerHTML = \`
    <div class="conv-header">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      \${escHtml(lead.naam) || '—'}
      \${scoreNum > 0 ? \`<span class="score-pill \${scCls}" style="margin-left:auto">\${scoreNum}</span>\` : ''}
    </div>
    <div class="conv-messages">\${bubbles || \`<div class="conv-empty"><div class="conv-empty-icon">💬</div><div>Geen berichten</div></div>\`}</div>
  \`;

  // Scroll to bottom
  const msgs_el = detail.querySelector('.conv-messages');
  if (msgs_el) setTimeout(() => { msgs_el.scrollTop = msgs_el.scrollHeight; }, 50);
}

/* ============================================================
   HELPER: PARSE DEAL VALUE
   ============================================================ */
function parseDealValue(v) {
  if (!v) return 0;
  const s = String(v).replace(/[€\s]/g, '').replace(',', '.');
  return parseFloat(s) || 0;
}

/* ============================================================
   HELPER: LEAD AGE
   ============================================================ */
function leadAgeDays(lead) {
  if (!lead.datum) return 0;
  return Math.floor((Date.now() - new Date(lead.datum).getTime()) / 86400000);
}
function leadAgeClass(days) {
  if (days < 1) return 'fresh';
  if (days <= 3) return 'warm';
  if (days <= 7) return 'cooling';
  return 'cold';
}

/* ============================================================
   FEATURE 5: REVENUE GOAL
   ============================================================ */
function renderRevenueGoal() {
  const goal = parseFloat(localStorage.getItem('helvaro_revenue_goal') || '5000') || 5000;
  const current = (state.leads || []).reduce((sum, l) => {
    if (l.qualified || l.afspraakGeboekt) sum += parseDealValue(l.verwachteWaarde);
    return sum;
  }, 0);
  const pct = Math.min(100, Math.round(current / goal * 100));
  const fmt = v => '€' + new Intl.NumberFormat('nl-NL').format(Math.round(v));

  const el = document.getElementById('revenue-goal-current');
  const tgt = document.getElementById('revenue-goal-target');
  const bar = document.getElementById('revenue-goal-bar');
  const pctEl = document.getElementById('revenue-goal-pct');
  if (el) el.textContent = fmt(current);
  if (tgt) tgt.textContent = fmt(goal);
  if (bar) {
    bar.style.width = pct + '%';
    bar.style.background = pct >= 100
      ? 'linear-gradient(90deg, var(--green), #16a34a)'
      : pct >= 50
        ? 'linear-gradient(90deg, var(--accent), var(--blue-bright))'
        : 'linear-gradient(90deg, var(--orange), #d97706)';
  }
  if (pctEl) pctEl.textContent = pct + '% van doel bereikt';
}

(function setupRevenueGoalEdit() {
  const editBtn = document.getElementById('revenue-goal-edit');
  if (!editBtn) return;
  editBtn.addEventListener('click', function() {
    const current = parseFloat(localStorage.getItem('helvaro_revenue_goal') || '5000') || 5000;
    const input = prompt('Nieuw omzetdoel (€):', current);
    if (input === null) return;
    const val = parseFloat(input.replace(/[^0-9.]/g, ''));
    if (!isNaN(val) && val > 0) {
      localStorage.setItem('helvaro_revenue_goal', String(val));
      renderRevenueGoal();
    }
  });
})();

/* ============================================================
   ANALYSE (ANALYTICS)
   ============================================================ */
function renderAnalyse() {
  const leads = state.leads;

  // Revenue & Afspraak Analytics
  (function() {
    const fmt = v => '€' + new Intl.NumberFormat('nl-NL').format(Math.round(v));

    // Gesloten omzet: sum from afspraak.gesloten for leads that showed up
    let geslotenOmzet = 0;
    let verschenenCount = 0;
    let noShowCount = 0;
    const bookedLeads = leads.filter(l => l.afspraakGeboekt);
    bookedLeads.forEach(l => {
      const nd = parseNotities(l);
      if (nd.afspraak) {
        if (nd.afspraak.verschenen === true) {
          verschenenCount++;
          geslotenOmzet += parseDealValue(nd.afspraak.gesloten || l.verwachteWaarde);
        } else if (nd.afspraak.verschenen === false) {
          noShowCount++;
        }
      }
    });

    // Fallback: if no attendance tracked yet, use qualified/booked deal values
    const trackedTotal = verschenenCount + noShowCount;
    const omzetEl = document.getElementById('analyse-omzet-val');
    if (omzetEl) omzetEl.textContent = fmt(geslotenOmzet);

    // Show-up rate
    const showupEl = document.getElementById('analyse-showup-val');
    const showupSubEl = document.getElementById('analyse-showup-sub');
    if (showupEl) {
      if (trackedTotal === 0) {
        showupEl.textContent = '—';
        showupEl.style.color = 'var(--text-muted)';
        if (showupSubEl) showupSubEl.textContent = 'nog geen bijgehouden';
      } else {
        const rate = Math.round(verschenenCount / trackedTotal * 100);
        showupEl.textContent = rate + '%';
        showupEl.style.color = rate >= 70 ? 'var(--green)' : rate >= 40 ? 'var(--orange)' : 'var(--red)';
        if (showupSubEl) showupSubEl.textContent = verschenenCount + ' van ' + trackedTotal + ' geboekt';
      }
    }

    // Gem deal waarde
    const leadsMetWaarde = leads.filter(l => parseDealValue(l.verwachteWaarde) > 0);
    const gemDeal = leadsMetWaarde.length
      ? leadsMetWaarde.reduce((s, l) => s + parseDealValue(l.verwachteWaarde), 0) / leadsMetWaarde.length
      : 0;
    const gemEl = document.getElementById('analyse-gem-val');
    if (gemEl) gemEl.textContent = fmt(gemDeal);
    const gemSubEl = document.getElementById('analyse-gem-sub');
    if (gemSubEl) gemSubEl.textContent = leadsMetWaarde.length + ' deals met waarde';

    // Win rate
    const verlorenCount = leads.filter(l => l.status === 'verloren').length;
    const winRate = leads.length > 0 ? Math.round(100 - (verlorenCount / leads.length * 100)) : 100;
    const wrEl = document.getElementById('analyse-winrate-val');
    if (wrEl) {
      wrEl.textContent = winRate + '%';
      wrEl.style.color = winRate >= 70 ? 'var(--green)' : winRate >= 40 ? 'var(--orange)' : 'var(--red)';
    }

    // Verlies redenen top 3
    const redenMap = {};
    leads.filter(l => l.status === 'verloren' && l.reden).forEach(l => {
      redenMap[l.reden] = (redenMap[l.reden] || 0) + 1;
    });
    const top3 = Object.entries(redenMap).sort((a,b) => b[1]-a[1]).slice(0,3);
    const verliesEl = document.getElementById('analyse-verlies-list');
    if (verliesEl) {
      verliesEl.innerHTML = top3.length ? top3.map(([r, c]) => \`
        <div class="analyse-verlies-row">
          <span>\${escHtml(r)}</span>
          <span class="analyse-verlies-count">\${c}</span>
        </div>
      \`).join('') : '<div style="font-size:11px;color:var(--text-muted)">Geen verliesdata</div>';
    }

    // Update funnel with verschenen step
    const funnelBooked = bookedLeads.length;
    const funnelVerschenen = verschenenCount;
    const total = leads.length;
  })();

  // Funnel — includes verschenen step
  const total = leads.length;
  const qualified = leads.filter(l => l.qualified).length;
  const booked = leads.filter(l => l.afspraakGeboekt).length;
  const won = leads.filter(l => l.opgepikt).length;
  // Count verschenen from notities
  const verschenenFunnel = leads.filter(l => {
    if (!l.afspraakGeboekt) return false;
    try { const nd = parseNotities(l); return nd.afspraak && nd.afspraak.verschenen === true; } catch { return false; }
  }).length;

  const funnelSteps = [
    { label: 'Totaal leads',      count: total,             pct: 100 },
    { label: 'Gekwalificeerd',    count: qualified,          pct: total   ? Math.round((qualified / total) * 100) : 0 },
    { label: 'Afspraak geboekt',  count: booked,             pct: total   ? Math.round((booked    / total) * 100) : 0 },
    { label: 'Verschenen',        count: verschenenFunnel,   pct: booked  ? Math.round((verschenenFunnel / booked) * 100) : 0, note: 'van geboekt' },
    { label: 'Gewonnen',          count: won,                pct: total   ? Math.round((won / total) * 100) : 0 }
  ];

  const funnelEl = document.getElementById('funnel-content');
  if (funnelEl) {
    funnelEl.innerHTML = funnelSteps.map(s => \`
      <div class="funnel-step">
        <div class="funnel-step-label">
          <span>\${s.label} <strong>\${s.count}</strong>\${s.note ? \`<span style="font-size:10px;color:var(--text-muted);margin-left:4px">(\${s.note})</span>\` : ''}</span>
          <span class="funnel-step-pct">\${s.pct}%</span>
        </div>
        <div class="funnel-bar"><div class="funnel-bar-fill" style="width:\${s.pct}%"></div></div>
      </div>
    \`).join('');
  }

  // Source performance table
  const sourceMap = {};
  leads.forEach(l => {
    const src = l.bron || 'Onbekend';
    if (!sourceMap[src]) sourceMap[src] = { total: 0, qual: 0, scores: [] };
    sourceMap[src].total++;
    if (l.qualified) sourceMap[src].qual++;
    if (l.leadScore) sourceMap[src].scores.push(l.leadScore);
  });

  const sourceEl = document.getElementById('source-table-wrap');
  if (sourceEl) {
    const rows = Object.entries(sourceMap).sort((a,b) => b[1].total - a[1].total).map(([src, d]) => {
      const conv = d.total ? Math.round((d.qual / d.total) * 100) : 0;
      const avg = d.scores.length ? (d.scores.reduce((a,b) => a+b, 0) / d.scores.length).toFixed(1) : '—';
      return \`<tr>
        <td>\${escHtml(src)}</td>
        <td style="text-align:center">\${d.total}</td>
        <td style="text-align:center">\${d.qual}</td>
        <td style="text-align:center">\${conv}%</td>
        <td style="text-align:center">\${avg}</td>
      </tr>\`;
    }).join('');
    sourceEl.innerHTML = \`<table class="source-table">
      <thead><tr>
        <th>Bron</th><th>Totaal</th><th>Gekwal.</th><th>Conversie</th><th>Gem. Score</th>
      </tr></thead>
      <tbody>\${rows || \`<tr><td colspan="5" style="color:var(--text-muted)">Geen data</td></tr>\`}</tbody>
    </table>\`;
  }

  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const gridColor = isLight ? 'rgba(99,102,241,0.06)' : 'rgba(255,255,255,0.05)';
  const tickColor = isLight ? '#5c6478' : '#6a85b0';

  // Days of week chart
  const dayCanvas = document.getElementById('analyse-days-chart');
  if (dayCanvas && typeof Chart !== 'undefined') {
    const dayLabels = ['Ma','Di','Wo','Do','Vr','Za','Zo'];
    const dayCounts = [0,0,0,0,0,0,0];
    leads.forEach(l => {
      if (!l.datum) return;
      const d = new Date(l.datum);
      if (isNaN(d)) return;
      const dow = (d.getDay() + 6) % 7; // 0=Mon
      dayCounts[dow]++;
    });
    if (state.analyseDaysChart) state.analyseDaysChart.destroy();
    state.analyseDaysChart = new Chart(dayCanvas, {
      type: 'bar',
      data: {
        labels: dayLabels,
        datasets: [{ label: 'Leads', data: dayCounts, backgroundColor: 'rgba(99,102,241,0.45)', borderColor: '#818cf8', borderWidth: 1, borderRadius: 6 }]
      },
      options: { responsive: true, plugins: { legend: { display: false } },
        scales: { x: { grid: { color: gridColor }, ticks: { color: tickColor } }, y: { grid: { color: gridColor }, ticks: { color: tickColor, stepSize: 1 }, beginAtZero: true } }
      }
    });
  }

  // Score distribution chart
  const scoreCanvas = document.getElementById('analyse-score-chart');
  if (scoreCanvas && typeof Chart !== 'undefined') {
    const scoreLabels = ['1','2','3','4','5','6','7','8','9','10'];
    const scoreCounts = [0,0,0,0,0,0,0,0,0,0];
    leads.forEach(l => { if (l.leadScore && l.leadScore >= 1 && l.leadScore <= 10) scoreCounts[l.leadScore - 1]++; });
    const scoreColors = scoreLabels.map((_, i) => i >= 7 ? 'rgba(34,197,94,0.5)' : i >= 4 ? 'rgba(245,158,11,0.5)' : 'rgba(244,63,94,0.45)');
    if (state.analyseScoreChart) state.analyseScoreChart.destroy();
    state.analyseScoreChart = new Chart(scoreCanvas, {
      type: 'bar',
      data: {
        labels: scoreLabels,
        datasets: [{ label: 'Leads', data: scoreCounts, backgroundColor: scoreColors, borderRadius: 5 }]
      },
      options: { responsive: true, plugins: { legend: { display: false } },
        scales: { x: { grid: { color: gridColor }, ticks: { color: tickColor } }, y: { grid: { color: gridColor }, ticks: { color: tickColor, stepSize: 1 }, beginAtZero: true } }
      }
    });
  }

  // Hours chart
  const hoursCanvas = document.getElementById('analyse-hours-chart');
  if (hoursCanvas && typeof Chart !== 'undefined') {
    const hourBuckets = ['0-4u','4-8u','8-12u','12-16u','16-20u','20-24u'];
    const hourCounts = [0,0,0,0,0,0];
    leads.forEach(l => {
      if (!l.datum) return;
      const d = new Date(l.datum);
      if (isNaN(d)) return;
      const bucket = Math.min(Math.floor(d.getHours() / 4), 5);
      hourCounts[bucket]++;
    });
    if (state.analyseHoursChart) state.analyseHoursChart.destroy();
    state.analyseHoursChart = new Chart(hoursCanvas, {
      type: 'bar',
      data: {
        labels: hourBuckets,
        datasets: [{ label: 'Leads', data: hourCounts, backgroundColor: 'rgba(6,182,212,0.4)', borderColor: '#06b6d4', borderWidth: 1, borderRadius: 6 }]
      },
      options: { responsive: true, plugins: { legend: { display: false } },
        scales: { x: { grid: { color: gridColor }, ticks: { color: tickColor } }, y: { grid: { color: gridColor }, ticks: { color: tickColor, stepSize: 1 }, beginAtZero: true } }
      }
    });
  }

  // Avg response time
  const rtEl = document.getElementById('analyse-response-val');
  if (rtEl) {
    const rts = leads.map(l => Number(l.responseTime)).filter(n => n > 0);
    const avg = rts.length ? Math.round(rts.reduce((a,b) => a+b, 0) / rts.length) : 0;
    if (avg > 3600) {
      rtEl.textContent = (avg / 3600).toFixed(1) + 'u';
      const lbl = document.querySelector('#analyse-response-wrap .analyse-stat-label');
      if (lbl) lbl.textContent = 'uur gemiddeld';
    } else if (avg > 0) {
      rtEl.textContent = avg;
    } else {
      rtEl.textContent = '—';
    }
  }

  // Conversion summary mini-rows
  const convSummary = document.getElementById('analyse-conv-summary');
  if (convSummary && leads.length > 0) {
    const total   = leads.length;
    const qual    = leads.filter(l => l.qualified).length;
    const booked  = leads.filter(l => l.afspraakGeboekt).length;
    const won     = leads.filter(l => l.status === 'completed' && l.qualified).length;
    const items   = [
      { label: 'Gekwalificeerd', val: qual,   pct: Math.round(qual/total*100),   color: '#6366f1' },
      { label: 'Afspraak',       val: booked, pct: Math.round(booked/total*100), color: '#10b981' },
      { label: 'Gewonnen',       val: won,    pct: Math.round(won/total*100),    color: '#f59e0b' },
    ];
    convSummary.innerHTML = items.map(it => \`
      <div style="display:flex;align-items:center;gap:8px;font-size:12px">
        <span style="color:var(--text-muted);flex:1">\${it.label}</span>
        <div style="flex:2;background:var(--bg-card-alt);border-radius:4px;height:6px;overflow:hidden">
          <div style="width:\${it.pct}%;height:100%;background:\${it.color};border-radius:4px;transition:width 0.4s"></div>
        </div>
        <span style="font-weight:700;color:var(--text);min-width:28px;text-align:right">\${it.val}</span>
      </div>\`).join('');
  }
}

function exportPDF() {
  if (typeof window.jspdf === 'undefined' && typeof window.jsPDF === 'undefined') {
    toast('PDF bibliotheek nog niet geladen, probeer opnieuw', 'error');
    return;
  }
  const { jsPDF } = window.jspdf || window;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const leads = state.leads || [];
  const qualified = leads.filter(l => l.qualified);
  const total = leads.length;
  const now = new Date().toLocaleDateString('nl-NL', { day:'2-digit', month:'long', year:'numeric' });
  const clientName = state.clientName || 'Client';

  // Header
  doc.setFillColor(79, 70, 229);
  doc.rect(0, 0, 210, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Helvaro — Lead Rapport', 14, 12);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(clientName + ' · ' + now, 14, 20);

  // Stats row
  doc.setTextColor(30, 30, 40);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  let y = 38;
  const stats = [
    { label: 'Totaal leads', val: total },
    { label: 'Gekwalificeerd', val: qualified.length },
    { label: 'Afspraken', val: leads.filter(l=>l.afspraakGeboekt).length },
    { label: 'Conversie', val: total ? Math.round(qualified.length/total*100)+'%' : '0%' },
  ];
  stats.forEach((st, i) => {
    const x = 14 + i * 46;
    doc.setFillColor(245, 246, 255);
    doc.roundedRect(x, y, 44, 18, 3, 3, 'F');
    doc.setFontSize(16);
    doc.setFont('helvetica','bold');
    doc.setTextColor(79,70,229);
    doc.text(String(st.val), x + 22, y + 10, { align:'center' });
    doc.setFontSize(8);
    doc.setFont('helvetica','normal');
    doc.setTextColor(100,100,120);
    doc.text(st.label, x + 22, y + 15, { align:'center' });
  });

  // Qualified leads table
  y = 68;
  doc.setFontSize(12);
  doc.setFont('helvetica','bold');
  doc.setTextColor(30,30,40);
  doc.text('Gekwalificeerde Leads', 14, y);
  y += 6;

  // Table header
  doc.setFillColor(79,70,229);
  doc.rect(14, y, 182, 7, 'F');
  doc.setTextColor(255,255,255);
  doc.setFontSize(8);
  doc.setFont('helvetica','bold');
  doc.text('Naam', 16, y+5);
  doc.text('Telefoon', 66, y+5);
  doc.text('Bron', 106, y+5);
  doc.text('Score', 146, y+5);
  doc.text('Datum', 166, y+5);
  y += 7;

  qualified.slice(0, 25).forEach((l, i) => {
    if (y > 270) { doc.addPage(); y = 20; }
    if (i % 2 === 0) { doc.setFillColor(248,248,252); doc.rect(14, y, 182, 7, 'F'); }
    doc.setTextColor(30,30,40);
    doc.setFont('helvetica','normal');
    doc.setFontSize(8);
    const naam = (l.naam || '—').slice(0,28);
    const tel  = (l.telefoon || '—').slice(0,18);
    const bron = (l.bron || '—').slice(0,18);
    const sc   = String(l.leadScore || '—');
    const dat  = l.datum ? new Date(l.datum).toLocaleDateString('nl-NL',{day:'2-digit',month:'2-digit',year:'numeric'}) : '—';
    doc.text(naam, 16, y+5);
    doc.text(tel,  66, y+5);
    doc.text(bron, 106, y+5);
    doc.setFont('helvetica','bold');
    doc.setTextColor(79,70,229);
    doc.text(sc, 152, y+5, { align:'center' });
    doc.setFont('helvetica','normal');
    doc.setTextColor(30,30,40);
    doc.text(dat, 166, y+5);
    y += 7;
  });

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(150,150,160);
  doc.text('Gegenereerd door Helvaro · sindi.s@usehelvaro.pro', 14, 287);

  doc.save('helvaro-rapport-' + new Date().toISOString().slice(0,10) + '.pdf');
  toast('PDF gedownload', 'success');
}

/* ============================================================
   EXPORTS
   ============================================================ */
function updateExportPreview() {
  const periodVal = document.getElementById('export-period')?.value || '30';
  const period = parseInt(periodVal);
  const statusFilter = document.getElementById('export-status')?.value || 'all';
  const leads = state.leads || [];
  const cutoff = periodVal === 'all' || isNaN(period) ? null : new Date(Date.now() - period * 86400000);

  const filtered = leads.filter(l => {
    if (cutoff) {
      const created = l.datum ? new Date(l.datum) : null;
      if (!created || created < cutoff) return false;
    }
    const isQual = l.qualified === true || l.leadScore >= 7;
    if (statusFilter === 'qualified')   return isQual;
    if (statusFilter === 'unqualified') return !isQual;
    return true;
  });

  const countEl = document.getElementById('export-count-num');
  if (countEl) countEl.textContent = filtered.length;

  const total     = filtered.length;
  const qualified = filtered.filter(l => l.qualified === true || l.leadScore >= 7).length;
  const rate      = total > 0 ? Math.round(qualified / total * 100) : 0;
  const scores    = filtered.map(l => l.leadScore).filter(s => typeof s === 'number');
  const avgScore  = scores.length > 0 ? (scores.reduce((a,b) => a+b, 0) / scores.length).toFixed(1) : '—';

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('snap-total',     total);
  set('snap-qualified', qualified);
  set('snap-rate',      rate + '%');
  set('snap-avg-score', avgScore);
}

/* ============================================================
   INSTELLINGEN (SETTINGS)
   ============================================================ */
function renderInstellingen() {
  const s = state;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('set-naam', s.clientName || '—');
  set('set-email', s.userEmail || localStorage.getItem('hv-email') || '—');
  set('set-calendly-url', s.calendlyUrl || '—');

  // API key masked display
  const keyEl = document.getElementById('set-apikey-display');
  const toggleBtn = document.getElementById('btn-toggle-apikey');
  if (keyEl && toggleBtn) {
    const key = s.apiKey || '';
    const masked = key.length > 8 ? key.slice(0, 8) + '••••••••' : '••••••••';
    keyEl.textContent = masked;
    let showing = false;
    toggleBtn.onclick = () => {
      showing = !showing;
      keyEl.textContent = showing ? key : masked;
      toggleBtn.textContent = showing ? 'Verberg' : 'Toon';
    };
  }
}

/* ============================================================
   ACTIVITEIT (ACTIVITY FEED)
   ============================================================ */
function renderActiviteit() {
  const feed = document.getElementById('activity-feed');
  if (!feed) return;

  const events = [];

  state.leads.forEach(l => {
    const baseDate = l.datum ? new Date(l.datum) : null;
    if (baseDate && !isNaN(baseDate)) {
      events.push({ type: 'new', date: baseDate, lead: l });
    }
    if (l.qualified === true && baseDate) {
      events.push({ type: 'qualified', date: new Date(baseDate.getTime() + 1000), lead: l });
    }
    if (l.afspraakGeboekt === true && baseDate) {
      events.push({ type: 'booked', date: new Date(baseDate.getTime() + 2000), lead: l });
    }
    if (l.opgepikt === true && baseDate) {
      events.push({ type: 'won', date: new Date(baseDate.getTime() + 3000), lead: l });
    }
  });

  events.sort((a, b) => b.date - a.date);
  const recent = events.slice(0, 50);

  if (recent.length === 0) {
    feed.innerHTML = \`<div class="activity-item"><div style="color:var(--text-muted);font-size:13px">Nog geen activiteit</div></div>\`;
    return;
  }

  function relTime(date) {
    const diff = Math.floor((Date.now() - date) / 1000);
    if (diff < 60) return 'zojuist';
    if (diff < 3600) return Math.floor(diff / 60) + 'm geleden';
    if (diff < 86400) return Math.floor(diff / 3600) + 'u geleden';
    if (diff < 172800) return 'gisteren';
    return date.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit' });
  }

  const typeMap = {
    new:       { dotCls: 'activity-dot-new',       title: l => \`Nieuwe lead: \${escHtml(l.naam) || '—'}\`,       sub: l => l.telefoon ? \`📞 \${l.telefoon}\` : '' },
    qualified: { dotCls: 'activity-dot-qualified',  title: l => \`Lead gekwalificeerd: \${escHtml(l.naam) || '—'}\`, sub: l => l.leadScore ? \`Score: \${l.leadScore}\` : '' },
    booked:    { dotCls: 'activity-dot-booked',     title: l => \`Afspraak geboekt: \${escHtml(l.naam) || '—'}\`, sub: () => 'Afspraak ingepland via Calendly' },
    won:       { dotCls: 'activity-dot-won',        title: l => \`Lead opgevolgd: \${escHtml(l.naam) || '—'}\`,    sub: l => l.verwachteWaarde ? \`Waarde: \${escHtml(l.verwachteWaarde)}\` : '' }
  };

  feed.innerHTML = recent.map(ev => {
    const tm = typeMap[ev.type];
    if (!tm) return '';
    return \`<div class="activity-item">
      <div class="activity-dot \${tm.dotCls}"></div>
      <div class="activity-content">
        <div class="activity-title">\${tm.title(ev.lead)}</div>
        \${tm.sub(ev.lead) ? \`<div class="activity-sub">\${tm.sub(ev.lead)}</div>\` : ''}
      </div>
      <div class="activity-time">\${relTime(ev.date)}</div>
    </div>\`;
  }).join('');
}

/* ============================================================
   INIT
   ============================================================ */
(async function init() {
  initTheme();

  if (tryAutoLogin()) {
    // Small random delay (0–4s) so multiple tabs opened at once don't all hit
    // Airtable in the same second.  localStorage data renders immediately; the
    // fetch just refreshes it a moment later.
    const lsImmediate = loadLeadsFromLS();
    if (lsImmediate) {
      state.leads = lsImmediate.leads;
      state.stats = lsImmediate.stats || {};
    }
    await new Promise(r => setTimeout(r, Math.random() * 4000));

    // Fetch leads — on rate-limit or error fall back to localStorage so the
    // dashboard shows cached data immediately instead of blank zeros.
    try {
      const data = await fetchLeads();
      if (!data.rateLimited && !data.stale) {
        state.leads    = data.leads || [];
        state.stats    = data.stats || {};
        state.clientName  = state.clientName || data.client?.naam || 'Gebruiker';
        state.lastFetch   = Date.now();
        if (state.leads.length > 0) saveLeadsToLS(state.leads, state.stats);
      } else {
        // Rate-limited — try localStorage first, then accept empty state
        const lsCache = loadLeadsFromLS();
        if (lsCache) { state.leads = lsCache.leads; state.stats = lsCache.stats || {}; }
        else { state.leads = []; state.stats = {}; }
        state.lastFetch = 0;
      }
    } catch {
      // Network error — same localStorage fallback
      const lsCache = loadLeadsFromLS();
      if (lsCache) { state.leads = lsCache.leads; state.stats = lsCache.stats || {}; }
      else { state.leads = []; state.stats = {}; }
      state.lastFetch = 0;
    }
    // Pass skipRefresh=true — state already populated above, no second Airtable call needed
    await startDashboard(true);
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
    if (dots[current].getAttribute('aria-selected') !== null) dots[current].setAttribute('aria-selected', 'false');
    current = (idx + slides.length) % slides.length;
    slides[current].classList.add('active');
    dots[current].classList.add('active');
    if (dots[current].getAttribute('aria-selected') !== null) dots[current].setAttribute('aria-selected', 'true');
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
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.status(200).send(HTML);
};
