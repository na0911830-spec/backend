/* ═══════════════════════════════════════════════════════════
   common.js - Shared Utilities, Theme, Sidebar, & Statuses
   ═══════════════════════════════════════════════════════════ */

/* ── Sidebar Collapse ── */
(function () {
  const isCollapsed = localStorage.getItem('sidebar_collapsed') === 'true';
  if (isCollapsed) {
    document.addEventListener('DOMContentLoaded', () => {
      const sb = document.getElementById('app-sidebar');
      if (sb) sb.classList.add('collapsed');
    });
  }
})();

function toggleSidebar() {
  const sb = document.getElementById('app-sidebar');
  if (!sb) return;
  sb.classList.toggle('collapsed');
  localStorage.setItem('sidebar_collapsed', sb.classList.contains('collapsed'));
}

/* ── Theme ── */
(function () {
  const saved = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
  updateThemeButton(theme);
})();

function updateThemeButton(theme) {
  const icon = document.getElementById('theme-icon');
  const label = document.getElementById('theme-label');
  if (!icon || !label) return;
  if (theme === 'dark') {
    icon.innerHTML = '<use href="#ic-sun"/>';
    label.textContent = 'Light Mode';
  } else {
    icon.innerHTML = '<use href="#ic-moon"/>';
    label.textContent = 'Dark Mode';
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  updateThemeButton(next);
}

/* ── Spinner & Save Status Popup ── */
let spinnerTimeout;
function showSpinner(msg = 'Loading data...') {
  clearTimeout(spinnerTimeout);
  const textEl = document.getElementById('save-status-text');
  const iconEl = document.getElementById('save-status-icon');
  if (textEl) textEl.textContent = msg;
  if (iconEl) {
    iconEl.className = 'status-spinner-icon';
    iconEl.style.cssText = '';
    iconEl.innerHTML = '';
  }

  const bar = document.getElementById('progress-bar-line');
  if (bar) {
    bar.style.display = 'block';
    bar.style.animation = 'none';
    bar.offsetHeight; // reflow
    bar.style.animation = '';
  }
  const overlay = document.getElementById('global-spinner-overlay');
  if (overlay) overlay.classList.add('active');
}

function hideSpinner(successMsg = 'Done!') {
  clearTimeout(spinnerTimeout);
  const textEl = document.getElementById('save-status-text');
  const iconEl = document.getElementById('save-status-icon');
  if (textEl) textEl.textContent = successMsg;
  if (iconEl) {
    iconEl.className = '';
    iconEl.innerHTML = '✓';
    iconEl.style.cssText = 'color:var(--success);font-weight:bold;font-size:15px;line-height:1;';
  }

  spinnerTimeout = setTimeout(() => {
    const bar = document.getElementById('progress-bar-line');
    if (bar) bar.style.display = 'none';
    const overlay = document.getElementById('global-spinner-overlay');
    if (overlay) overlay.classList.remove('active');
  }, 400);
}

function copyToClipboard(btn, text) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    btn.classList.add('copied');
    const origIcon = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-check"></i>';
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = origIcon;
    }, 1500);
  }).catch(err => {
    console.error('Copy failed', err);
  });
}

const PREDEFINED_CARD_NAMES = [
  "PSN 1000", "PSN 2000", "PSN 3000", "PSN 4000", "PSN 5000",
  "OV 500", "OV 1000",
  "LOL 100 Rp", "LOL 575 Rp",
  "Roblox 800", "Roblox 1000",
  "MC 330 Coins",
  "PVR Rs.500",
  "Target 5$ Us", "Target 10 $ Us", "Target 15 $ Us",
  "SOT 550 Coins", "SOT 1000 Coins",
  "Amazon Us 5 $", "Amazon Us 10 $",
  "Amazon Germany 5 $", "Amazon Germany 10 $",
  "Amazon France 5 $", "Amazon France 10 $",
  "Best Buy 5 $", "Best Buy 10 $", "Best Buy 15 $",
  "Apple 5$", "Apple 10 $",
  "Walmart 5$", "Walmart 10 $",
  "Amazon India 1000", "Amazon India 500"
];

function getCardNameBadge(name) {
  if (!name || name === '—') return '<span class="text-muted">—</span>';
  const n = name.trim();
  let color = '#2563eb';
  let bg = 'rgba(37,99,235,0.12)';

  if (n.startsWith('PSN')) {
    color = '#3b82f6'; bg = 'rgba(59,130,246,0.15)';
  } else if (n.startsWith('OV')) {
    color = '#D98850'; bg = 'rgba(217,136,80,0.18)';
  } else if (n.startsWith('LOL')) {
    color = '#06b6d4'; bg = 'rgba(6,182,212,0.15)';
  } else if (n.startsWith('Roblox')) {
    color = '#ef4444'; bg = 'rgba(239,68,68,0.15)';
  } else if (n.startsWith('MC')) {
    color = '#10b981'; bg = 'rgba(16,185,129,0.15)';
  } else if (n.startsWith('PVR')) {
    color = '#f59e0b'; bg = 'rgba(245,158,11,0.15)';
  } else if (n.startsWith('Target')) {
    color = '#dc2626'; bg = 'rgba(220,38,38,0.15)';
  } else if (n.startsWith('SOT')) {
    color = '#14b8a6'; bg = 'rgba(20,184,166,0.15)';
  } else if (n.startsWith('Amazon')) {
    color = '#f97316'; bg = 'rgba(249,115,22,0.15)';
  } else if (n.startsWith('Best Buy')) {
    color = '#1d4ed8'; bg = 'rgba(29,78,216,0.15)';
  } else if (n.startsWith('Apple')) {
    color = '#64748b'; bg = 'rgba(100,116,139,0.15)';
  } else if (n.startsWith('Walmart')) {
    color = '#0284c7'; bg = 'rgba(2,132,199,0.15)';
  }

  return `<span style="display:inline-block;padding:2px 8px;border-radius:6px;font-weight:600;font-size:clamp(10px,0.7vw,12px);color:${color};background:${bg};border:1px solid ${color}40;">${n}</span>`;
}

function statusDot(s) {
  const raw = String(s || 'unsold').toLowerCase().trim();
  const normClass = (raw === 'ununsold') ? 'unsold' : raw;
  const label = normClass.charAt(0).toUpperCase() + normClass.slice(1);
  return `<span class="status-dot ${normClass}"><span class="dot"></span>${label}</span>`;
}

function getItemDateStr(item) {
  if (!item) return '';
  if (item.created_at_iso && typeof item.created_at_iso === 'string') {
    const parts = item.created_at_iso.split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(parts)) return parts;
  }
  const raw = String(item.created_at_str || item.created_at || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return raw.substring(0, 10);
  }
  const dmy = raw.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  const dmy2 = raw.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2})/);
  if (dmy2) {
    return `20${dmy2[3]}-${dmy2[2].padStart(2, '0')}-${dmy2[1].padStart(2, '0')}`;
  }
  return '';
}
