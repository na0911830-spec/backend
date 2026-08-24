/* ═══════════════════════════════════════════════════════════
   payout.js - Excel Workbook Controller & Live Preview
   ═══════════════════════════════════════════════════════════ */

let payoutPreviewData = [];

function togglePayoutDateInputs() {
  const mode = document.getElementById('payout-mode-select').value;
  const daysGroup = document.getElementById('payout-days-group');
  const rangeGroup = document.getElementById('payout-range-group');

  if (mode === 'days') {
    if (daysGroup) daysGroup.style.display = 'flex';
    if (rangeGroup) rangeGroup.style.display = 'none';
  } else if (mode === 'range') {
    if (daysGroup) daysGroup.style.display = 'none';
    if (rangeGroup) rangeGroup.style.display = 'flex';
  } else {
    if (daysGroup) daysGroup.style.display = 'none';
    if (rangeGroup) rangeGroup.style.display = 'none';
  }
  previewPayoutData();
}

function getPayoutExportParams() {
  const mode = document.getElementById('payout-mode-select') ? document.getElementById('payout-mode-select').value : 'days';
  let url = '/api/export-payout?';

  if (mode === 'days') {
    const days = document.getElementById('payout-days') ? document.getElementById('payout-days').value : 6;
    url += `days=${encodeURIComponent(days || 6)}`;
  } else if (mode === 'range') {
    const sDate = document.getElementById('payout-start-date') ? document.getElementById('payout-start-date').value : '';
    const eDate = document.getElementById('payout-end-date') ? document.getElementById('payout-end-date').value : '';
    url += `start_date=${encodeURIComponent(sDate)}&end_date=${encodeURIComponent(eDate)}`;
  } else {
    url += 'days=0';
  }
  return url;
}

function downloadPayoutExcel() {
  const url = getPayoutExportParams();
  window.location.href = url;
}

async function previewPayoutData() {
  const tbody = document.getElementById('payout-preview-tbody');
  if (!tbody) return;

  if (typeof allInventoryData !== 'undefined' && allInventoryData.length > 0) {
    processAndRenderPayoutGrid(allInventoryData);
  } else {
    tbody.innerHTML = `<tr><td colspan="13" style="text-align:center; padding:30px; color:var(--muted);"><i class="fa-solid fa-spinner fa-spin"></i> Loading workbook data...</td></tr>`;
    try {
      const res = await fetch('/api/inventory');
      const data = await res.json();
      allInventoryData = data;
      processAndRenderPayoutGrid(data);
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="13" style="text-align:center; padding:20px; color:var(--danger);">Failed to load preview.</td></tr>`;
    }
  }
}

function processAndRenderPayoutGrid(data) {
  const mode = document.getElementById('payout-mode-select') ? document.getElementById('payout-mode-select').value : 'days';
  const daysVal = parseInt(document.getElementById('payout-days') ? document.getElementById('payout-days').value : '6', 10);
  const sDate = document.getElementById('payout-start-date') ? document.getElementById('payout-start-date').value : '';
  const eDate = document.getElementById('payout-end-date') ? document.getElementById('payout-end-date').value : '';

  // Filter for due items
  let dueList = (data || []).filter(item => {
    const st = String(item.status || '').toLowerCase();
    if (st === 'paid' || st === 'rejected') return false;

    const itemDateStr = item.created_at_str ? item.created_at_str.substring(0, 10) : '';
    if (mode === 'days' && !isNaN(daysVal)) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - daysVal);
      const targetStr = targetDate.toISOString().substring(0, 10);
      if (itemDateStr > targetStr) return false;
    } else if (mode === 'range') {
      if (sDate && itemDateStr < sDate) return false;
      if (eDate && itemDateStr > eDate) return false;
    }
    return true;
  });

  // Sort grouped by phone then date
  dueList.sort((a, b) => {
    const pA = String(a.phone_number || '');
    const pB = String(b.phone_number || '');
    if (pA !== pB) return pA.localeCompare(pB);
    return (b.created_at_str || '').localeCompare(a.created_at_str || '');
  });

  payoutPreviewData = dueList;
  renderPayoutGridTable(dueList);
}

function renderPayoutGridTable(list) {
  const tbody = document.getElementById('payout-preview-tbody');
  const totalEl = document.getElementById('excel-preview-total');
  if (!tbody) return;

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="13" style="text-align:center; padding:24px; color:var(--muted);">No pending payout records found for the selected filter.</td></tr>`;
    if (totalEl) totalEl.innerText = '₹0.00';
    return;
  }

  // Count duplicate phone / upi frequencies
  const phoneCounts = {};
  const upiCounts = {};
  list.forEach(r => {
    const p = String(r.phone_number || '').trim();
    const u = String(r.payment_details || '').trim();
    if (p) phoneCounts[p] = (phoneCounts[p] || 0) + 1;
    if (u) upiCounts[u] = (upiCounts[u] || 0) + 1;
  });

  let grandTotal = 0;
  let rowsHtml = '';
  let rowCounter = 1;

  list.forEach(item => {
    const phone = String(item.phone_number || '—').trim();
    const upi = String(item.payment_details || '—').trim();
    const isDupPhone = phone && phoneCounts[phone] > 1;
    const isDupUpi = upi && upiCounts[upi] > 1;
    const itemAmt = parseFloat(item.total_amount) || 0;
    grandTotal += itemAmt;

    let codeRows = [];
    if (item.code_details && item.code_details.length > 0) {
      codeRows = item.code_details;
    } else {
      const splitCodes = String(item.gift_card_code || '').split(/[\n,\s;]+/).filter(Boolean);
      codeRows = splitCodes.map(c => ({ code: c, c_status: item.c_status || 'unsold' }));
    }
    if (codeRows.length === 0) codeRows = [{ code: '—', c_status: 'unsold' }];

    codeRows.forEach((cd, cIdx) => {
      const rawSt = String(cd.c_status || 'unsold').toLowerCase();
      const normSt = (rawSt === 'ununsold' || !rawSt) ? 'unsold' : rawSt;
      
      let stBadge = `<span class="status-dot status-${normSt}"></span> ${normSt.toUpperCase()}`;
      if (normSt === 'sold') stBadge = `<span class="badge badge-success">SOLD</span>`;
      else if (normSt === 'listed') stBadge = `<span class="badge badge-yellow">LISTED</span>`;
      else if (normSt === 'rejected') stBadge = `<span class="badge badge-danger">REJECTED</span>`;
      else stBadge = `<span class="badge" style="background:#fff3cd; color:#856404;">UNSOLD</span>`;

      rowsHtml += `
        <tr>
          <td class="excel-row-num">${rowCounter}</td>
          <td>${cIdx === 0 ? (item.created_at_str || '—') : ''}</td>
          <td class="${isDupPhone && cIdx === 0 ? 'cell-dup-phone' : ''}" title="${isDupPhone ? 'Duplicate Phone Number across records' : ''}">
            ${cIdx === 0 ? phone : ''}
          </td>
          <td class="${isDupUpi && cIdx === 0 ? 'cell-dup-upi' : ''}" title="${isDupUpi ? 'Duplicate UPI ID across records' : ''}">
            ${cIdx === 0 ? upi : ''}
          </td>
          <td>${cIdx === 0 ? (item.order_id || '—') : ''}</td>
          <td>${item.gift_card_name || '—'}</td>
          <td style="font-family:'JetBrains Mono',monospace; font-size:11px;">${cd.code || '—'}</td>
          <td style="text-align:center;">${stBadge}</td>
          <td>${item.platform || '—'}</td>
          <td>${item.slot || '—'}</td>
          <td>${cIdx === 0 ? (item.payout_term_days ? item.payout_term_days + 'D' : '6D') : ''}</td>
          <td style="text-align:right; font-weight:600; font-family:'JetBrains Mono',monospace;">
            ${cIdx === 0 ? '₹' + itemAmt.toFixed(2) : ''}
          </td>
          <td>${cIdx === 0 ? `<span class="badge badge-old">${String(item.status || 'unpaid').toUpperCase()}</span>` : ''}</td>
        </tr>
      `;
      rowCounter++;
    });
  });

  tbody.innerHTML = rowsHtml;
  if (totalEl) totalEl.innerText = '₹' + grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function filterPayoutPreviewTable() {
  const q = (document.getElementById('payout-preview-search') ? document.getElementById('payout-preview-search').value : '').toLowerCase().trim();
  if (!q) {
    renderPayoutGridTable(payoutPreviewData);
    return;
  }
  const filtered = payoutPreviewData.filter(item => {
    const p = String(item.phone_number || '').toLowerCase();
    const u = String(item.payment_details || '').toLowerCase();
    const c = String(item.gift_card_code || '').toLowerCase();
    const o = String(item.order_id || '').toLowerCase();
    return p.includes(q) || u.includes(q) || c.includes(q) || o.includes(q);
  });
  renderPayoutGridTable(filtered);
}

// Hook tab switch to automatically render preview when switching to payout tab
const origSwitchTab = window.switchTab;
if (typeof origSwitchTab === 'function') {
  window.switchTab = function(tabName) {
    origSwitchTab(tabName);
    if (tabName === 'payout') {
      setTimeout(previewPayoutData, 50);
    }
  };
} else {
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('nav-payout');
    if (btn) btn.addEventListener('click', () => setTimeout(previewPayoutData, 50));
  });
}
