(function () {
  'use strict';

  const scriptTag = document.currentScript ||
    Array.from(document.querySelectorAll('script')).find(s => s.src && s.src.includes('form-widget'));
  const PROJECT_CODE = (scriptTag && scriptTag.getAttribute('data-project')) || 'HELVARO';
  const API = 'https://helvaro.vercel.app/api/form';

  const style = document.createElement('style');
  style.textContent = [
    "@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@600;700&family=Inter:wght@400;500;600&display=swap');",
    "#hv-widget-btn{position:fixed;bottom:24px;right:24px;width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#1e6fd9,#00d4ff);border:none;cursor:pointer;box-shadow:0 4px 20px rgba(30,111,217,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;transition:transform .2s,box-shadow .2s}",
    "#hv-widget-btn:hover{transform:scale(1.08);box-shadow:0 6px 28px rgba(30,111,217,0.7)}",
    "#hv-widget-btn svg{width:26px;height:26px}",
    "#hv-overlay{position:fixed;inset:0;background:rgba(3,8,18,0.85);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);z-index:10000;display:none;align-items:center;justify-content:center;padding:16px}",
    "#hv-overlay.hv-open{display:flex}",
    "#hv-card{background:#060e1f;border:1px solid rgba(30,111,217,0.4);border-radius:16px;padding:32px;width:100%;max-width:400px;box-shadow:0 0 60px rgba(30,111,217,0.15);position:relative;animation:hvSlideUp .25s ease;font-family:'Inter',sans-serif}",
    "@keyframes hvSlideUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}",
    "#hv-close{position:absolute;top:14px;right:14px;background:rgba(255,255,255,0.06);border:none;color:#6a85b0;width:28px;height:28px;border-radius:7px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;transition:background .15s,color .15s}",
    "#hv-close:hover{background:rgba(255,69,96,0.15);color:#ff4560}",
    ".hv-logo{text-align:center;margin-bottom:6px}",
    ".hv-logo-text{font-family:'Orbitron',monospace;font-size:22px;font-weight:700;background:linear-gradient(135deg,#fff,#00d4ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;letter-spacing:2px}",
    ".hv-subtitle{text-align:center;color:#6a85b0;font-size:13px;margin-bottom:24px;line-height:1.5}",
    ".hv-label{display:block;font-size:11px;font-weight:600;color:#00d4ff;letter-spacing:1.2px;text-transform:uppercase;margin-bottom:7px}",
    ".hv-input{width:100%;background:#0a1628;border:1px solid rgba(30,111,217,0.2);border-radius:8px;padding:12px 14px;color:#e8f0ff;font-size:14px;font-family:'Inter',sans-serif;margin-bottom:16px;outline:none;box-sizing:border-box;transition:border-color .15s,box-shadow .15s}",
    ".hv-input:focus{border-color:rgba(43,143,255,0.6);box-shadow:0 0 0 3px rgba(43,143,255,0.1)}",
    ".hv-input::placeholder{color:#3d5070}",
    "#hv-submit{width:100%;background:linear-gradient(135deg,#1e6fd9,#0099cc);color:#fff;border:none;border-radius:8px;padding:13px;font-weight:600;font-size:14px;font-family:'Inter',sans-serif;cursor:pointer;letter-spacing:.5px;transition:box-shadow .2s,transform .15s,opacity .15s;margin-top:4px}",
    "#hv-submit:hover:not(:disabled){box-shadow:0 0 20px rgba(30,111,217,0.4)}",
    "#hv-submit:active:not(:disabled){transform:scale(0.98)}",
    "#hv-submit:disabled{opacity:.65;cursor:not-allowed}",
    "#hv-success{text-align:center;display:none;padding:12px 0 4px}",
    ".hv-check{width:56px;height:56px;background:rgba(0,229,160,0.12);border:2px solid rgba(0,229,160,0.35);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:24px}",
    ".hv-success-msg{color:#e8f0ff;font-size:14px;line-height:1.6}",
    ".hv-success-msg strong{color:#00e5a0}",
    "#hv-error{color:#ff4560;font-size:12px;margin-top:10px;padding:10px 12px;background:rgba(255,69,96,0.1);border:1px solid rgba(255,69,96,0.2);border-radius:8px;display:none}",
  ].join('');
  document.head.appendChild(style);

  const wrapper = document.createElement('div');
  wrapper.innerHTML = '<button id="hv-widget-btn" aria-label="Contact opnemen"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z" fill="white"/></svg></button><div id="hv-overlay" role="dialog" aria-modal="true" aria-label="Contact formulier"><div id="hv-card"><button id="hv-close" aria-label="Sluiten">\u2715</button><div class="hv-logo"><div class="hv-logo-text">HELVARO</div></div><p class="hv-subtitle">Vul je gegevens in en wij nemen<br>contact op via WhatsApp</p><div id="hv-form"><label class="hv-label" for="hv-naam">Naam</label><input class="hv-input" id="hv-naam" type="text" placeholder="Jouw naam" required autocomplete="name"><label class="hv-label" for="hv-tel">Telefoonnummer</label><input class="hv-input" id="hv-tel" type="tel" placeholder="0478 12 34 56" required autocomplete="tel"><button id="hv-submit">VERSTUUR</button><div id="hv-error"></div></div><div id="hv-success"><div class="hv-check">\u2713</div><p class="hv-success-msg"><strong>Bedankt!</strong><br>We nemen binnenkort contact op via WhatsApp. \U0001f4ac</p></div></div></div>';
  document.body.appendChild(wrapper);

  const btn     = document.getElementById('hv-widget-btn');
  const overlay = document.getElementById('hv-overlay');
  const closeBtn= document.getElementById('hv-close');
  const form    = document.getElementById('hv-form');
  const submit  = document.getElementById('hv-submit');
  const success = document.getElementById('hv-success');
  const errEl   = document.getElementById('hv-error');
  const naamEl  = document.getElementById('hv-naam');
  const telEl   = document.getElementById('hv-tel');

  const openModal  = () => { overlay.classList.add('hv-open'); naamEl.focus(); };
  const closeModal = () => overlay.classList.remove('hv-open');

  btn.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
  [naamEl, telEl].forEach(el => el.addEventListener('keydown', e => { if (e.key === 'Enter') handleSubmit(); }));
  submit.addEventListener('click', handleSubmit);

  async function handleSubmit() {
    errEl.style.display = 'none';
    const name  = naamEl.value.trim();
    const phone = telEl.value.trim();
    if (!name || !phone) {
      errEl.textContent  = 'Vul je naam en telefoonnummer in.';
      errEl.style.display = 'block';
      return;
    }
    submit.textContent = 'VERSTUREN...';
    submit.disabled    = true;
    try {
      const resp = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, project_code: PROJECT_CODE, bron: 'Website' }),
      });
      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}));
        throw new Error(d.error || 'Serverfout');
      }
      form.style.display    = 'none';
      success.style.display = 'block';
    } catch (err) {
      errEl.textContent   = 'Oeps, er ging iets mis. Probeer het opnieuw.';
      errEl.style.display = 'block';
      submit.textContent  = 'VERSTUUR';
      submit.disabled     = false;
    }
  }
})();
