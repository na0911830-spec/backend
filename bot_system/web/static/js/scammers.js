/* ═══════════════════════════════════════════════════════════
   scammers.js - Scammer Shield & Blacklist Controller
   ═══════════════════════════════════════════════════════════ */

async function fetchScammers(btnEl) {
  if (btnEl) btnEl.classList.add('spinning');
  showSpinner('Loading scammers...');
  try {
    const data = await fetch('/api/scammers').then(r => r.json());
    const tbody = document.getElementById('scammers-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--subtle);padding:clamp(12px,1.5vh,20px);">No records found.</td></tr>`;
      return;
    }
    data.forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="mono">${item.created_at_str}</td>
        <td class="fw-bold">${item.phone_number || '—'}</td>
        <td class="mono">${item.payment_details || '—'}</td>
        <td><span class="code-pill scammer">${item.flagged_code || '—'}</span></td>
        <td class="text-danger fw-bold">${item.reason}</td>
        <td>
          <button
            class="btn btn-danger"
            style="height:clamp(20px,2vh,26px);padding:0 clamp(6px,0.55vw,9px);"
            title="Remove 1 entry duplicate"
            onclick="deleteScammerPermanently(${item.id})"
          >
            <i class="fa-solid fa-trash"></i> Delete
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } finally {
    hideSpinner();
    if (btnEl) setTimeout(() => btnEl.classList.remove('spinning'), 400);
  }
}

async function deleteScammerPermanently(id) {
  if (!confirm('Remove this scammer entry?')) return;
  showSpinner('Deleting entry...');
  try {
    const res = await fetch('/api/scammer/delete-permanently', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    }).then(r => r.json());
    if (res.success) {
      await fetchScammers();
      if (typeof fetchInventory === 'function') await fetchInventory();
    } else {
      alert(res.error || 'Failed to delete entry.');
    }
  } finally { hideSpinner(); }
}
