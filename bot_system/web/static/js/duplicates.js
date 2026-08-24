/* ═══════════════════════════════════════════════════════════
   duplicates.js - Duplicate Code Conflicts & Selective Resolution
   ═══════════════════════════════════════════════════════════ */

async function fetchDuplicates(btnEl) {
  if (btnEl) btnEl.classList.add('spinning');
  showSpinner('Checking for duplicate codes...');
  try {
    const res = await fetch('/api/duplicates').then(r => r.json());
    const container = document.getElementById('duplicates-container');
    const badgeEl = document.getElementById('dup-badge-count');
    const dups = (res.success && res.duplicates) ? res.duplicates : [];

    if (badgeEl) {
      if (dups.length > 0) {
        badgeEl.textContent = dups.length;
        badgeEl.style.display = 'inline-block';
      } else {
        badgeEl.style.display = 'none';
      }
    }

    if (!container) return;
    container.innerHTML = '';

    if (dups.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding: 40px 20px; color: var(--subtle);">
          <i class="fa-solid fa-circle-check" style="font-size:36px; color:var(--success); margin-bottom:12px; display:block;"></i>
          <div style="font-size:16px; font-weight:600; color:var(--text-main);">No Duplicate Codes Detected</div>
          <div style="font-size:12px; margin-top:4px;">All active codes in submissions and blacklist are unique!</div>
        </div>
      `;
      return;
    }

    dups.forEach(group => {
      const card = document.createElement('div');
      card.className = 'panel';
      card.style.border = '1px solid rgba(239, 68, 68, 0.35)';
      card.style.background = 'var(--surface-raised)';
      card.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)';

      const entriesHTML = group.entries.map(entry => {
        const isScammer = entry.row_source === 'scammer';
        const cardNameBadge = getCardNameBadge(entry.gift_card_name);
        const otherCodes = entry.all_codes.filter(c => c !== group.code);
        const otherCodesHTML = otherCodes.length > 0
          ? `<div style="margin-top:6px; font-size:11px; color:var(--subtle);">Other code(s) in this entry: ${otherCodes.map(c => `<span class="code-pill">${c}</span>`).join(' ')}</div>`
          : '<div style="margin-top:6px; font-size:11px; color:var(--subtle);">Only this 1 code in entry</div>';

        return `
          <div style="flex:1; min-width:280px; background:var(--surface); border:1px solid var(--border); border-radius:var(--r-sm, 6px); padding:12px; display:flex; flex-direction:column; justify-content:space-between; gap:10px;">
            <div>
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <span class="badge" style="background:${isScammer ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)'}; color:${isScammer ? 'var(--danger)' : 'var(--primary)'}; font-weight:700;">
                  ${isScammer ? 'Blacklisted Record #' + entry.id : 'Submission #' + entry.id}
                </span>
                <span class="mono" style="font-size:11px; color:var(--subtle);">${entry.created_at_str}</span>
              </div>

              <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px; font-size:12px; margin-bottom:8px;">
                <div><span style="color:var(--subtle);">Phone:</span> <strong>${entry.phone_number || '—'}</strong></div>
                <div><span style="color:var(--subtle);">Card:</span> ${cardNameBadge}</div>
                <div><span style="color:var(--subtle);">Amount:</span> <strong>${entry.currency || 'Rs.'}${entry.total_amount}</strong></div>
                <div><span style="color:var(--subtle);">Status:</span> <strong>${entry.status || '—'}</strong></div>
              </div>

              ${otherCodesHTML}
            </div>

            <div style="display:flex; gap:8px; margin-top:10px; border-top:1px solid var(--border); padding-top:10px;">
              <button class="btn btn-default" style="flex:1; justify-content:center; height:28px; font-size:11px; color:var(--danger); border-color:var(--danger)40;"
                title="Remove only code '${group.code}' from this entry (keeps other codes intact)"
                onclick="deleteDuplicateCode(${entry.id}, '${entry.row_source}', '${group.code.replace(/'/g, "\\'")}')">
                <i class="fa-solid fa-scissors"></i> Delete Code Only
              </button>
              <button class="btn btn-danger" style="flex:1; justify-content:center; height:28px; font-size:11px;"
                title="Delete / reject the entire entry"
                onclick="deleteDuplicateEntireSubmission(${entry.id}, '${entry.row_source}')">
                <i class="fa-solid fa-trash"></i> Delete Entry
              </button>
            </div>
          </div>
        `;
      }).join('');

      card.innerHTML = `
        <div style="padding:10px 14px; background:rgba(239,68,68,0.1); border-bottom:1px solid rgba(239,68,68,0.2); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-weight:700; font-size:12px; color:var(--danger); text-transform:uppercase; letter-spacing:0.5px;">
              <i class="fa-solid fa-triangle-exclamation"></i> Duplicate Code:
            </span>
            <span class="code-pill scammer" style="font-size:13px; font-weight:700; padding:3px 10px;">${group.code}</span>
            <button class="copy-code-btn" title="Copy code" onclick="copyToClipboard(this, '${group.code.replace(/'/g, "\\'")}')">
              <i class="fa-regular fa-copy"></i>
            </button>
          </div>
          <span class="badge" style="background:var(--danger); color:#fff; font-size:11px; padding:2px 8px;">
            Found in ${group.occurrences} Entries
          </span>
        </div>
        <div style="padding:12px; display:flex; flex-wrap:wrap; gap:12px;">
          ${entriesHTML}
        </div>
      `;
      container.appendChild(card);
    });
  } finally {
    hideSpinner();
    if (btnEl) setTimeout(() => btnEl.classList.remove('spinning'), 400);
  }
}

async function deleteDuplicateCode(id, source, code) {
  if (!confirm(`Delete only code "${code}" from entry #${id}? (Other codes in this entry will remain intact)`)) return;
  showSpinner(`Removing code ${code}...`);
  try {
    const res = await fetch('/api/duplicate/delete-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, source, code })
    }).then(r => r.json());
    if (res.success) {
      await fetchDuplicates();
      await fetchInventory();
    } else {
      alert(res.error || 'Failed to remove code.');
    }
  } finally { hideSpinner(); }
}

async function deleteDuplicateEntireSubmission(id, source) {
  if (!confirm(`Permanently delete/reject entry #${id}?`)) return;
  showSpinner('Deleting entry...');
  try {
    let url = '/api/submission/delete';
    if (source === 'scammer') url = '/api/scammer/delete-permanently';
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, source })
    }).then(r => r.json());
    if (res.success) {
      await fetchDuplicates();
      await fetchInventory();
    } else {
      alert(res.error || 'Failed to delete entry.');
    }
  } finally { hideSpinner(); }
}
