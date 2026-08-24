/* ═══════════════════════════════════════════════════════════
   inventory.js - Codes Inventory Table, Filter Engine, Bulk Sync
   ═══════════════════════════════════════════════════════════ */

let allInventoryData = [];
let lastFilteredInventory = [];
let pendingChanges = {};
let fpFilterDate = null;

function normalizeStr(v) {
  return String(v === null || v === undefined ? '' : v).trim().toLowerCase();
}

function matchPlatformOrSlot(item, field, filterVal) {
  const target = normalizeStr(filterVal);
  if (!target) return true;

  if (item.code_details && Array.isArray(item.code_details) && item.code_details.length > 0) {
    return item.code_details.some(cd => {
      const cdRaw = cd[field];
      const cdVal = normalizeStr((cdRaw !== undefined && cdRaw !== null && cdRaw !== '') ? cdRaw : item[field]);
      return cdVal === target;
    });
  }

  const rowVal = normalizeStr(item[field]);
  return rowVal === target;
}

function matchCStatus(item, filterVal) {
  const target = normalizeStr(filterVal);
  if (!target) return true;
  const normSt = s => {
    const raw = normalizeStr(s);
    if (!raw || raw === 'ununsold' || raw === 'unsold') return 'unsold';
    return raw;
  };
  const targetNorm = normSt(target);
  const rowNorm = normSt(item.c_status);

  if (item.code_details && Array.isArray(item.code_details) && item.code_details.length > 0) {
    return item.code_details.some(cd => {
      const codeRaw = (cd.c_status !== undefined && cd.c_status !== null && cd.c_status !== '') ? cd.c_status : item.c_status;
      return normSt(codeRaw) === targetNorm;
    });
  }
  return rowNorm === targetNorm;
}

async function fetchInventory(btnEl) {
  if (btnEl) btnEl.classList.add('spinning');
  showSpinner('Loading inventory...');
  try {
    const promises = [fetch('/api/inventory').then(r => r.json())];
    if (typeof configLoaded !== 'undefined' && !configLoaded) {
      promises.push(fetch('/api/config').then(r => r.json()));
    }
    const results = await Promise.all(promises);
    allInventoryData = results[0];
    if (results[1]) {
      appConfig = results[1];
      if (typeof renderConfigLists === 'function') renderConfigLists();
      configLoaded = true;
    }
    if (typeof populateDropdownOptions === 'function') populateDropdownOptions();
    applyInventoryFilters();
    if (typeof applySViewFilters === 'function') applySViewFilters();
  } finally {
    hideSpinner();
    if (btnEl) setTimeout(() => btnEl.classList.remove('spinning'), 400);
  }
}

function applyInventoryFilters() {
  if (!allInventoryData) return;
  const searchEl = document.getElementById('filter-search');
  const dateEl = document.getElementById('filter-date');
  const fieldEl = document.getElementById('filter-field');
  const platformEl = document.getElementById('filter-platform');
  const slotEl = document.getElementById('filter-slot');
  const statusEl = document.getElementById('filter-status');
  const cstatusEl = document.getElementById('filter-cstatus');
  const termEl = document.getElementById('filter-term');
  const sortEl = document.getElementById('filter-sort');

  const queryRaw = searchEl ? searchEl.value.trim() : '';
  const query = queryRaw.toLowerCase();
  const queryClean = queryRaw.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const dateFilter = dateEl ? dateEl.value.trim() : '';
  const field = fieldEl ? fieldEl.value.trim() : 'all';
  const platFilter = platformEl ? platformEl.value.trim() : '';
  const slotFilter = slotEl ? slotEl.value.trim() : '';
  const status = statusEl ? statusEl.value.trim().toLowerCase() : '';
  const cstatus = cstatusEl ? cstatusEl.value.trim().toLowerCase() : '';
  const term = termEl ? termEl.value.trim() : '';
  const sortMode = sortEl ? sortEl.value.trim() : 'date';

  let filtered = allInventoryData.filter(item => {
    // Date filter
    if (dateFilter) {
      const itemDate = getItemDateStr(item);
      if (itemDate !== dateFilter) return false;
    }

    // Platform & Slot filters
    if (!matchPlatformOrSlot(item, 'platform', platFilter)) return false;
    if (!matchPlatformOrSlot(item, 'slot', slotFilter)) return false;

    // Submission status filter
    if (status) {
      const itemStatus = (item.status ? String(item.status).toLowerCase().trim() : 'unpaid');
      if (itemStatus !== status) return false;
    }

    // C-status (code status) filter
    if (!matchCStatus(item, cstatus)) return false;

    // Payout term filter
    if (term) {
      if (String(item.payout_term_days || 6) !== String(term)) return false;
    }

    // Search query & fields
    if (query) {
      const p = String(item.phone_number || '').toLowerCase();
      const pClean = p.replace(/[^a-zA-Z0-9]/g, '');
      const u = String(item.payment_details || '').toLowerCase();
      const uClean = u.replace(/[^a-zA-Z0-9]/g, '');
      const c = String(item.gift_card_code || '').toLowerCase();
      const n = String(item.gift_card_name || '').toLowerCase();
      const ord = String(item.order_id || '').toLowerCase();

      const matchPhone = p.includes(query) || (queryClean.length > 0 && pClean.includes(queryClean));
      const matchUpi = u.includes(query) || (queryClean.length > 0 && uClean.includes(queryClean));
      let matchCode = c.includes(query) || (queryClean.length > 0 && c.replace(/[^a-zA-Z0-9]/g, '').includes(queryClean));
      if (!matchCode && item.code_details && item.code_details.length > 0) {
        matchCode = item.code_details.some(cd => {
          const codeStr = String(cd.code || '').toLowerCase();
          const codeClean = codeStr.replace(/[^a-zA-Z0-9]/g, '');
          return codeStr.includes(query) || (queryClean.length > 0 && codeClean.includes(queryClean));
        });
      }
      const matchName = n.includes(query);
      const matchOrder = ord.includes(query);

      if (field === 'order_id') {
        if (!matchOrder) return false;
      } else if (field === 'phone') {
        if (!matchPhone) return false;
      } else if (field === 'upi') {
        if (!matchUpi) return false;
      } else if (field === 'code') {
        if (!matchCode) return false;
      } else {
        if (!matchOrder && !matchPhone && !matchUpi && !matchCode && !matchName) return false;
      }
    }

    return true;
  });

  const isPhoneSort = (sortMode === 'phone') || (field === 'phone');
  const isUpiSort = (sortMode === 'upi') || (field === 'upi');

  filtered.sort((a, b) => {
    const isPaidA = String(a.status || '').toLowerCase() === 'paid' ? 1 : 0;
    const isPaidB = String(b.status || '').toLowerCase() === 'paid' ? 1 : 0;

    if (isPaidA !== isPaidB) {
      return isPaidA - isPaidB;
    }

    if (isPhoneSort) {
      const rawA = String(a.phone_number || '').trim();
      const rawB = String(b.phone_number || '').trim();
      const ka = rawA.replace(/[^0-9]/g, '') || rawA.toLowerCase();
      const kb = rawB.replace(/[^0-9]/g, '') || rawB.toLowerCase();
      if (ka !== kb) return ka.localeCompare(kb);
    } else if (isUpiSort) {
      const ka = String(a.payment_details || '').toLowerCase().trim();
      const kb = String(b.payment_details || '').toLowerCase().trim();
      if (ka !== kb) return ka.localeCompare(kb);
    }

    const da = a.created_at_iso ? new Date(a.created_at_iso).getTime() : 0;
    const db = b.created_at_iso ? new Date(b.created_at_iso).getTime() : 0;
    return db - da;
  });

  lastFilteredInventory = filtered;
  renderInventoryTable(filtered);
  updateSelectedCountUI();

  // Update filtered entries and codes counters
  const activeCStatus = getActiveCStatusFilter('inventory');
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

  const entriesEl = document.getElementById('inventory-entries-count');
  const codesEl = document.getElementById('inventory-codes-count');
  if (entriesEl) entriesEl.innerText = entriesCount;
  if (codesEl) codesEl.innerText = totalCodesCount;
}

let selectedItemIds = new Set();
let currentBulkViewContext = 'inventory';

function getSelectedCodesCount() {
  let count = 0;
  if (!allInventoryData || selectedItemIds.size === 0) return 0;
  selectedItemIds.forEach(id => {
    const item = allInventoryData.find(x => x.id === id);
    if (!item) return;
    if (item.code_details && item.code_details.length > 0) {
      count += item.code_details.length;
    } else if (item.gift_card_code) {
      const splitCodes = String(item.gift_card_code).split(/[\n,\s;]+/).map(c => c.trim()).filter(Boolean);
      count += splitCodes.length;
    }
  });
  return count;
}

function updateSelectedCountUI() {
  const selectedCodesCount = getSelectedCodesCount();
  const invBtn = document.getElementById('inventory-bulk-status-btn');
  const invCountSpan = document.getElementById('inventory-selected-count');
  if (invBtn && invCountSpan) {
    invCountSpan.innerText = `${selectedCodesCount} code${selectedCodesCount !== 1 ? 's' : ''}`;
    invBtn.style.display = selectedItemIds.size > 0 ? 'inline-flex' : 'none';
  }

  const sviewBtn = document.getElementById('sview-bulk-status-btn');
  const sviewCountSpan = document.getElementById('sview-selected-count');
  if (sviewBtn && sviewCountSpan) {
    sviewCountSpan.innerText = `${selectedCodesCount} code${selectedCodesCount !== 1 ? 's' : ''}`;
    sviewBtn.style.display = selectedItemIds.size > 0 ? 'inline-flex' : 'none';
  }

  const invSelectAll = document.getElementById('inventory-select-all');
  if (invSelectAll && lastFilteredInventory && lastFilteredInventory.length > 0) {
    invSelectAll.checked = lastFilteredInventory.every(item => selectedItemIds.has(item.id));
  }
  const sviewSelectAll = document.getElementById('sview-select-all');
  if (sviewSelectAll && typeof lastFilteredSView !== 'undefined' && lastFilteredSView && lastFilteredSView.length > 0) {
    sviewSelectAll.checked = lastFilteredSView.every(item => selectedItemIds.has(item.id));
  }
}

function toggleItemSelection(id, isChecked) {
  if (isChecked) {
    selectedItemIds.add(id);
  } else {
    selectedItemIds.delete(id);
  }
  updateSelectedCountUI();
}

function toggleSelectAll(viewType, isChecked) {
  const dataset = (viewType === 'sview') ? (typeof lastFilteredSView !== 'undefined' ? lastFilteredSView : []) : lastFilteredInventory;
  if (!dataset) return;

  dataset.forEach(item => {
    if (isChecked) {
      selectedItemIds.add(item.id);
    } else {
      selectedItemIds.delete(item.id);
    }
  });

  const tableBodyId = (viewType === 'sview') ? 'sview-table-body' : 'inventory-table-body';
  const tbody = document.getElementById(tableBodyId);
  if (tbody) {
    const checkboxes = tbody.querySelectorAll('.row-select-checkbox');
    checkboxes.forEach(cb => { cb.checked = isChecked; });
  }

  updateSelectedCountUI();
}

function openBulkStatusModal(viewType) {
  currentBulkViewContext = viewType;
  if (selectedItemIds.size === 0) {
    alert('Please select at least one item first.');
    return;
  }
  const selectedCodesCount = getSelectedCodesCount();
  const countEl = document.getElementById('bulk-modal-count');
  if (countEl) countEl.innerText = `${selectedCodesCount} code${selectedCodesCount !== 1 ? 's' : ''}`;

  const invRow = document.getElementById('bulk-status-row-inventory');
  const sviewRows = document.getElementById('bulk-sview-meta-rows');
  if (invRow) invRow.style.display = (viewType === 'inventory') ? 'block' : 'none';
  if (sviewRows) sviewRows.style.display = (viewType === 'sview') ? 'block' : 'none';

  const targetStatus = document.getElementById('bulk-target-status');
  if (targetStatus) targetStatus.value = '';
  const targetCStatus = document.getElementById('bulk-target-cstatus');
  if (targetCStatus) targetCStatus.value = '';

  const targetPlat = document.getElementById('bulk-target-platform');
  const targetSlot = document.getElementById('bulk-target-slot');
  if (targetPlat) {
    targetPlat.innerHTML = '<option value="">-- Leave Unchanged --</option>' +
      (appConfig.platforms || []).map(p => `<option value="${p}">${p}</option>`).join('');
    targetPlat.value = '';
  }
  if (targetSlot) {
    targetSlot.innerHTML = '<option value="">-- Leave Unchanged --</option>' +
      (appConfig.slots || []).map(s => `<option value="${s}">${s}</option>`).join('');
    targetSlot.value = '';
  }

  const modal = document.getElementById('modal-bulk-status');
  if (modal) modal.classList.add('open');
}

function closeBulkStatusModal() {
  const modal = document.getElementById('modal-bulk-status');
  if (modal) modal.classList.remove('open');
}

function applyBulkStatusUpdate() {
  if (selectedItemIds.size === 0) return;

  const newStatus = document.getElementById('bulk-target-status')?.value;
  const newCStatus = document.getElementById('bulk-target-cstatus')?.value;
  const newPlatform = document.getElementById('bulk-target-platform')?.value;
  const newSlot = document.getElementById('bulk-target-slot')?.value;

  if (!newStatus && !newCStatus && !newPlatform && !newSlot) {
    alert('Please select at least one status or field to update.');
    return;
  }

  selectedItemIds.forEach(id => {
    const item = allInventoryData ? allInventoryData.find(x => x.id === id) : null;
    const source = item ? (item.row_source || 'submission') : 'submission';

    if (newStatus) {
      stageChange(id, source, 'status', newStatus);
    }
    if (newCStatus) {
      if (item && item.code_details && item.code_details.length > 0) {
        item.code_details.forEach(cd => {
          stageSingleCodeMeta(id, cd.code, 'c_status', newCStatus);
        });
      } else {
        stageChange(id, source, 'c_status', newCStatus);
      }
    }
    if (newPlatform) {
      if (item && item.code_details && item.code_details.length > 0) {
        item.code_details.forEach(cd => {
          stageSingleCodeMeta(id, cd.code, 'platform', newPlatform);
        });
      } else {
        stageChange(id, source, 'platform', newPlatform);
      }
    }
    if (newSlot) {
      if (item && item.code_details && item.code_details.length > 0) {
        item.code_details.forEach(cd => {
          stageSingleCodeMeta(id, cd.code, 'slot', newSlot);
        });
      } else {
        stageChange(id, source, 'slot', newSlot);
      }
    }
  });

  closeBulkStatusModal();
  updateBulkSaveButton();
  applyInventoryFilters();
  if (typeof applySViewFilters === 'function') applySViewFilters();
}

function renderInventoryTable(data) {
  const tbody = document.getElementById('inventory-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;color:var(--subtle);padding:clamp(12px,1.5vh,20px);">No records match the filter.</td></tr>`;
    return;
  }

  data.forEach(item => {
    const isFast = Number(item.payout_term_days) === 1;
    const termBadge = isFast
      ? `<span class="badge badge-yellow" title="Fast Payment (1 Day)"><i class="fa-solid fa-bolt"></i> Fast</span>`
      : `<span class="badge badge-old" title="Normal Payment (6 Days)">Normal</span>`;
    const tagBadge = item.is_new
      ? `<span class="badge badge-new">New</span>`
      : `<span class="badge badge-old">Old</span>`;

    const activeCStatus = getActiveCStatusFilter('inventory');
    let visibleCodes = [];
    if (item.code_details && item.code_details.length > 0) {
      const filteredDetails = activeCStatus ? item.code_details.filter(cd => {
        const cdStRaw = normalizeStr(cd.c_status !== undefined && cd.c_status !== null && cd.c_status !== '' ? cd.c_status : item.c_status);
        const cdStNorm = (!cdStRaw || cdStRaw === 'ununsold' || cdStRaw === 'unsold') ? 'unsold' : cdStRaw;
        return cdStNorm === activeCStatus;
      }) : item.code_details;
      visibleCodes = (filteredDetails.length > 0 ? filteredDetails : item.code_details).map(cd => cd.code).filter(Boolean);
    } else {
      const splitCodes = (item.gift_card_code || '').split(/[\n,\s;]+/).map(c => c.trim()).filter(Boolean);
      visibleCodes = splitCodes;
    }

    const codesHTML = visibleCodes.length
      ? `<div class="codes-list">${visibleCodes.map(c => `<div class="code-row"><span class="code-pill ${item.is_scammer ? 'scammer' : ''}">${c}</span><button class="copy-code-btn" title="Copy code" onclick="copyToClipboard(this, '${c.replace(/'/g, "\\'")}')"><i class="fa-regular fa-copy"></i></button></div>`).join('')}</div>`
      : `<span class="text-muted">—</span>`;

    const tr = document.createElement('tr');
    const isPaid = String(item.status || '').toLowerCase() === 'paid';
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

    let cStatusBadgeHTML = statusDot(item.c_status || 'ununsold');
    if (item.code_details && item.code_details.length > 0) {
      const sourceDetails = activeCStatus ? item.code_details.filter(cd => {
        const cdStRaw = normalizeStr(cd.c_status !== undefined && cd.c_status !== null && cd.c_status !== '' ? cd.c_status : item.c_status);
        const cdStNorm = (!cdStRaw || cdStRaw === 'ununsold' || cdStRaw === 'unsold') ? 'unsold' : cdStRaw;
        return cdStNorm === activeCStatus;
      }) : item.code_details;
      const targetDetails = sourceDetails.length > 0 ? sourceDetails : item.code_details;
      const uniqueCSt = Array.from(new Set(targetDetails.map(cd => cd.c_status || 'ununsold')));
      if (uniqueCSt.length > 0) {
        cStatusBadgeHTML = uniqueCSt.map(s => statusDot(s)).join('<div style="margin-top:2px;"></div>');
      }
    }

    const cardBadge = getCardNameBadge(item.gift_card_name);
    const oldDbBadge = item.in_old_db ? `<span class="badge" style="background:#991b1b;color:#ffffff;font-size:10px;padding:2px 6px;margin-left:4px;" title="Found in Old DB"><i class="fa-solid fa-triangle-exclamation"></i> Found in Old DB</span>` : '';

    const paymentDetailsHTML = item.payment_details ? `
      <div style="display:flex;align-items:center;gap:4px;">
        <span class="mono" style="max-width:clamp(85px,9vw,140px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${item.payment_details}">${item.payment_details}</span>
        <button class="copy-code-btn" title="Copy Payment Details" onclick="copyToClipboard(this, '${item.payment_details.replace(/'/g, "\\'")}')">
          <i class="fa-regular fa-copy"></i>
        </button>
      </div>
    ` : '<span class="text-muted">—</span>';

    const isChecked = selectedItemIds.has(item.id);

    tr.innerHTML = `
      <td style="text-align:center;">
        <input type="checkbox" class="row-select-checkbox" ${isChecked ? 'checked' : ''} onchange="toggleItemSelection(${item.id}, this.checked)">
      </td>
      <td>${tagBadge}</td>
      <td>${termBadge}</td>
      <td class="mono">${item.created_at_str}</td>
      <td>${cStatusBadgeHTML}</td>
      <td class="fw-bold" style="${item.is_scammer ? 'color:var(--danger);' : ''}">${item.phone_number || '—'}</td>
      <td>${cardBadge}${oldDbBadge}</td>
      <td>${codesHTML}</td>
      <td>${paymentDetailsHTML}</td>
      <td class="fw-bold">${item.currency || 'Rs.'}${item.total_amount}</td>
      <td>
        <select
          class="status-select"
          onchange="stageChange(${item.id}, '${item.row_source}', 'status', this.value)"
          data-current="${item.status || 'unpaid'}"
        >
          <option value="unpaid" ${item.status === 'unpaid' ? 'selected' : ''}>Unpaid</option>
          <option value="listed" ${item.status === 'listed' ? 'selected' : ''}>Listed</option>
          <option value="sold"   ${item.status === 'sold' ? 'selected' : ''}>Sold</option>
          <option value="paid"   ${item.status === 'paid' ? 'selected' : ''}>Paid</option>
          <option value="rejected" ${item.status === 'rejected' ? 'selected' : ''}>Rejected</option>
        </select>
      </td>
      <td>
        <div style="display:flex;align-items:center;gap:clamp(4px,0.35vw,6px);">
          <button
            class="btn btn-ghost"
            style="height:clamp(20px,2vh,26px);padding:0 clamp(6px,0.55vw,9px);flex-shrink:0;"
            title="View full details"
            onclick="openAuditModal(${item.id}, '${item.row_source}')"
          >
            <i class="fa-solid fa-eye"></i>
          </button>
          <button
            class="btn btn-ghost"
            style="height:clamp(20px,2vh,26px);padding:0 clamp(6px,0.55vw,9px);flex-shrink:0;"
            title="Edit submission details"
            onclick="openEditModal(${item.id}, '${item.row_source}')"
          >
            <i class="fa-solid fa-pen-to-square"></i>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function clearFilters() {
  const search = document.getElementById('filter-search');
  if (search) search.value = '';
  if (fpFilterDate) { fpFilterDate.clear(); }
  else if (document.getElementById('filter-date')) { document.getElementById('filter-date').value = ''; }

  const field = document.getElementById('filter-field');
  if (field) field.value = 'all';
  const plat = document.getElementById('filter-platform');
  if (plat) plat.value = '';
  const slot = document.getElementById('filter-slot');
  if (slot) slot.value = '';
  const st = document.getElementById('filter-status');
  if (st) st.value = '';
  const cst = document.getElementById('filter-cstatus');
  if (cst) cst.value = '';
  const term = document.getElementById('filter-term');
  if (term) term.value = '';
  const sort = document.getElementById('filter-sort');
  if (sort) sort.value = 'date';

  applyInventoryFilters();
}

function getActiveCStatusFilter(viewType) {
  const selectId = (viewType === 'sview') ? 'sview-status' : 'filter-cstatus';
  const el = document.getElementById(selectId);
  const val = el ? el.value.trim().toLowerCase() : '';
  if (!val) return '';
  return (val === 'ununsold' || val === 'unsold') ? 'unsold' : val;
}

function copyFilteredCodes(viewType, btnEl) {
  const sourceList = (viewType === 'sview') ? (typeof lastFilteredSView !== 'undefined' ? lastFilteredSView : []) : lastFilteredInventory;
  const activeCStatus = getActiveCStatusFilter(viewType);
  let allCodes = [];

  (sourceList || []).forEach(item => {
    if (item.code_details && item.code_details.length > 0) {
      item.code_details.forEach(cd => {
        if (!cd.code) return;
        if (activeCStatus) {
          const cdStRaw = normalizeStr(cd.c_status !== undefined && cd.c_status !== null && cd.c_status !== '' ? cd.c_status : item.c_status);
          const cdStNorm = (!cdStRaw || cdStRaw === 'ununsold' || cdStRaw === 'unsold') ? 'unsold' : cdStRaw;
          if (cdStNorm !== activeCStatus) return;
        }
        allCodes.push(String(cd.code).trim());
      });
    } else if (item.gift_card_code) {
      if (activeCStatus) {
        const itemStRaw = normalizeStr(item.c_status);
        const itemStNorm = (!itemStRaw || itemStRaw === 'ununsold' || itemStRaw === 'unsold') ? 'unsold' : itemStRaw;
        if (itemStNorm !== activeCStatus) return;
      }
      const splitCodes = String(item.gift_card_code).split(/[\n,\s;]+/).map(c => c.trim()).filter(Boolean);
      allCodes.push(...splitCodes);
    }
  });

  allCodes = allCodes.filter(Boolean);
  if (!allCodes.length) {
    alert('No codes available in current filtered view.');
    return;
  }

  const newlineSeparated = allCodes.join('\n');
  navigator.clipboard.writeText(newlineSeparated).then(() => {
    if (btnEl) {
      const origHTML = btnEl.innerHTML;
      btnEl.innerHTML = `<i class="fa-solid fa-check"></i> Copied (${allCodes.length})`;
      setTimeout(() => { btnEl.innerHTML = origHTML; }, 2000);
    } else {
      alert(`Copied ${allCodes.length} codes to clipboard!`);
    }
  }).catch(err => {
    console.error('Clipboard copy failed:', err);
    prompt('Copy codes below:', newlineSeparated);
  });
}

function stageChange(id, source, field, value) {
  if (field === 'status') {
    if (allInventoryData) {
      const item = allInventoryData.find(x => x.id === id && (x.row_source || 'submission') === source);
      if (item) {
        item.status = value;
      }
    }
    updateStatus(id, value, source);
    return;
  }

  const key = `${source}_${id}`;
  if (!pendingChanges[key]) {
    pendingChanges[key] = { id, source };
  }
  pendingChanges[key][field] = value;

  if (allInventoryData) {
    const item = allInventoryData.find(x => x.id === id && (x.row_source || 'submission') === source);
    if (item) {
      item[field] = value;
      if (item.code_details && (field === 'c_status' || field === 'platform' || field === 'slot')) {
        item.code_details.forEach(cd => {
          cd[field] = value;
        });
      }
    }
  }
  updateBulkSaveButton();
  applyInventoryFilters();
  if (typeof applySViewFilters === 'function') applySViewFilters();
}

function updateBulkSaveButton() {
  const count = Object.keys(pendingChanges).length;
  const btns = document.querySelectorAll('.btn-bulk-save-trigger');
  btns.forEach(btn => {
    if (count > 0) {
      btn.style.display = 'inline-flex';
      btn.classList.add('btn-primary');
      btn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Save ${count} Change${count > 1 ? 's' : ''}`;
    } else {
      btn.style.display = 'none';
    }
  });
}

async function bulkSavePendingChanges() {
  const keys = Object.keys(pendingChanges);
  if (keys.length === 0) {
    alert('No pending changes to save.');
    return;
  }
  const updates = keys.map(k => pendingChanges[k]);

  showSpinner('Saving data...');
  try {
    await fetch('/api/submission/bulk-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates })
    });
    pendingChanges = {};
    updateBulkSaveButton();
    hideSpinner('Data saved successfully!');
    await fetchInventory();
  } catch (e) {
    console.error('Bulk save failed', e);
    hideSpinner('Save failed!');
  }
}

async function updateStatus(id, status, source) {
  source = source || 'submission';
  showSpinner();
  try {
    await fetch('/api/submission/update-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status, source })
    });
    await fetchInventory();
  } finally { hideSpinner(); }
}
