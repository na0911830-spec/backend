/* ═══════════════════════════════════════════════════════════
   dashboard.js - Dashboard Metrics & Today's Submissions
   ═══════════════════════════════════════════════════════════ */

async function fetchMetrics(btnEl) {
  if (btnEl) btnEl.classList.add('spinning');
  showSpinner('Loading metrics...');
  try {
    const data = await fetch('/api/metrics').then(r => r.json());

    document.getElementById('metric-today-codes').textContent = data.today_codes;
    document.getElementById('metric-total-payout').textContent = `₹${data.total_payout.toLocaleString()}`;
    document.getElementById('metric-payout-breakdown').textContent = `₹${data.term_6_total.toLocaleString()} / ₹${data.term_1_total.toLocaleString()}`;
    document.getElementById('metric-unique-upis').textContent = `${data.unique_upis} / ${data.unique_suppliers}`;
    document.getElementById('metric-unpaid-cnt').textContent = data.total_unpaid;
    document.getElementById('metric-listed-cnt').textContent = data.total_listed;
    document.getElementById('metric-sold-cnt').textContent = data.total_sold;

    const tbody = document.getElementById('today-codes-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (data.today_list && data.today_list.length > 0) {
      data.today_list.forEach(item => {
        const codes = (item.gift_card_code || '').split(/[\n,\s;]+/).map(c => c.trim()).filter(Boolean);
        const codesHTML = `<div class="codes-list">${codes.map((c, i) => `<span class="code-pill"><span class="pill-idx">#${i + 1}</span>${c}</span>`).join('')}</div>`;
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="mono">${item.created_at_str}</td>
          <td class="fw-bold">${item.phone_number || '—'}</td>
          <td>${item.gift_card_name || '—'}</td>
          <td>${codesHTML}</td>
          <td class="mono">
            ${item.payment_details ? `
              <div style="display:flex;align-items:center;gap:4px;">
                <span class="mono" style="max-width:clamp(85px,9vw,140px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${item.payment_details}">${item.payment_details}</span>
                <button class="copy-code-btn" title="Copy Payment Details" onclick="copyToClipboard(this, '${item.payment_details.replace(/'/g, "\\'")}')">
                  <i class="fa-regular fa-copy"></i>
                </button>
              </div>
            ` : '<span class="text-muted">—</span>'}
          </td>
          <td class="fw-bold">${item.currency || 'Rs.'}${item.total_amount}</td>
          <td>${statusDot(item.status)}</td>
        `;
        tbody.appendChild(tr);
      });
    } else {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--subtle);padding:clamp(12px,1.5vh,20px);">No codes received today yet.</td></tr>`;
    }
  } finally {
    hideSpinner();
    if (btnEl) setTimeout(() => btnEl.classList.remove('spinning'), 400);
  }
}
