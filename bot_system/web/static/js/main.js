/* ═══════════════════════════════════════════════════════════
   main.js - Application Router, Tab Switcher, & Bootstrap
   ═══════════════════════════════════════════════════════════ */

const tabMeta = {
  dashboard: { title: 'Dashboard', sub: 'Live metrics & today\'s submissions' },
  inventory: { title: 'Codes Inventory', sub: 'Date-ordered submissions · aging alerts' },
  sview: { title: 'S-View', sub: 'Simplified Gift Cards table view' },
  payout: { title: 'Export Payout', sub: 'Download payment reports' },
  duplicates: { title: 'Duplicate Inspector', sub: 'Side-by-side duplicate conflict resolution & selective deletion' },
  scammers: { title: 'Scammer Shield', sub: 'Auto-flagged duplicates & blocked UPIs' },
  config: { title: 'System Config', sub: 'Manage platform and slot dropdown options' },
  danger: { title: 'Danger Zone', sub: 'Restricted system operations' }
};

function switchTab(name) {
  ['dashboard', 'inventory', 'sview', 'payout', 'duplicates', 'scammers', 'config', 'danger'].forEach(t => {
    const viewEl = document.getElementById(`view-${t}`);
    const navEl = document.getElementById(`nav-${t}`);
    if (viewEl) viewEl.style.display = (t === name) ? 'block' : 'none';
    if (navEl) navEl.classList.toggle('active', t === name);
  });

  const meta = tabMeta[name] || { title: name, sub: '' };
  const titleEl = document.getElementById('toolbar-title');
  const subEl = document.getElementById('toolbar-sub');
  if (titleEl) titleEl.textContent = meta.title;
  if (subEl) subEl.textContent = meta.sub;

  const actions = document.getElementById('toolbar-actions');
  if (actions) {
    if (name === 'dashboard') {
      actions.innerHTML = `<button class="btn btn-default refresh-btn" onclick="fetchMetrics(this)"><i class="fa-solid fa-arrows-rotate"></i> Refresh</button>`;
    } else if (name === 'inventory' || name === 'sview') {
      actions.innerHTML = `
        <button class="btn btn-primary btn-bulk-save-trigger" style="display:none;" onclick="bulkSavePendingChanges()"><i class="fa-solid fa-floppy-disk"></i> Save Changes</button>
        <button class="btn btn-primary" onclick="openManualModal()"><i class="fa-solid fa-plus"></i> Add Manual</button>
        <button class="btn btn-default refresh-btn" onclick="fetchInventory(this)"><i class="fa-solid fa-arrows-rotate"></i> Refresh</button>`;
      if (typeof updateBulkSaveButton === 'function') updateBulkSaveButton();
    } else if (name === 'duplicates') {
      actions.innerHTML = `<button class="btn btn-default refresh-btn" onclick="fetchDuplicates(this)"><i class="fa-solid fa-arrows-rotate"></i> Refresh Duplicates</button>`;
    } else if (name === 'scammers') {
      actions.innerHTML = `<button class="btn btn-default refresh-btn" onclick="fetchScammers(this)"><i class="fa-solid fa-arrows-rotate"></i> Refresh</button>`;
    } else if (name === 'config') {
      actions.innerHTML = `<button class="btn btn-default refresh-btn" onclick="loadAppConfig(this)"><i class="fa-solid fa-arrows-rotate"></i> Refresh Config</button>`;
    } else {
      actions.innerHTML = '';
    }
  }

  if (name === 'dashboard' && typeof fetchMetrics === 'function') fetchMetrics();
  if ((name === 'inventory' || name === 'sview') && typeof fetchInventory === 'function') fetchInventory();
  if (name === 'duplicates' && typeof fetchDuplicates === 'function') fetchDuplicates();
  if (name === 'scammers' && typeof fetchScammers === 'function') fetchScammers();
  if (name === 'config' && typeof loadAppConfig === 'function') loadAppConfig();
}

/* ─── Global App Boot ─── */
document.addEventListener("DOMContentLoaded", function() {
  if (typeof loadAppConfig === 'function') loadAppConfig();
  if (typeof fetchMetrics === 'function') fetchMetrics();
  if (typeof fetchDuplicates === 'function') fetchDuplicates();

  if (window.flatpickr) {
    if (document.getElementById('filter-date')) {
      fpFilterDate = flatpickr("#filter-date", {
        dateFormat: "Y-m-d",
        altInput: true,
        altFormat: "M j, Y",
        allowInput: true,
        placeholder: "Select Date...",
        onChange: function() { if (typeof applyInventoryFilters === 'function') applyInventoryFilters(); }
      });
    }
    if (document.getElementById('sview-date')) {
      fpSViewDate = flatpickr("#sview-date", {
        dateFormat: "Y-m-d",
        altInput: true,
        altFormat: "M j, Y",
        allowInput: true,
        placeholder: "Select Date...",
        onChange: function() { if (typeof applySViewFilters === 'function') applySViewFilters(); }
      });
    }
    if (document.getElementById('edit-created-at')) {
      fpEditDate = flatpickr("#edit-created-at", {
        enableTime: true,
        dateFormat: "Y-m-d H:i",
        altInput: true,
        altFormat: "M j, Y h:i K",
        allowInput: true,
        placeholder: "Select Date & Time..."
      });
    }
  }
});
