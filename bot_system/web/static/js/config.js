/* ═══════════════════════════════════════════════════════════
   config.js - System Configuration (Platform & Slot Options)
   ═══════════════════════════════════════════════════════════ */

let appConfig = { platforms: ["test1", "test2", "test3"], slots: ["test1", "test2", "test3"] };
let configLoaded = false;

async function loadAppConfig() {
  try {
    appConfig = await fetch('/api/config').then(r => r.json());
    configLoaded = true;
    populateDropdownOptions();
    renderConfigLists();
  } catch (e) { console.error('Failed loading config', e); }
}

function populateDropdownOptions() {
  const filterPlat = document.getElementById('filter-platform');
  const filterSlot = document.getElementById('filter-slot');
  if (filterPlat) {
    const cur = filterPlat.value;
    filterPlat.innerHTML = '<option value="">All Platforms</option>' +
      (appConfig.platforms || []).map(p => `<option value="${p}">${p}</option>`).join('');
    filterPlat.value = cur;
  }
  if (filterSlot) {
    const cur = filterSlot.value;
    filterSlot.innerHTML = '<option value="">All Slots</option>' +
      (appConfig.slots || []).map(s => `<option value="${s}">${s}</option>`).join('');
    filterSlot.value = cur;
  }

  const sviewCard = document.getElementById('sview-card-name');
  const sviewPlat = document.getElementById('sview-platform');
  const sviewSlot = document.getElementById('sview-slot');
  if (sviewCard) {
    const cur = sviewCard.value;
    const inventoryCards = (typeof allInventoryData !== 'undefined' ? allInventoryData : [])
      .map(x => String(x.gift_card_name || '').trim())
      .filter(Boolean);
    const combinedCards = Array.from(new Set([...PREDEFINED_CARD_NAMES, ...inventoryCards])).sort();
    sviewCard.innerHTML = '<option value="">All Cards (PSN, LOL, Amazon, etc.)</option>' +
      combinedCards.map(c => `<option value="${c}">${c}</option>`).join('');
    sviewCard.value = cur;
  }
  if (sviewPlat) {
    const cur = sviewPlat.value;
    sviewPlat.innerHTML = '<option value="">All Platforms</option>' +
      (appConfig.platforms || []).map(p => `<option value="${p}">${p}</option>`).join('');
    sviewPlat.value = cur;
  }
  if (sviewSlot) {
    const cur = sviewSlot.value;
    sviewSlot.innerHTML = '<option value="">All Slots</option>' +
      (appConfig.slots || []).map(s => `<option value="${s}">${s}</option>`).join('');
    sviewSlot.value = cur;
  }

  const manPlat = document.getElementById('manual-platform');
  const manSlot = document.getElementById('manual-slot');
  const manCard = document.getElementById('manual-card-name');
  if (manPlat) manPlat.innerHTML = (appConfig.platforms || []).map(p => `<option value="${p}">${p}</option>`).join('');
  if (manSlot) manSlot.innerHTML = (appConfig.slots || []).map(s => `<option value="${s}">${s}</option>`).join('');
  if (manCard) manCard.innerHTML = PREDEFINED_CARD_NAMES.map(c => `<option value="${c}">${c}</option>`).join('');

  const editPlat = document.getElementById('edit-platform');
  const editSlot = document.getElementById('edit-slot');
  const editCard = document.getElementById('edit-card-name');
  if (editPlat) editPlat.innerHTML = (appConfig.platforms || []).map(p => `<option value="${p}">${p}</option>`).join('');
  if (editSlot) editSlot.innerHTML = (appConfig.slots || []).map(s => `<option value="${s}">${s}</option>`).join('');
  if (editCard) editCard.innerHTML = PREDEFINED_CARD_NAMES.map(c => `<option value="${c}">${c}</option>`).join('');
}

function renderConfigLists() {
  const pContainer = document.getElementById('platforms-list-container');
  const sContainer = document.getElementById('slots-list-container');
  if (pContainer) {
    pContainer.innerHTML = (appConfig.platforms || []).map((p, i) => `
      <div style="display:flex; justify-content:space-between; align-items:center; background:var(--surface-raised); padding: 6px 12px; border-radius: var(--r-sm, 4px);">
        <span class="fw-bold">${p}</span>
        <button class="btn btn-ghost text-danger" style="height:22px; padding:0 6px;" onclick="removePlatformOption(${i})">Delete</button>
      </div>
    `).join('');
  }
  if (sContainer) {
    sContainer.innerHTML = (appConfig.slots || []).map((s, i) => `
      <div style="display:flex; justify-content:space-between; align-items:center; background:var(--surface-raised); padding: 6px 12px; border-radius: var(--r-sm, 4px);">
        <span class="fw-bold">${s}</span>
        <button class="btn btn-ghost text-danger" style="height:22px; padding:0 6px;" onclick="removeSlotOption(${i})">Delete</button>
      </div>
    `).join('');
  }
}

async function addPlatformOption() {
  const input = document.getElementById('new-platform-input');
  const val = input ? input.value.trim() : '';
  if (!val) return;
  if (!appConfig.platforms) appConfig.platforms = [];
  if (appConfig.platforms.includes(val)) { alert('Platform already exists'); return; }
  appConfig.platforms.push(val);
  input.value = '';
  await saveConfigToServer('platforms', appConfig.platforms);
}

async function removePlatformOption(index) {
  if (!confirm(`Delete platform option "${appConfig.platforms[index]}"?`)) return;
  appConfig.platforms.splice(index, 1);
  await saveConfigToServer('platforms', appConfig.platforms);
}

async function addSlotOption() {
  const input = document.getElementById('new-slot-input');
  const val = input ? input.value.trim() : '';
  if (!val) return;
  if (!appConfig.slots) appConfig.slots = [];
  if (appConfig.slots.includes(val)) { alert('Slot already exists'); return; }
  appConfig.slots.push(val);
  input.value = '';
  await saveConfigToServer('slots', appConfig.slots);
}

async function removeSlotOption(index) {
  if (!confirm(`Delete slot option "${appConfig.slots[index]}"?`)) return;
  appConfig.slots.splice(index, 1);
  await saveConfigToServer('slots', appConfig.slots);
}

async function saveConfigToServer(key, items) {
  showSpinner();
  try {
    await fetch('/api/config/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, items })
    });
    populateDropdownOptions();
    renderConfigLists();
  } finally { hideSpinner(); }
}
