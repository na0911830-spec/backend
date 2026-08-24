/* ═══════════════════════════════════════════════════════════
   sview.js - Simplified View (S-View) Controller & Filters
   ═══════════════════════════════════════════════════════════ */

let lastFilteredSView = [];
let fpSViewDate = null;

function applySViewFilters() {
  if (!allInventoryData) return;
  const searchEl = document.getElementById('sview-search');
  const dateEl = document.getElementById('sview-date');
  const cardEl = document.getElementById('sview-card-name');
  const platformEl = document.getElementById('sview-platform');
  const slotEl = document.getElementById('sview-slot');
  const statusEl = document.getElementById('sview-status');

  const queryRaw = searchEl ? searchEl.value.trim() : '';
  const query = queryRaw.toLowerCase();
  const queryClean = queryRaw.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const dateFilter = dateEl ? dateEl.value.trim() : '';
  const cardFilter = cardEl ? cardEl.value.trim().toLowerCase() : '';
  const platFilter = platformEl ? platformEl.value.trim() : '';
  const slotFilter = slotEl ? slotEl.value.trim() : '';
  const cstatusFilter = statusEl ? statusEl.value.trim().toLowerCase() : '';

  let filtered = allInventoryData.filter(item => {
    if (dateFilter) {
      const itemDate = getItemDateStr(item);
      if (itemDate !== dateFilter) return false;
    }
    if (cardFilter) {
      const itemCard = String(item.gift_card_name || '').trim().toLowerCase();
      if (itemCard !== cardFilter) return false;
    }
    if (!matchPlatformOrSlot(item, 'platform', platFilter)) return false;
    if (!matchPlatformOrSlot(item, 'slot', slotFilter)) return false;
    if (!matchCStatus(item, cstatusFilter)) return false;

    if (query) {
      const c = String(item.gift_card_code || '').toLowerCase();
      const cClean = c.replace(/[^a-zA-Z0-9]/g, '');
      const n = String(item.gift_card_name || '').toLowerCase();
      const ord = String(item.order_id || '').toLowerCase();
      const p = String(item.phone_number || '').toLowerCase();

      let matchCode = c.includes(query) || (queryClean.length > 0 && cClean.includes(queryClean));
      if (!matchCode && item.code_details && item.code_details.length > 0) {
        matchCode = item.code_details.some(cd => {
          const codeStr = String(cd.code || '').toLowerCase();
          const codeClean = codeStr.replace(/[^a-zA-Z0-9]/g, '');
          return codeStr.includes(query) || (queryClean.length > 0 && codeClean.includes(queryClean));
        });
      }
      if (!matchCode && !n.includes(query) && !ord.includes(query) && !p.includes(query)) {
        return false;
      }
    }
    return true;
  });

  filtered.sort((a, b) => {
    const isPaidA = String(a.status || '').toLowerCase() === 'paid' ? 1 : 0;
    const isPaidB = String(b.status || '').toLowerCase() === 'paid' ? 1 : 0;
    if (isPaidA !== isPaidB) return isPaidA - isPaidB;

    const nameA = String(a.gift_card_name || '').toLowerCase();
    const nameB = String(b.gift_card_name || '').toLowerCase();
    if (nameA !== nameB) return nameA.localeCompare(nameB);

    const da = a.created_at_iso ? new Date(a.created_at_iso).getTime() : 0;
    const db = b.created_at_iso ? new Date(b.created_at_iso).getTime() : 0;
    return db - da;
  });

  lastFilteredSView = filtered;
  renderSViewTable(filtered);
  if (typeof updateSelectedCountUI === 'function') updateSelectedCountUI();

  // Update S-View filtered entries and codes counters
  const activeCStatus = (typeof getActiveCStatusFilter === 'function') ? getActiveCStatusFilter('sview') : '';
  const entriesCount = filtered.length;
  let totalCodesCount = 0;
  filtered.forEach(item => {
    if (item.code_details && item.code_details.length > 0) {
      if (activeCStatus) {
        totalCodesCount += item.code_details.filter(cd => {
          const cdStRaw = normalizeStr(cd.c_status !== undefined && cd.c_status !== null && cd.c_status !== '' ? cd.c_status : item.c_status);
          const cdStNorm = (!cdStRaw || cdStRaw === 'ununsold' || cdStRaw === 'unsold') ? 'unsold' : cdStRaw;
          return cdStNorm === activeCStatus;
        }).length;
      } else {
        totalCodesCount += item.code_details.length;
      }
    } else if (item.gift_card_code) {
      const splitCodes = String(item.gift_card_code).split(/[\n,\s;]+/).map(c => c.trim()).filter(Boolean);
      totalCodesCount += splitCodes.length;
    }
  });

  const entriesEl = document.getElementById('sview-entries-count');
  const codesEl = document.getElementById('sview-codes-count');
  if (entriesEl) entriesEl.innerText = entriesCount;
  if (codesEl) codesEl.innerText = totalCodesCount;
}

function renderSViewTable(data) {
  const tbody = document.getElementById('sview-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:var(--subtle);padding:clamp(12px,1.5vh,20px);">No records match the filter.</td></tr>`;
    return;
  }

  data.forEach(item => {
    let codesHTML = '<span class="text-muted">—</span>';
    let platformCellHTML = '';
    let slotCellHTML = '';
    let cStatusCellHTML = '';

    if (item.code_details && item.code_details.length > 0) {
      const activeCStatus = (typeof getActiveCStatusFilter === 'function') ? getActiveCStatusFilter('sview') : '';
      const visibleCodeDetails = activeCStatus ? item.code_details.filter(cd => {
        const cdStRaw = normalizeStr(cd.c_status !== undefined && cd.c_status !== null && cd.c_status !== '' ? cd.c_status : item.c_status);
        const cdStNorm = (!cdStRaw || cdStRaw === 'ununsold' || cdStRaw === 'unsold') ? 'unsold' : cdStRaw;
        return cdStNorm === activeCStatus;
      }) : item.code_details;

      const targetCodeDetails = visibleCodeDetails.length > 0 ? visibleCodeDetails : item.code_details;

      codesHTML = `<div class="codes-list">${targetCodeDetails.map(cd => {
        const c = cd.code;
        return `
          <div class="code-row">
            <span class="code-pill ${item.is_scammer ? 'scammer' : ''}">${c}</span>
            <button class="copy-code-btn" title="Copy code" onclick="copyToClipboard(this, '${c.replace(/'/g, "\\'")}')">
              <i class="fa-regular fa-copy"></i>
            </button>
          </div>`;
      }).join('')}</div>`;

      platformCellHTML = `<div style="display:flex;flex-direction:column;gap:4px;">${targetCodeDetails.map(cd => {
        const c = cd.code;
        const plat = cd.platform || 'test1';
        const platformOpts = (appConfig.platforms || ['test1']).map(p => `<option value="${p}" ${p === plat ? 'selected' : ''}>${p}</option>`).join('');
        return `
          <select class="status-select" title="Platform" style="height:22px;padding:0 4px;font-size:10px;" onchange="stageSingleCodeMeta(${item.id}, '${c.replace(/'/g, "\\'")}', 'platform', this.value)">
            ${platformOpts}
          </select>`;
      }).join('')}</div>`;

      slotCellHTML = `<div style="display:flex;flex-direction:column;gap:4px;">${targetCodeDetails.map(cd => {
        const c = cd.code;
        const sl = cd.slot || 'test1';
        const slotOpts = (appConfig.slots || ['test1']).map(s => `<option value="${s}" ${s === sl ? 'selected' : ''}>${s}</option>`).join('');
        return `
          <select class="status-select" title="Slot" style="height:22px;padding:0 4px;font-size:10px;" onchange="stageSingleCodeMeta(${item.id}, '${c.replace(/'/g, "\\'")}', 'slot', this.value)">
            ${slotOpts}
          </select>`;
      }).join('')}</div>`;

      cStatusCellHTML = `<div style="display:flex;flex-direction:column;gap:4px;">${targetCodeDetails.map(cd => {
        const c = cd.code;
        const st = (cd.c_status || 'unsold').toLowerCase();
        const isUnsold = st === 'ununsold' || st === 'unsold';
        return `
          <select class="status-select" title="C-Status" style="height:22px;padding:0 4px;font-size:10px;" onchange="stageSingleCodeMeta(${item.id}, '${c.replace(/'/g, "\\'")}', 'c_status', this.value)">
            <option value="unsold"   ${isUnsold ? 'selected':''}>Unsold</option>
            <option value="listed"   ${st==='listed' ? 'selected':''}>Listed</option>
            <option value="sold"     ${st==='sold' ? 'selected':''}>Sold</option>
            <option value="rejected" ${st==='rejected' ? 'selected':''}>Rejected</option>
          </select>`;
      }).join('')}</div>`;
    } else {
      const codes = (item.gift_card_code || '').split(/[\n,\s;]+/).map(c => c.trim()).filter(Boolean);
      if (codes.length) {
        codesHTML = `<div class="codes-list">${codes.map(c => `<div class="code-row"><span class="code-pill ${item.is_scammer ? 'scammer' : ''}">${c}</span><button class="copy-code-btn" title="Copy code" onclick="copyToClipboard(this, '${c.replace(/'/g, "\\'")}')"><i class="fa-regular fa-copy"></i></button></div>`).join('')}</div>`;
      }

      const plat = item.platform || 'test1';
      const platformOpts = (appConfig.platforms || ['test1']).map(p => `<option value="${p}" ${p === plat ? 'selected' : ''}>${p}</option>`).join('');
      platformCellHTML = `<select class="status-select" title="Platform" style="height:22px;padding:0 4px;font-size:10px;" onchange="stageChange(${item.id}, '${item.row_source}', 'platform', this.value)">${platformOpts}</select>`;

      const sl = item.slot || 'test1';
      const slotOpts = (appConfig.slots || ['test1']).map(s => `<option value="${s}" ${s === sl ? 'selected' : ''}>${s}</option>`).join('');
      slotCellHTML = `<select class="status-select" title="Slot" style="height:22px;padding:0 4px;font-size:10px;" onchange="stageChange(${item.id}, '${item.row_source}', 'slot', this.value)">${slotOpts}</select>`;

      const st = (item.c_status || 'unsold').toLowerCase();
      const isUnsold = st === 'ununsold' || st === 'unsold';
      cStatusCellHTML = `
        <select class="status-select" title="C-Status" style="height:22px;padding:0 4px;font-size:10px;" onchange="stageChange(${item.id}, '${item.row_source}', 'c_status', this.value)">
          <option value="unsold"   ${isUnsold ? 'selected':''}>Unsold</option>
          <option value="listed"   ${st==='listed' ? 'selected':''}>Listed</option>
          <option value="sold"     ${st==='sold' ? 'selected':''}>Sold</option>
          <option value="rejected" ${st==='rejected' ? 'selected':''}>Rejected</option>
        </select>`;
    }

    const tr = document.createElement('tr');
    const isPaid = String(item.status || '').toLowerCase() === 'paid';
    const isFast = Number(item.payout_term_days) === 1;
    const isOlder24 = (item.age_hours || 0) >= 24;

    if (item.in_old_db) {
      tr.style.background = 'rgba(153, 27, 27, 0.35)';
    } else if (item.is_scammer) {
      tr.style.background = 'rgba(239, 68, 68, 0.15)';
    } else if (isPaid) {
      tr.style.background = 'rgba(59, 130, 246, 0.15)';
    } else if (isOlder24) {
      tr.style.background = 'rgba(249, 115, 22, 0.15)';
    } else if (isFast) {
      tr.style.background = 'rgba(245, 158, 11, 0.15)';
    }

    const curCardName = item.gift_card_name || PREDEFINED_CARD_NAMES[0];
    const cardBadge = getCardNameBadge(curCardName);
    const tagBadge = item.is_new ? `<span class="badge badge-new">New</span>` : `<span class="badge badge-old">Old</span>`;
    const oldDbBadge = item.in_old_db ? `<span class="badge" style="background:#991b1b;color:#ffffff;font-size:10px;padding:2px 6px;margin-left:4px;" title="Found in Old DB"><i class="fa-solid fa-triangle-exclamation"></i> Found in Old DB</span>` : '';
    const isChecked = typeof selectedItemIds !== 'undefined' && selectedItemIds.has(item.id);

    tr.innerHTML = `
      <td style="text-align:center;">
        <input type="checkbox" class="row-select-checkbox" ${isChecked ? 'checked' : ''} onchange="toggleItemSelection(${item.id}, this.checked)">
      </td>
      <td>${tagBadge}</td>
      <td class="mono" style="white-space:nowrap;">${item.created_at_str}</td>
      <td class="mono fw-bold">
        <input
          type="text"
          class="filter-input"
          style="width:clamp(100px,10vw,140px);height:clamp(24px,2.4vh,28px);padding:0 6px;font-size:clamp(9.5px,0.65vw,11.5px);"
          placeholder="+ Order ID"
          value="${item.order_id || ''}"
          oninput="stageChange(${item.id}, '${item.row_source}', 'order_id', this.value)"
        />
      </td>
      <td>${platformCellHTML}</td>
      <td>${slotCellHTML}</td>
      <td>${cStatusCellHTML}</td>
      <td>${cardBadge}${oldDbBadge}</td>
      <td>${codesHTML}</td>
      <td>
        <div style="display:flex;align-items:center;gap:clamp(4px,0.35vw,6px);">
          <button
            class="btn btn-ghost"
            style="height:clamp(22px,2.2vh,28px);padding:0 clamp(6px,0.55vw,9px);flex-shrink:0;"
            title="View full details"
            onclick="openAuditModal(${item.id}, '${item.row_source}')"
          >
            <i class="fa-solid fa-eye"></i> Details
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function clearSViewFilters() {
  const search = document.getElementById('sview-search');
  if (search) search.value = '';
  if (fpSViewDate) { fpSViewDate.clear(); }
  else if (document.getElementById('sview-date')) { document.getElementById('sview-date').value = ''; }

  const card = document.getElementById('sview-card-name');
  if (card) card.value = '';
  const plat = document.getElementById('sview-platform');
  if (plat) plat.value = '';
  const slot = document.getElementById('sview-slot');
  if (slot) slot.value = '';
  const st = document.getElementById('sview-status');
  if (st) st.value = '';

  applySViewFilters();
}

function stageSingleCodeMeta(id, code, field, value) {
  const key = `submission_${id}`;
  if (!pendingChanges[key]) {
    pendingChanges[key] = { id, source: 'submission' };
  }
  if (!pendingChanges[key].code_metas) {
    pendingChanges[key].code_metas = {};
  }
  if (!pendingChanges[key].code_metas[code]) {
    pendingChanges[key].code_metas[code] = {};
  }
  pendingChanges[key].code_metas[code][field] = value;

  if (allInventoryData) {
    const item = allInventoryData.find(x => x.id === id);
    if (item) {
      if (item.code_details) {
        const cd = item.code_details.find(c => c.code === code);
        if (cd) {
          cd[field] = value;
        }
        const firstVal = item.code_details[0] ? item.code_details[0][field] : undefined;
        if (firstVal !== undefined && item.code_details.every(c => c[field] === firstVal)) {
          item[field] = firstVal;
        }
      } else {
        item[field] = value;
      }
    }
  }
  updateBulkSaveButton();
  applySViewFilters();
  if (typeof applyInventoryFilters === 'function') applyInventoryFilters();
}
