/* ═══════════════════════════════════════════════════════════
   danger.js - Danger Zone & Database Reset Controller
   ═══════════════════════════════════════════════════════════ */

async function resetAllData() {
  const passkey = document.getElementById('danger-passkey').value;
  if (!passkey) { alert('Passkey required.'); return; }
  if (!confirm('This will permanently wipe ALL data. Confirm?')) return;
  showSpinner();
  try {
    const data = await fetch('/api/danger/reset-db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passkey })
    }).then(r => r.json());
    if (data.success) {
      alert('Database wiped successfully.');
      document.getElementById('danger-passkey').value = '';
      switchTab('dashboard');
    } else {
      alert(data.error || 'Reset failed.');
    }
  } finally { hideSpinner(); }
}
