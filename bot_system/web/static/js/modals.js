/* ═══════════════════════════════════════════════════════════
   modals.js - Manual Entry, Edit Record, & Audit Details Modals
   ═══════════════════════════════════════════════════════════ */

let fpEditDate = null;

/* ── Audit Modal ── */
async function openAuditModal(id, source) {
  source = source || 'submission';
  document.getElementById('modal-audit-details').classList.add('open');
  document.getElementById('audit-details-content').innerHTML = `<div style="text-align:center;color:var(--subtle);padding:clamp(16px,2vh,24px);">Loading...</div>`;
  showSpinner();
  try {
    const json = await fetch(`/api/submission/details?id=${id}&source=${source}`).then(r => r.json());
    hideSpinner();
    if (!json.success || !json.data) {
      document.getElementById('audit-details-content').innerHTML = `<div class="text-danger">Failed to load details.</div>`;
      return;
    }
    const d = json.data;
    const isScammer = source === 'scammer';
    document.getElementById('audit-details-content').innerHTML = `
      ${isScammer ? `<div style="background:var(--danger-bg);border:1px solid rgba(220,38,38,0.2);border-radius:var(--r-md);padding:8px 12px;margin-bottom:10px;font-size:clamp(10px,0.7vw,12px);color:var(--danger);font-weight:600;">Flagged Scammer Record</div>` : ''}
      <div class="audit-grid">
        <div class="audit-row"><span class="audit-key">Record ID</span><span class="audit-val">#${d.id}</span></div>
        <div class="audit-row"><span class="audit-key">Order ID</span><span class="audit-val">${d.order_id || '—'}</span></div>
        <div class="audit-row"><span class="audit-key">Platform</span><span class="audit-val">${d.platform || 'test1'}</span></div>
        <div class="audit-row"><span class="audit-key">Slot</span><span class="audit-val">${d.slot || 'test1'}</span></div>
        <div class="audit-row"><span class="audit-key">Status</span><span class="audit-val">${statusDot(d.status || 'rejected')}</span></div>
        <div class="audit-row"><span class="audit-key">Phone</span><span class="audit-val">${d.phone_number || '—'}</span></div>
        <div class="audit-row"><span class="audit-key">Gift Card</span><span class="audit-val">${d.gift_card_name || '—'}</span></div>
        <div class="audit-row"><span class="audit-key">Amount</span><span class="audit-val">${d.total_amount ? (d.currency || 'Rs.') + d.total_amount : '—'}</span></div>
        <div class="audit-row"><span class="audit-key">Payout Term</span><span class="audit-val">${d.payout_term_days ? d.payout_term_days + ' Days' : '—'}</span></div>
        <div class="audit-row"><span class="audit-key">Submitted</span><span class="audit-val">${d.created_at_str}</span></div>
      </div>
      <div style="margin-bottom:clamp(8px,0.8vh,12px);">
        <div class="section-label">Payment Destination / UPI</div>
        <div class="code-block">${d.payment_details || '—'}</div>
      </div>
      <div style="margin-bottom:clamp(8px,0.8vh,12px);">
        <div class="section-label">${isScammer ? 'Flagged Code' : 'Extracted Codes'}</div>
        <div class="code-block">${d.gift_card_code || '—'}</div>
      </div>
      <div>
        <div class="section-label">${isScammer ? 'Flag Reason' : 'Raw Message Log'}</div>
        <div class="code-block" style="opacity:0.85;">${d.raw_message || '—'}</div>
      </div>
      <div style="margin-top:clamp(12px,1.5vh,18px);display:flex;justify-content:flex-end;">
        <button class="btn btn-danger" onclick="deleteRecordFromAudit(${d.id}, '${source}')">
          <i class="fa-solid fa-trash"></i> Move to Bin (Delete)
        </button>
      </div>
    `;
  } catch (e) {
    hideSpinner();
    document.getElementById('audit-details-content').innerHTML = `<div class="text-danger">Error loading data.</div>`;
  }
}

async function deleteRecordFromAudit(id, source) {
  if (!confirm('Are you sure you want to delete this record and move it to bin?')) return;
  showSpinner('Moving to bin...');
  try {
    await fetch('/api/submission/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, source })
    });
    closeAuditModal();
    hideSpinner('Moved to bin!');
    await fetchInventory();
  } catch (e) {
    console.error('Delete failed', e);
    hideSpinner('Delete failed!');
  }
}

function closeAuditModal() { document.getElementById('modal-audit-details').classList.remove('open'); }

/* ── Edit Modal ── */
async function openEditModal(id, source) {
  source = source || 'submission';
  showSpinner();
  try {
    if (typeof loadAppConfig === 'function') await loadAppConfig();
    const json = await fetch(`/api/submission/details?id=${id}&source=${source}`).then(r => r.json());
    if (!json.success || !json.data) {
      alert('Failed to load record details for editing.');
      return;
    }
    const d = json.data;
    document.getElementById('edit-id').value = id;
    document.getElementById('edit-source').value = source;
    document.getElementById('edit-order-id').value = d.order_id || '';
    document.getElementById('edit-phone').value = d.phone_number || '';

    if (fpEditDate) {
      fpEditDate.setDate(d.created_at_str || d.created_at || '', false);
    } else if (document.getElementById('edit-created-at')) {
      document.getElementById('edit-created-at').value = d.created_at_str || '';
    }

    document.getElementById('edit-card-name').value = d.gift_card_name || '';
    document.getElementById('edit-codes').value = d.gift_card_code || '';
    document.getElementById('edit-upi').value = d.payment_details || '';
    document.getElementById('edit-amount').value = d.total_amount || 0;
    document.getElementById('edit-currency').value = d.currency || 'Rs.';
    document.getElementById('edit-payout-term').value = String(d.payout_term_days || 6);
    document.getElementById('edit-card-type').value = String(d.card_type || 'NEW').toUpperCase();
    document.getElementById('edit-platform').value = d.platform || 'test1';
    document.getElementById('edit-slot').value = d.slot || 'test1';
    document.getElementById('edit-status').value = d.status || 'unpaid';

    document.getElementById('modal-edit-entry').classList.add('open');
  } catch (e) {
    alert('Error fetching details.');
  } finally {
    hideSpinner();
  }
}

function closeEditModal() {
  document.getElementById('modal-edit-entry').classList.remove('open');
}

async function saveEditRecord() {
  const id = document.getElementById('edit-id').value;
  const source = document.getElementById('edit-source').value;
  const orderId = document.getElementById('edit-order-id').value;
  const phone = document.getElementById('edit-phone').value;
  const createdAt = document.getElementById('edit-created-at').value;
  const cardName = document.getElementById('edit-card-name').value;
  const codes = document.getElementById('edit-codes').value;
  const upi = document.getElementById('edit-upi').value;
  const amount = document.getElementById('edit-amount').value;
  const currency = document.getElementById('edit-currency').value;
  const payoutTerm = document.getElementById('edit-payout-term').value;
  const cardType = document.getElementById('edit-card-type').value;
  const platform = document.getElementById('edit-platform').value;
  const slot = document.getElementById('edit-slot').value;
  const status = document.getElementById('edit-status').value;

  showSpinner();
  try {
    const res = await fetch('/api/submission/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: parseInt(id),
        source: source,
        order_id: orderId,
        phone_number: phone,
        created_at: createdAt,
        gift_card_name: cardName,
        gift_card_code: codes,
        payment_details: upi,
        total_amount: parseFloat(amount) || 0,
        currency: currency,
        payout_term_days: parseInt(payoutTerm) || 6,
        card_type: cardType,
        platform: platform,
        slot: slot,
        status: status
      })
    }).then(r => r.json());

    if (res.success) {
      closeEditModal();
      await fetchInventory();
    } else {
      alert(res.error || 'Failed to update record.');
    }
  } finally {
    hideSpinner();
  }
}

/* ── Manual Entry Modal ── */
async function openManualModal() {
  if (typeof loadAppConfig === 'function') await loadAppConfig();
  document.getElementById('modal-manual-entry').classList.add('open');
}
function closeManualModal() { document.getElementById('modal-manual-entry').classList.remove('open'); }

async function submitManualCode() {
  const orderId = document.getElementById('manual-order-id').value;
  const phone = document.getElementById('manual-phone').value;
  const cardName = document.getElementById('manual-card-name').value;
  const codesRaw = document.getElementById('manual-codes').value;
  const upi = document.getElementById('manual-upi').value;
  const amount = document.getElementById('manual-amount').value;
  const platform = document.getElementById('manual-platform').value;
  const slot = document.getElementById('manual-slot').value;
  const codes = codesRaw.split(/[\n,\s;]+/).map(c => c.trim()).filter(Boolean);
  if (!codes.length) { alert('Enter at least one gift card code.'); return; }
  showSpinner();
  try {
    const data = await fetch('/api/submission/manual-create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_id: orderId,
        phone_number: phone,
        gift_card_name: cardName,
        gift_card_codes: codes,
        payment_details: upi,
        total_amount: parseFloat(amount) || 0,
        platform: platform,
        slot: slot
      })
    }).then(r => r.json());
    alert(data.message || 'Saved.');
    closeManualModal();
    await fetchInventory();
  } finally { hideSpinner(); }
}
