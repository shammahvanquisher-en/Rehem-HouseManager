
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

import { 
  getFirestore
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBC5ZXNIN8LLzDIYltnVBNehlT7_fiXbsU",
  authDomain: "neema-house-manager.firebaseapp.com",
  projectId: "neema-house-manager",
  storageBucket: "neema-house-manager.firebasestorage.app",
  messagingSenderId: "999392215760",
  appId: "1:999392215760:web:08216e2c001da44b8254d5",
  measurementId: "G-V5B2RM1BDP"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const HOUSE_RENTS = {
  R1: 7000, R2: 7000, R3: 7000, R4: 7000,
  R5: 7000, R6: 5000, R7: 5000
};

const STORAGE = {
  tenants: "neemaTenants",
  archived: "neemaArchivedTenants",
  payments: "neemaPayments",
  charges: "neemaCharges",
  settings: "neemaSettings"
};

const $ = (selector, parent = document) => parent.querySelector(selector);

function loadArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function saveArray(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function loadObject(key, fallback = {}) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : fallback;
  } catch {
    return fallback;
  }
}

function money(value) {
  return "KSh " + Number(value || 0).toLocaleString("en-KE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

function escapeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function todayString() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function currentMonth() {
  return todayString().slice(0, 7);
}

function formatMonth(period) {
  if (!period || !/^\d{4}-\d{2}$/.test(period)) return period || "—";
  const [year, month] = period.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-KE", {
    month: "long",
    year: "numeric"
  });
}

function getTenants() {
  return loadArray(STORAGE.tenants);
}

function getPayments() {
  return loadArray(STORAGE.payments);
}

function getCharges() {
  return loadArray(STORAGE.charges);
}

function getSettings() {
  return {
    property: "NEEMA HOUSE",
    address: "P.O. Box 20104, NAKURU",
    phone: "0722965523",
    waterRate: 100,
    garbageDefault: 0,
    wifiDefault: 0,
    receivedBy: "",
    ...loadObject(STORAGE.settings, {})
  };
}

function setSettings(settings) {
  localStorage.setItem(STORAGE.settings, JSON.stringify(settings));
}

function showPage(page, title, description, html) {
  const content = $("#pageContent");
  if (!content) return;

  content.innerHTML = html;
  if ($("#pageTitle")) $("#pageTitle").textContent = title;
  if ($("#pageBreadcrumb")) $("#pageBreadcrumb").textContent = title;
  if ($("#pageDescription")) $("#pageDescription").textContent = description;

  document.querySelectorAll(".nav-link").forEach(button => {
    button.classList.toggle("active", button.dataset.page === page);
  });

  $("#sidebar")?.classList.remove("open");
  $("#mobileOverlay")?.classList.remove("show");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function pageHeader(label, description) {
  return `
    <div class="tenant-hero">
      <div>
        <p class="eyebrow">NEEMA HOUSE MANAGER</p>
        <h2>${escapeText(label)}</h2>
        <p>${escapeText(description)}</p>
      </div>
    </div>`;
}

function panel(title, subtitle, content) {
  return `
    <section class="panel tenant-panel">
      <div class="panel-heading tenant-panel-heading">
        <div>
          <h2>${escapeText(title)}</h2>
          <p>${escapeText(subtitle || "")}</p>
        </div>
      </div>
      ${content}
    </section>`;
}

function availableHouses(exceptId = null) {
  const occupied = getTenants()
    .filter(t => t.id !== exceptId)
    .map(t => t.house);

  return Object.keys(HOUSE_RENTS).filter(h => !occupied.includes(h));
}

function getTenant(id) {
  return getTenants().find(t => t.id === id) ||
    loadArray(STORAGE.archived).find(t => t.id === id);
}

function tenantName(id) {
  return getTenant(id)?.name || "Archived or unknown tenant";
}

function rentFor(tenant) {
  return Number(HOUSE_RENTS[tenant?.house] || 0);
}

function tenantBalance(tenantId) {
  const charges = getCharges().filter(c => c.tenantId === tenantId);
  const payments = getPayments().filter(p => p.tenantId === tenantId);

  const totalCharges = charges.reduce((sum, c) => sum + Number(c.total || 0), 0);
  const totalPayments = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const tenant = getTenant(tenantId);

  return totalCharges - totalPayments + Number(tenant?.openingBalance || 0);
}

function balanceLabel(balance) {
  if (balance > 0.009) return `Outstanding: ${money(balance)}`;
  if (balance < -0.009) return `Credit: ${money(Math.abs(balance))}`;
  return "Account settled";
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getChargeForPeriod(tenantId, period) {
  return getCharges().find(c =>
    c.tenantId === tenantId && c.month === period
  );
}

function chargeTotal({ rent, waterUnits, waterRate, garbage, wifi }) {
  return Number(rent || 0) +
    Number(waterUnits || 0) * Number(waterRate || 0) +
    Number(garbage || 0) +
    Number(wifi || 0);
}

function showDashboard() {
  const tenants = getTenants();
  const payments = getPayments();
  const monthPayments = payments.filter(p => p.date?.slice(0, 7) === currentMonth());
  const collected = monthPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const potential = Object.values(HOUSE_RENTS).reduce((sum, rent) => sum + rent, 0);
  const balances = tenants.map(tenant => ({
    tenant,
    balance: tenantBalance(tenant.id)
  }));
  const overdue = balances.filter(item => item.balance > 0.009);
  const totalOverdue = overdue.reduce((sum, item) => sum + item.balance, 0);

  const houseRows = Object.entries(HOUSE_RENTS).map(([house, rent]) => {
    const tenant = tenants.find(t => t.house === house);
    return `<tr>
      <td><strong>${house}</strong></td>
      <td>${money(rent)}</td>
      <td><span class="pill ${tenant ? "neutral" : "warning"}">${tenant ? escapeText(tenant.name) : "Vacant"}</span></td>
    </tr>`;
  }).join("");

  const overdueRows = overdue.length
    ? `<div class="table-wrap"><table>
        <thead><tr><th>Tenant</th><th>House</th><th>Balance</th></tr></thead>
        <tbody>${overdue.map(item => `<tr>
          <td>${escapeText(item.tenant.name)}</td>
          <td>${escapeText(item.tenant.house)}</td>
          <td>${money(item.balance)}</td>
        </tr>`).join("")}</tbody>
      </table></div>`
    : `<div class="empty-state"><div class="empty-icon">✓</div>
        <h3>No outstanding balances</h3>
        <p>Balances will appear when monthly charges are entered.</p></div>`;

  showPage("dashboard", "Dashboard", "Welcome to your rental management workspace.", `
    <div class="stats-grid">
      <article class="stat-card"><div class="stat-top"><span class="stat-label">Total Houses</span><span class="stat-icon green">⌂</span></div><h2>7</h2><p class="stat-note">${tenants.length} occupied</p></article>
      <article class="stat-card"><div class="stat-top"><span class="stat-label">Monthly Rent Potential</span><span class="stat-icon blue">KSh</span></div><h2>${money(potential)}</h2><p class="stat-note">If all houses are occupied</p></article>
      <article class="stat-card"><div class="stat-top"><span class="stat-label">Payments Collected</span><span class="stat-icon green">↗</span></div><h2>${money(collected)}</h2><p class="stat-note">This month</p></article>
      <article class="stat-card"><div class="stat-top"><span class="stat-label">Total Outstanding</span><span class="stat-icon red">!</span></div><h2>${money(totalOverdue)}</h2><p class="stat-note">Based on recorded charges</p></article>
    </div>
    <div class="dashboard-grid">
      ${panel("House Overview", "Monthly rent and occupancy", `<div class="table-wrap"><table><thead><tr><th>House</th><th>Monthly Rent</th><th>Tenant / Status</th></tr></thead><tbody>${houseRows}</tbody></table></div>`)}
      ${panel("Quick Actions", "Common tasks", `<div class="quick-actions">
        <button class="action-card" data-open-page="payments"><span class="action-icon green">＋</span><span><strong>Record Payment</strong><small>Enter charges and payment</small></span><span class="action-arrow">→</span></button>
        <button class="action-card" data-open-page="tenants"><span class="action-icon blue">♙</span><span><strong>Add Tenant</strong><small>Manage tenant details</small></span><span class="action-arrow">→</span></button>
        <button class="action-card" data-open-page="receipts"><span class="action-icon purple">▤</span><span><strong>View Receipts</strong><small>Find payment receipts</small></span><span class="action-arrow">→</span></button>
        <button class="action-card" data-open-page="arrears"><span class="action-icon red">◷</span><span><strong>Check Arrears</strong><small>Review outstanding charges</small></span><span class="action-arrow">→</span></button>
      </div>`)}
    </div>
    ${panel("Outstanding Balances", "Positive balances indicate money still owed.", overdueRows)}
    <p class="demo-notice"><strong>Important:</strong> Data is stored in this browser. Download backups regularly; this is not cloud storage.</p>
  `);
}

function showTenants() {
  const tenants = getTenants();
  const rows = tenants.length ? tenants.map(t => `
    <tr>
      <td><div class="tenant-person"><div class="tenant-avatar">${escapeText((t.name || "?").slice(0, 1).toUpperCase())}</div>
        <div><strong>${escapeText(t.name)}</strong><small>${escapeText(t.phone || "No phone")}</small></div></div></td>
      <td>${escapeText(t.house)}</td>
      <td>${money(rentFor(t))}</td>
      <td>${escapeText(t.moveIn || "—")}</td>
      <td>${money(tenantBalance(t.id))}</td>
      <td><div class="tenant-actions">
        <button class="tenant-edit-button" data-edit-tenant="${escapeText(t.id)}">Edit</button>
        <button class="tenant-moveout-button" data-moveout-tenant="${escapeText(t.id)}">Move out</button>
      </div></td>
    </tr>`).join("") : `<tr><td colspan="6">No tenants added yet.</td></tr>`;

  const available = availableHouses();
  const houseOptions = available.map(h =>
    `<option value="${h}">${h} — ${money(HOUSE_RENTS[h])}/month</option>`
  ).join("");

  showPage("tenants", "Tenants", "Add, update and archive tenant records.", `
    ${pageHeader("Tenant Management", "Manage tenant contact details, house assignments and balances.")}
    <div class="tenant-stats">
      <div class="tenant-stat"><span>Active tenants</span><strong>${tenants.length}</strong></div>
      <div class="tenant-stat"><span>Vacant houses</span><strong>${available.length}</strong></div>
      <div class="tenant-stat"><span>Monthly rent potential</span><strong>${money(tenants.reduce((sum,t) => sum + rentFor(t), 0))}</strong></div>
    </div>
    ${panel("Add Tenant", "Enter the tenant's details.", `
      <form id="tenantForm" class="tenant-form">
        <input type="hidden" id="tenantId">
        <label class="tenant-field">Full name<input id="tenantName" required maxlength="100" placeholder="Tenant's full name"></label>
        <label class="tenant-field">Phone number<input id="tenantPhone" maxlength="30" placeholder="07xx xxx xxx"></label>
        <label class="tenant-field">House<select id="tenantHouse" required>${houseOptions}</select></label>
        <label class="tenant-field">Move-in date<input id="tenantMoveIn" type="date"></label>
        <label class="tenant-field">Opening balance (KSh)<input id="tenantOpeningBalance" type="number" step="0.01" value="0"></label>
        <label class="tenant-field">Notes<input id="tenantNotes" maxlength="500" placeholder="Optional notes"></label>
        <div class="tenant-actions"><button class="primary-button" type="submit" id="tenantSubmit">Save Tenant</button><button type="button" class="text-button" id="tenantCancel">Clear form</button></div>
      </form>`)}
    ${panel("Current Tenants", "Move-out archives a tenant without deleting payment history.", `
      <div class="table-wrap"><table class="tenant-table">
        <thead><tr><th>Tenant</th><th>House</th><th>Rent</th><th>Move-in</th><th>Balance</th><th>Actions</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`)}
    ${panel("Archived Tenants", "Former tenants and their historical records.", archivedTenantRows())}
  `);
}

function archivedTenantRows() {
  const archived = loadArray(STORAGE.archived);
  if (!archived.length) return `<p class="table-note">No archived tenants yet.</p>`;

  return `<div class="table-wrap"><table><thead><tr><th>Name</th><th>House</th><th>Phone</th><th>Moved out</th></tr></thead><tbody>
    ${archived.map(t => `<tr><td>${escapeText(t.name)}</td><td>${escapeText(t.house)}</td><td>${escapeText(t.phone || "—")}</td><td>${escapeText(t.movedOut || "—")}</td></tr>`).join("")}
  </tbody></table></div>`;
}

function clearTenantForm() {
  $("#tenantForm")?.reset();
  if ($("#tenantId")) $("#tenantId").value = "";
  if ($("#tenantOpeningBalance")) $("#tenantOpeningBalance").value = "0";
  if ($("#tenantSubmit")) $("#tenantSubmit").textContent = "Save Tenant";

  const select = $("#tenantHouse");
  if (select) {
    const available = availableHouses();
    select.innerHTML = available.map(h =>
      `<option value="${h}">${h} — ${money(HOUSE_RENTS[h])}/month</option>`
    ).join("");
  }
}

function editTenant(id) {
  const tenant = getTenants().find(t => t.id === id);
  if (!tenant) return;

  const select = $("#tenantHouse");
  const available = availableHouses(id);
  select.innerHTML = [...new Set([...available, tenant.house])]
    .sort()
    .map(h => `<option value="${h}">${h} — ${money(HOUSE_RENTS[h])}/month</option>`).join("");

  $("#tenantId").value = tenant.id;
  $("#tenantName").value = tenant.name || "";
  $("#tenantPhone").value = tenant.phone || "";
  $("#tenantHouse").value = tenant.house;
  $("#tenantMoveIn").value = tenant.moveIn || "";
  $("#tenantOpeningBalance").value = Number(tenant.openingBalance || 0);
  $("#tenantNotes").value = tenant.notes || "";
  $("#tenantSubmit").textContent = "Update Tenant";
  $("#tenantForm").scrollIntoView({ behavior: "smooth", block: "start" });
}

function saveTenant(event) {
  event.preventDefault();

  const id = $("#tenantId").value;
  const tenants = getTenants();
  const name = $("#tenantName").value.trim();
  const house = $("#tenantHouse").value;

  if (!name || !house) {
    alert("Enter the tenant's name and select a house.");
    return;
  }

  if (tenants.some(t => t.house === house && t.id !== id)) {
    alert("That house is already assigned to another tenant.");
    return;
  }

  const previous = tenants.find(t => t.id === id);
  const tenant = {
    id: id || makeId(),
    name,
    phone: $("#tenantPhone").value.trim(),
    house,
    moveIn: $("#tenantMoveIn").value,
    openingBalance: Number($("#tenantOpeningBalance").value || 0),
    notes: $("#tenantNotes").value.trim(),
    createdAt: previous?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  saveArray(STORAGE.tenants, id
    ? tenants.map(t => t.id === id ? tenant : t)
    : [...tenants, tenant]
  );

  showTenants();
}

function moveOutTenant(id) {
  const tenant = getTenants().find(t => t.id === id);
  if (!tenant) return;

  if (!confirm(`Archive ${tenant.name} from ${tenant.house}? Payment history will be retained.`)) return;

  saveArray(STORAGE.tenants, getTenants().filter(t => t.id !== id));
  saveArray(STORAGE.archived, [
    ...loadArray(STORAGE.archived),
    { ...tenant, movedOut: todayString() }
  ]);
  showTenants();
}

function showRecordPayment() {
  const tenants = getTenants();
  const options = tenants.map(t =>
    `<option value="${escapeText(t.id)}">${escapeText(t.house)} — ${escapeText(t.name)}</option>`
  ).join("");
  const settings = getSettings();
  const recent = getPayments()
    .slice()
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
    .slice(0, 8);

  showPage("payments", "Record Payment", "Record monthly charges and a tenant payment.", `
    ${pageHeader("Record Manager", "Enter the billing month, charges and payment. Rent is due by the 5th of each month.")}
    <style>
      .rm-wrap{max-width:1100px;margin:0 auto}
      .rm-banner{background:linear-gradient(135deg,#0c1d33,#123d32);color:white;padding:24px;border-radius:18px;margin-bottom:18px}
      .rm-banner h2{margin:0 0 6px;font-size:25px}
      .rm-banner p{margin:0;color:#d6e8e0}
      .rm-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}
      .rm-tab{border:1px solid #d1d9e2;background:#fff;border-radius:10px;padding:10px 14px;cursor:pointer;font-weight:700}
      .rm-tab.active{background:#0f5132;color:#fff;border-color:#0f5132}
      .rm-section{display:none}
      .rm-section.active{display:block}
      .rm-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:15px}
      .rm-field{display:flex;flex-direction:column;gap:7px;margin-bottom:14px;font-weight:600;font-size:14px}
      .rm-field input,.rm-field select,.rm-field textarea{width:100%;box-sizing:border-box;padding:12px;border:1px solid #ccd5df;border-radius:10px;font:inherit;background:#fff;color:#172033}
      .rm-field input:focus,.rm-field select:focus,.rm-field textarea:focus{outline:2px solid #9bd6b5;border-color:#13834c}
      .rm-card{background:#f7faf8;border:1px solid #dce8df;border-radius:14px;padding:18px;margin:10px 0}
      .rm-card h3{margin:0 0 14px;color:#123d32}
      .rm-total{font-size:27px;font-weight:800;color:#0f5132}
      .rm-muted{font-size:13px;color:#687586}
      .rm-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:space-between;margin-top:20px}
      .rm-btn{border:0;border-radius:10px;padding:12px 18px;cursor:pointer;font-weight:700}
      .rm-btn-main{background:#0f5132;color:white}
      .rm-btn-light{background:#e8eee9;color:#1b3427}
      .rm-summary-row{display:flex;justify-content:space-between;gap:16px;padding:8px 0;border-bottom:1px solid #e0e7e2}
      @media(max-width:650px){.rm-grid{grid-template-columns:1fr}.rm-banner{padding:18px}.rm-tab{flex:1}}
    </style>
    <div class="rm-wrap">
      <div class="rm-banner">
        <h2>NEEMA HOUSE PROPERTY MANAGEMENT</h2>
        <p>${escapeText(settings.address)} · TEL ${escapeText(settings.phone)}</p>
        <p style="margin-top:10px">Monthly rent is due by the 5th. Electricity tokens are recorded separately from rent and other charges.</p>
      </div>
      ${tenants.length ? `
        <form id="paymentForm">
          <div class="rm-tabs">
            <button type="button" class="rm-tab active" data-rm-tab="tenant">1. Tenant</button>
            <button type="button" class="rm-tab" data-rm-tab="charges">2. Charges</button>
            <button type="button" class="rm-tab" data-rm-tab="payment">3. Payment</button>
            <button type="button" class="rm-tab" data-rm-tab="review">4. Review</button>
          </div>

          <section class="panel tenant-panel rm-section active" data-rm-section="tenant">
            <div class="panel-heading"><div><h2>Tenant and billing period</h2><p>Choose the tenant and month this payment relates to.</p></div></div>
            <div class="rm-grid">
              <label class="rm-field">Tenant / House
                <select id="paymentTenant" required>${options}</select>
              </label>
              <label class="rm-field">Payment date
                <input id="paymentDate" type="date" value="${todayString()}" required>
              </label>
              <label class="rm-field">Billing month
                <input id="paymentMonth" type="month" value="${currentMonth()}" required>
              </label>
              <label class="rm-field">Received by
                <input id="paymentReceivedBy" maxlength="100" value="${escapeText(settings.receivedBy || "")}" placeholder="Name of receiver">
              </label>
            </div>
            <div class="rm-card"><p class="rm-muted">If you are recording a second partial payment for the same tenant and month, choose the same billing month. The existing monthly charges will load instead of being added twice.</p></div>
            <div class="rm-actions"><span></span><button type="button" class="rm-btn rm-btn-main" data-rm-next="charges">Next: Charges →</button></div>
          </section>

          <section class="panel tenant-panel rm-section" data-rm-section="charges">
            <div class="panel-heading"><div><h2>Monthly charges</h2><p>Enter each charge once per tenant and billing month.</p></div></div>
            <div class="rm-grid">
              <label class="rm-field">Monthly rent (KSh)
                <input id="chargeRent" type="number" min="0" step="0.01" required>
              </label>
              <label class="rm-field">Water units used
                <input id="waterUnits" type="number" min="0" step="0.01" value="0" required>
              </label>
              <label class="rm-field">Water rate per unit (KSh)
                <input id="waterRate" type="number" min="0" step="0.01" value="${Number(settings.waterRate)}" required>
              </label>
              <label class="rm-field">Garbage charge (KSh)
                <input id="chargeGarbage" type="number" min="0" step="0.01" value="${Number(settings.garbageDefault)}" required>
              </label>
              <label class="rm-field">Wi-Fi charge (KSh)
                <input id="chargeWifi" type="number" min="0" step="0.01" value="${Number(settings.wifiDefault)}" required>
              </label>
            </div>
            <div class="rm-card">
              <h3>Charge calculation</h3>
              <div class="rm-summary-row"><span>Rent</span><strong id="rmRentTotal">KSh 0</strong></div>
              <div class="rm-summary-row"><span>Water</span><strong id="rmWaterTotal">KSh 0</strong></div>
              <div class="rm-summary-row"><span>Garbage</span><strong id="rmGarbageTotal">KSh 0</strong></div>
              <div class="rm-summary-row"><span>Wi-Fi</span><strong id="rmWifiTotal">KSh 0</strong></div>
              <div class="rm-summary-row"><span>Monthly charge total</span><strong id="rmChargeTotal" class="rm-total">KSh 0</strong></div>
              <p class="rm-muted">Electricity token costs are excluded from this total and from the tenant's account balance.</p>
            </div>
            <div class="rm-actions"><button type="button" class="rm-btn rm-btn-light" data-rm-prev="tenant">← Back</button><button type="button" class="rm-btn rm-btn-main" data-rm-next="payment">Next: Payment →</button></div>
          </section>

          <section class="panel tenant-panel rm-section" data-rm-section="payment">
            <div class="panel-heading"><div><h2>Payment details</h2><p>Record the amount actually received. Partial payments are allowed.</p></div></div>
            <div class="rm-grid">
              <label class="rm-field">Amount received (KSh)
                <input id="paymentAmount" type="number" min="0.01" step="0.01" required placeholder="e.g. 5000">
              </label>
              <label class="rm-field">Payment method
                <select id="paymentMethod" required>
                  <option value="M-Pesa">M-Pesa</option>
                  <option value="Cash">Cash</option>
                </select>
              </label>
              <label class="rm-field" id="mpesaField">M-Pesa reference
                <input id="paymentReference" maxlength="30" placeholder="e.g. QAB12XYZ">
              </label>
              <label class="rm-field">Electricity token number (optional)
                <input id="paymentToken" maxlength="60" placeholder="Enter token number">
              </label>
              <label class="rm-field">Electricity token cost (KSh, optional)
                <input id="tokenCost" type="number" min="0" step="0.01" value="0" placeholder="0">
              </label>
              <label class="rm-field">Notes (optional)
                <input id="paymentNotes" maxlength="250" placeholder="e.g. October rent part payment">
              </label>
            </div>
            <div class="rm-card">
              <h3>Account preview</h3>
              <div class="rm-summary-row"><span>Monthly charges</span><strong id="rmPreviewCharges">KSh 0</strong></div>
              <div class="rm-summary-row"><span>Amount received</span><strong id="rmPreviewPaid">KSh 0</strong></div>
              <div class="rm-summary-row"><span>Electricity token cost (separate)</span><strong id="rmPreviewToken">KSh 0</strong></div>
              <p class="rm-muted">The final account balance includes all previously recorded charges and payments. A negative balance represents tenant credit or advance payment.</p>
            </div>
            <div class="rm-actions"><button type="button" class="rm-btn rm-btn-light" data-rm-prev="charges">← Back</button><button type="button" class="rm-btn rm-btn-main" data-rm-next="review">Review →</button></div>
          </section>

          <section class="panel tenant-panel rm-section" data-rm-section="review">
            <div class="panel-heading"><div><h2>Review and save</h2><p>Confirm the details before creating a receipt.</p></div></div>
            <div class="rm-card" id="rmReviewSummary"></div>
            <div class="rm-actions">
              <button type="button" class="rm-btn rm-btn-light" data-rm-prev="payment">← Back</button>
              <button type="submit" class="rm-btn rm-btn-main">Save Payment & Create Receipt</button>
            </div>
          </section>
        </form>
      ` : `<div class="empty-state"><h3>Add a tenant first</h3><p>Create a tenant record before recording a payment.</p><button class="primary-button" data-open-page="tenants">Go to Tenants</button></div>`}
      ${panel("Recent Payments", "Latest saved payments.", paymentTable(recent))}
    </div>
  `);

  if (tenants.length) {
    setupRecordManager();
  }
}

function setupRecordManager() {
  const tenantSelect = $("#paymentTenant");
  const monthInput = $("#paymentMonth");
  if (!tenantSelect || !monthInput) return;

  function setTab(tab) {
    document.querySelectorAll("[data-rm-section]").forEach(section => {
      section.classList.toggle("active", section.dataset.rmSection === tab);
    });
    document.querySelectorAll("[data-rm-tab]").forEach(button => {
      button.classList.toggle("active", button.dataset.rmTab === tab);
    });
    if (tab === "review") updateReviewSummary();
  }

  function loadPeriodCharges() {
    const tenant = getTenant(tenantSelect.value);
    if (!tenant) return;

    const existing = getChargeForPeriod(tenant.id, monthInput.value);
    const settings = getSettings();

    $("#chargeRent").value = existing ? Number(existing.rent || 0) : rentFor(tenant);
    $("#waterUnits").value = existing ? Number(existing.waterUnits || 0) : 0;
    $("#waterRate").value = existing ? Number(existing.waterRate ?? settings.waterRate) : Number(settings.waterRate);
    $("#chargeGarbage").value = existing ? Number(existing.garbage || 0) : Number(settings.garbageDefault || 0);
    $("#chargeWifi").value = existing ? Number(existing.wifi || 0) : Number(settings.wifiDefault || 0);

    updateChargePreview();
  }

  function updateChargePreview() {
    const rent = Number($("#chargeRent").value || 0);
    const units = Number($("#waterUnits").value || 0);
    const rate = Number($("#waterRate").value || 0);
    const water = units * rate;
    const garbage = Number($("#chargeGarbage").value || 0);
    const wifi = Number($("#chargeWifi").value || 0);
    const total = rent + water + garbage + wifi;

    $("#rmRentTotal").textContent = money(rent);
    $("#rmWaterTotal").textContent = money(water);
    $("#rmGarbageTotal").textContent = money(garbage);
    $("#rmWifiTotal").textContent = money(wifi);
    $("#rmChargeTotal").textContent = money(total);
    $("#rmPreviewCharges").textContent = money(total);
    $("#rmPreviewPaid").textContent = money($("#paymentAmount").value || 0);
    $("#rmPreviewToken").textContent = money($("#tokenCost").value || 0);
  }

  function updateReviewSummary() {
    const tenant = getTenant(tenantSelect.value);
    if (!tenant) return;

    const units = Number($("#waterUnits").value || 0);
    const rate = Number($("#waterRate").value || 0);
    const rent = Number($("#chargeRent").value || 0);
    const water = units * rate;
    const garbage = Number($("#chargeGarbage").value || 0);
    const wifi = Number($("#chargeWifi").value || 0);
    const total = rent + water + garbage + wifi;
    const amount = Number($("#paymentAmount").value || 0);
    const tokenCostValue = Number($("#tokenCost").value || 0);

    $("#rmReviewSummary").innerHTML = `
      <h3>${escapeText(tenant.name)} — ${escapeText(tenant.house)}</h3>
      <p>Billing month: <strong>${escapeText(formatMonth(monthInput.value))}</strong></p>
      <div class="rm-summary-row"><span>Rent</span><strong>${money(rent)}</strong></div>
      <div class="rm-summary-row"><span>Water (${units} units × ${money(rate)})</span><strong>${money(water)}</strong></div>
      <div class="rm-summary-row"><span>Garbage</span><strong>${money(garbage)}</strong></div>
      <div class="rm-summary-row"><span>Wi-Fi</span><strong>${money(wifi)}</strong></div>
      <div class="rm-summary-row"><span>Total monthly charges</span><strong>${money(total)}</strong></div>
      <div class="rm-summary-row"><span>Amount received</span><strong>${money(amount)}</strong></div>
      <div class="rm-summary-row"><span>Payment method</span><strong>${escapeText($("#paymentMethod").value)}</strong></div>
      ${$("#paymentReference").value ? `<div class="rm-summary-row"><span>M-Pesa reference</span><strong>${escapeText($("#paymentReference").value.toUpperCase())}</strong></div>` : ""}
      <div class="rm-summary-row"><span>Electricity token cost (not an account charge)</span><strong>${money(tokenCostValue)}</strong></div>
      <p class="rm-muted">Please check the tenant, month and figures before saving.</p>
    `;
  }

  tenantSelect.addEventListener("change", loadPeriodCharges);
  monthInput.addEventListener("change", loadPeriodCharges);

  ["chargeRent", "waterUnits", "waterRate", "chargeGarbage", "chargeWifi", "paymentAmount", "tokenCost"].forEach(id => {
    $(`#${id}`)?.addEventListener("input", () => {
      updateChargePreview();
      updateReviewSummary();
    });
  });

  $("#paymentMethod")?.addEventListener("change", () => {
    const isMpesa = $("#paymentMethod").value === "M-Pesa";
    $("#mpesaField").style.display = isMpesa ? "" : "none";
    if (!isMpesa) $("#paymentReference").value = "";
    updateReviewSummary();
  });

  $("#paymentReference")?.addEventListener("input", updateReviewSummary);
  $("#paymentNotes")?.addEventListener("input", updateReviewSummary);

  loadPeriodCharges();
  updateChargePreview();

  // One delegated handler is used so the section controls work after every render.
  document.querySelectorAll("[data-rm-tab]").forEach(button => {
    button.addEventListener("click", () => setTab(button.dataset.rmTab));
  });

  document.querySelectorAll("[data-rm-next]").forEach(button => {
    button.addEventListener("click", () => {
      const target = button.dataset.rmNext;
      if (target === "payment" && !monthInput.value) {
        alert("Choose the billing month.");
        return;
      }
      setTab(target);
    });
  });

  document.querySelectorAll("[data-rm-prev]").forEach(button => {
    button.addEventListener("click", () => setTab(button.dataset.rmPrev));
  });

  // Start with the tenant section selected.
  setTab("tenant");
}

function paymentTable(payments) {
  if (!payments.length) return `<p class="table-note">No payments recorded yet.</p>`;

  return `<div class="table-wrap"><table>
    <thead><tr><th>Receipt</th><th>Date</th><th>Tenant</th><th>Method</th><th>Amount</th><th>Actions</th></tr></thead>
    <tbody>${payments.map(p => `<tr>
      <td>${escapeText(p.receiptNo || "—")}</td>
      <td>${escapeText(p.date || "—")}</td>
      <td>${escapeText(p.tenantName || tenantName(p.tenantId))}</td>
      <td>${escapeText(p.method || "—")}</td>
      <td>${money(p.amount)}</td>
      <td><button class="text-button" data-view-receipt="${escapeText(p.id)}">View</button></td>
    </tr>`).join("")}</tbody>
  </table></div>`;
}

function savePayment(event) {
  event.preventDefault();

  const tenant = getTenants().find(t => t.id === $("#paymentTenant")?.value);
  if (!tenant) {
    alert("Please select an active tenant.");
    return;
  }

  const date = $("#paymentDate").value || todayString();
  const month = $("#paymentMonth").value;
  const amount = Number($("#paymentAmount").value);
  const method = $("#paymentMethod").value;
  const reference = $("#paymentReference").value.trim().toUpperCase();

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    alert("Choose a valid billing month.");
    return;
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    alert("Enter an amount received greater than zero.");
    return;
  }

  if (method === "M-Pesa" && !reference) {
    alert("Enter the M-Pesa reference code.");
    return;
  }

  if (method === "M-Pesa" && getPayments().some(p =>
    p.reference?.toUpperCase() === reference
  )) {
    alert("That M-Pesa reference has already been used.");
    return;
  }

  const rent = Number($("#chargeRent").value || 0);
  const waterUnits = Number($("#waterUnits").value || 0);
  const waterRate = Number($("#waterRate").value || 0);
  const garbage = Number($("#chargeGarbage").value || 0);
  const wifi = Number($("#chargeWifi").value || 0);
  const tokenCostValue = Number($("#tokenCost").value || 0);

  if ([rent, waterUnits, waterRate, garbage, wifi, tokenCostValue].some(v => !Number.isFinite(v) || v < 0)) {
    alert("Charges, units, rates and token cost cannot be negative or invalid.");
    return;
  }

  if (method === "Cash" && reference) {
    // A cash payment does not retain an M-Pesa reference.
  }

  const total = chargeTotal({ rent, waterUnits, waterRate, garbage, wifi });
  const charges = getCharges();
  const existingIndex = charges.findIndex(c =>
    c.tenantId === tenant.id && c.month === month
  );

  const oldCharge = existingIndex >= 0 ? charges[existingIndex] : null;
  const chargeRecord = {
    ...(oldCharge || {}),
    id: oldCharge?.id || makeId(),
    tenantId: tenant.id,
    tenantName: tenant.name,
    house: tenant.house,
    month,
    rent,
    waterUnits,
    waterRate,
    water: waterUnits * waterRate,
    garbage,
    wifi,
    total,
    createdAt: oldCharge?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // Update the monthly charge instead of duplicating it for each partial payment.
  if (existingIndex >= 0) {
    charges[existingIndex] = chargeRecord;
  } else {
    charges.push(chargeRecord);
  }
  saveArray(STORAGE.charges, charges);

  const payments = getPayments();
  const nextNumber = Math.max(0, ...payments.map(p => Number(p.receiptSequence || 0))) + 1;
  const settings = getSettings();

  const payment = {
    id: makeId(),
    receiptSequence: nextNumber,
    receiptNo: String(nextNumber).padStart(4, "0"),
    tenantId: tenant.id,
    tenantName: tenant.name,
    house: tenant.house,
    date,
    month,
    amount,
    method,
    reference: method === "M-Pesa" ? reference : "",
    token: $("#paymentToken").value.trim(),
    tokenCost: tokenCostValue,
    notes: $("#paymentNotes").value.trim(),
    receivedBy: $("#paymentReceivedBy").value.trim() || settings.receivedBy || "",
    chargesSnapshot: { ...chargeRecord },
    createdAt: new Date().toISOString()
  };

  payments.push(payment);
  saveArray(STORAGE.payments, payments);

  alert(`Payment saved. Receipt number: ${payment.receiptNo}`);
  showReceipt(payment.id);
}

function getPaymentCharge(payment) {
  if (payment.chargesSnapshot) return payment.chargesSnapshot;
  return getChargeForPeriod(payment.tenantId, payment.month || payment.date?.slice(0, 7)) || null;
}

function showReceipt(id) {
  const payment = getPayments().find(p => p.id === id);
  if (!payment) {
    alert("Receipt not found.");
    return;
  }

  const settings = getSettings();
  const charge = getPaymentCharge(payment);
  const tenant = getTenant(payment.tenantId);
  const water = Number(charge?.water ?? (Number(charge?.waterUnits || 0) * Number(charge?.waterRate || 0)));
  const tokenCostValue = Number(payment.tokenCost || 0);
  const balance = tenant ? tenantBalance(tenant.id) : 0;

  const chargeRows = charge ? `
    <tr><td>Monthly rent</td><td>${money(charge.rent)}</td></tr>
    <tr><td>Water (${Number(charge.waterUnits || 0)} units × ${money(charge.waterRate)})</td><td>${money(water)}</td></tr>
    <tr><td>Garbage</td><td>${money(charge.garbage)}</td></tr>
    <tr><td>Wi-Fi</td><td>${money(charge.wifi)}</td></tr>
    <tr class="receipt-total"><td><strong>Total monthly charges</strong></td><td><strong>${money(charge.total)}</strong></td></tr>
  ` : `<tr><td>Monthly charges</td><td>Not available for this older receipt</td></tr>`;

  const receipt = `
    <div id="printReceipt" style="max-width:760px;margin:0 auto;padding:32px;background:#fff;color:#172033;border:1px solid #e1e6ec;border-radius:12px">
      <div style="text-align:center;border-bottom:3px solid #15803d;padding-bottom:18px;margin-bottom:22px">
        <h1 style="margin:0 0 8px;color:#0f5132;font-size:29px">${escapeText(settings.property || "NEEMA HOUSE")}</h1>
        <p style="margin:4px 0">${escapeText(settings.address || "P.O. Box 20104, NAKURU")}</p>
        <p style="margin:4px 0">TEL: ${escapeText(settings.phone || "0722965523")}</p>
        <strong>Rent payable by the 5th of every month</strong>
      </div>
      <h2 style="text-align:center;letter-spacing:2px">PAYMENT RECEIPT</h2>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:20px 0">
        <div><strong>Receipt No:</strong> ${escapeText(payment.receiptNo)}</div>
        <div><strong>Payment date:</strong> ${escapeText(payment.date)}</div>
        <div><strong>Tenant:</strong> ${escapeText(payment.tenantName)}</div>
        <div><strong>House:</strong> ${escapeText(payment.house)}</div>
        <div><strong>Billing month:</strong> ${escapeText(formatMonth(payment.month || payment.date?.slice(0, 7)))}</div>
        <div><strong>Method:</strong> ${escapeText(payment.method)}</div>
      </div>
      <table style="width:100%;border-collapse:collapse;margin:20px 0">
        <thead><tr><th style="text-align:left;border-bottom:2px solid #15803d;padding:10px">Description</th><th style="text-align:right;border-bottom:2px solid #15803d;padding:10px">Amount</th></tr></thead>
        <tbody>
          ${chargeRows}
          <tr><td style="padding:10px">Payment received this time</td><td style="padding:10px;text-align:right">${money(payment.amount)}</td></tr>
        </tbody>
      </table>
      <div style="background:#f0f7f2;border-radius:10px;padding:16px;margin:18px 0">
        <p style="margin:4px 0"><strong>Account position:</strong> ${escapeText(balanceLabel(balance))}</p>
        <p style="margin:4px 0"><strong>Current account balance:</strong> ${money(balance)}</p>
        <p style="margin:4px 0;font-size:12px;color:#586574">Positive = outstanding amount. Negative = tenant credit/advance.</p>
      </div>
      ${payment.reference ? `<p><strong>M-Pesa reference:</strong> ${escapeText(payment.reference)}</p>` : ""}
      ${payment.token ? `<p><strong>Electricity token number:</strong> ${escapeText(payment.token)}</p>` : ""}
      ${tokenCostValue > 0 ? `<p><strong>Electricity token cost (separate from rent account):</strong> ${money(tokenCostValue)}</p>` : ""}
      ${payment.notes ? `<p><strong>Notes:</strong> ${escapeText(payment.notes)}</p>` : ""}
      <p><strong>Received by:</strong> ${escapeText(payment.receivedBy || "________________")}</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:42px">
        <div style="border-top:1px solid #8a96a5;padding-top:8px">Tenant signature</div>
        <div style="border-top:1px solid #8a96a5;padding-top:8px">Authorised signature</div>
      </div>
      <p style="font-size:12px;text-align:center;color:#687586;margin-top:28px">Thank you. Please keep this receipt for your records.</p>
    </div>`;

  showPage("receipts", "Receipt", "View, print or download the receipt as a PNG image.", `
    <div class="tenant-actions" style="margin-bottom:18px;gap:10px;flex-wrap:wrap">
      <button class="primary-button" id="printReceiptBtn">Print / Save as PDF</button>
      <button class="primary-button" id="downloadReceiptPngBtn" data-receipt-png="${escapeText(payment.id)}">Download Receipt PNG</button>
      <button class="text-button" data-open-page="payments">Back to Payments</button>
    </div>
    ${receipt}`);
}

function downloadReceiptPNG(paymentId) {
  const payment = getPayments().find(p => p.id === paymentId);
  if (!payment) {
    alert("Receipt not found.");
    return;
  }

  const settings = getSettings();
  const charge = getPaymentCharge(payment);
  const tenant = getTenant(payment.tenantId);
  const balance = tenant ? tenantBalance(tenant.id) : 0;
  const water = Number(charge?.water ?? Number(charge?.waterUnits || 0) * Number(charge?.waterRate || 0));

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const width = 1000;
  const margin = 70;
  const lineHeight = 38;
  const rows = [];

  rows.push([`Receipt No: ${payment.receiptNo || "—"}`, `Date: ${payment.date || "—"}`]);
  rows.push([`Tenant: ${payment.tenantName || tenantName(payment.tenantId)}`, `House: ${payment.house || "—"}`]);
  rows.push([`Billing month: ${formatMonth(payment.month || payment.date?.slice(0, 7))}`, `Method: ${payment.method || "—"}`]);

  const chargeLines = charge ? [
    ["Monthly rent", money(charge.rent)],
    [`Water (${Number(charge.waterUnits || 0)} units × ${money(charge.waterRate)})`, money(water)],
    ["Garbage", money(charge.garbage)],
    ["Wi-Fi", money(charge.wifi)],
    ["Total monthly charges", money(charge.total)]
  ] : [["Monthly charges", "Not available on older receipt"]];

  const extras = [
    `Payment received: ${money(payment.amount)}`,
    ...(payment.reference ? [`M-Pesa reference: ${payment.reference}`] : []),
    ...(payment.token ? [`Electricity token: ${payment.token}`] : []),
    ...(Number(payment.tokenCost || 0) > 0 ? [`Electricity token cost (separate): ${money(payment.tokenCost)}`] : []),
    ...(payment.notes ? [`Notes: ${payment.notes}`] : []),
    `Received by: ${payment.receivedBy || "________________"}`,
    `Account position: ${balanceLabel(balance)}`,
    `Current account balance: ${money(balance)}`
  ];

  const height = 1080 + chargeLines.length * 48 + extras.length * 44;
  canvas.width = width;
  canvas.height = height;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#0f5132";
  ctx.fillRect(0, 0, width, 18);

  ctx.textAlign = "center";
  ctx.fillStyle = "#0f5132";
  ctx.font = "bold 42px Arial";
  ctx.fillText(settings.property || "NEEMA HOUSE", width / 2, 90);

  ctx.fillStyle = "#354052";
  ctx.font = "24px Arial";
  ctx.fillText(settings.address || "P.O. Box 20104, NAKURU", width / 2, 130);
  ctx.fillText(`TEL: ${settings.phone || "0722965523"}`, width / 2, 166);

  ctx.fillStyle = "#0f5132";
  ctx.font = "bold 23px Arial";
  ctx.fillText("RENT PAYABLE BY THE 5TH OF EVERY MONTH", width / 2, 210);

  ctx.strokeStyle = "#15803d";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(margin, 240);
  ctx.lineTo(width - margin, 240);
  ctx.stroke();

  ctx.fillStyle = "#172033";
  ctx.font = "bold 34px Arial";
  ctx.fillText("PAYMENT RECEIPT", width / 2, 295);

  ctx.textAlign = "left";
  ctx.font = "22px Arial";
  let y = 360;

  rows.forEach(row => {
    ctx.fillStyle = "#172033";
    ctx.fillText(row[0], margin, y, 430);
    ctx.fillText(row[1], width / 2 + 10, y, 400);
    y += lineHeight + 8;
  });

  y += 20;
  ctx.fillStyle = "#0f5132";
  ctx.fillRect(margin, y, width - margin * 2, 48);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 22px Arial";
  ctx.fillText("CHARGE DESCRIPTION", margin + 14, y + 31);
  ctx.textAlign = "right";
  ctx.fillText("AMOUNT", width - margin - 14, y + 31);
  y += 48;

  ctx.textAlign = "left";
  ctx.font = "21px Arial";

  chargeLines.forEach((row, index) => {
    if (index % 2 === 0) {
      ctx.fillStyle = "#f2f7f3";
      ctx.fillRect(margin, y, width - margin * 2, 46);
    }
    ctx.fillStyle = "#172033";
    ctx.font = index === chargeLines.length - 1 ? "bold 21px Arial" : "21px Arial";
    ctx.fillText(row[0], margin + 14, y + 29, 650);
    ctx.textAlign = "right";
    ctx.fillText(row[1], width - margin - 14, y + 29);
    ctx.textAlign = "left";
    y += 46;
  });

  y += 24;
  ctx.fillStyle = "#eaf5ed";
  ctx.fillRect(margin, y, width - margin * 2, extras.length * 44 + 28);
  y += 38;
  ctx.fillStyle = "#172033";
  ctx.font = "21px Arial";

  extras.forEach(line => {
    ctx.textAlign = "left";
    ctx.fillText(line, margin + 16, y, width - margin * 2 - 32);
    y += 44;
  });

  y += 45;
  ctx.strokeStyle = "#7b8794";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(margin, y);
  ctx.lineTo(width / 2 - 35, y);
  ctx.moveTo(width / 2 + 35, y);
  ctx.lineTo(width - margin, y);
  ctx.stroke();

  ctx.fillStyle = "#354052";
  ctx.font = "18px Arial";
  ctx.textAlign = "left";
  ctx.fillText("Tenant signature", margin, y + 30);
  ctx.fillText("Authorised signature", width / 2 + 35, y + 30);

  ctx.textAlign = "center";
  ctx.fillStyle = "#687586";
  ctx.font = "17px Arial";
  ctx.fillText("Thank you. Please keep this receipt for your records.", width / 2, y + 85);

  canvas.toBlob(blob => {
    if (!blob) {
      alert("Could not generate the PNG. Please try Print / Save as PDF.");
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Neema-House-Receipt-${payment.receiptNo || payment.id}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }, "image/png");
}

function showReceipts() {
  const payments = getPayments().slice()
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  showPage("receipts", "Receipts", "Find and download saved payment receipts.", `
    ${pageHeader("Payment Receipts", "Every saved payment has a receipt number.")}
    ${panel("All Receipts", "Select View to open a receipt.", paymentTable(payments))}
  `);
}

function showHistory() {
  const payments = getPayments().slice()
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  showPage("history", "Payment History", "Review all recorded payments.", `
    ${pageHeader("Payment History", "A record of payments entered into this browser.")}
    ${panel("Payment Records", `${payments.length} payment(s) recorded`, paymentTable(payments))}
  `);
}

function showHouses() {
  const tenants = getTenants();
  const rows = Object.entries(HOUSE_RENTS).map(([house, rent]) => {
    const tenant = tenants.find(t => t.house === house);
    return `<tr><td><strong>${house}</strong></td><td>${money(rent)}</td><td>${tenant ? escapeText(tenant.name) : "Vacant"}</td><td>${tenant ? escapeText(tenant.phone || "—") : "—"}</td></tr>`;
  }).join("");

  showPage("houses", "Houses", "View rental units, rents and occupancy.", `
    ${pageHeader("House Management", "Monthly rents are set to your current house rates.")}
    ${panel("Rental Units", "Monthly rent by house.", `<div class="table-wrap"><table><thead><tr><th>House</th><th>Rent</th><th>Tenant</th><th>Phone</th></tr></thead><tbody>${rows}</tbody></table></div>`)}
  `);
}

function showArrears() {
  const rows = getTenants().map(t => ({ t, balance: tenantBalance(t.id) }))
    .filter(x => x.balance > 0.009);

  const total = rows.reduce((sum, x) => sum + x.balance, 0);
  const html = rows.length ? `<div class="table-wrap"><table><thead><tr><th>Tenant</th><th>House</th><th>Phone</th><th>Outstanding</th></tr></thead><tbody>
    ${rows.map(x => `<tr><td>${escapeText(x.t.name)}</td><td>${escapeText(x.t.house)}</td><td>${escapeText(x.t.phone || "—")}</td><td>${money(x.balance)}</td></tr>`).join("")}
  </tbody></table></div>` : `<div class="empty-state"><h3>No recorded arrears</h3><p>Outstanding balances will appear here when monthly charges are entered.</p></div>`;

  showPage("arrears", "Arrears", "Review outstanding balances from entered charges.", `
    ${pageHeader("Arrears Overview", "Balances are calculated from charges less payments.")}
    <div class="stats-grid"><article class="stat-card"><span class="stat-label">Total Outstanding</span><h2>${money(total)}</h2></article><article class="stat-card"><span class="stat-label">Tenants with Balances</span><h2>${rows.length}</h2></article></div>
    ${panel("Tenant Balances", "Outstanding charges less recorded payments.", html)}
  `);
}

function showReports() {
  const payments = getPayments();
  const charges = getCharges();
  const thisMonth = payments.filter(p => p.date?.slice(0, 7) === currentMonth());
  const total = list => list.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const cash = payments.filter(p => p.method === "Cash");
  const mpesa = payments.filter(p => p.method === "M-Pesa");
  const waterTotal = charges.reduce((sum, c) => sum + Number(c.water || 0), 0);
  const garbageTotal = charges.reduce((sum, c) => sum + Number(c.garbage || 0), 0);
  const wifiTotal = charges.reduce((sum, c) => sum + Number(c.wifi || 0), 0);
  const rentTotal = charges.reduce((sum, c) => sum + Number(c.rent || 0), 0);
  const tokenTotal = payments.reduce((sum, p) => sum + Number(p.tokenCost || 0), 0);

  showPage("reports", "Reports", "Summary of recorded collections and monthly charges.", `
    ${pageHeader("Collection Reports", "Reports use payments and charges saved in this browser.")}
    <div class="stats-grid">
      <article class="stat-card"><span class="stat-label">Collected This Month</span><h2>${money(total(thisMonth))}</h2></article>
      <article class="stat-card"><span class="stat-label">All Collections</span><h2>${money(total(payments))}</h2></article>
      <article class="stat-card"><span class="stat-label">Cash Collections</span><h2>${money(total(cash))}</h2></article>
      <article class="stat-card"><span class="stat-label">M-Pesa Collections</span><h2>${money(total(mpesa))}</h2></article>
    </div>
    ${panel("Charge Totals", "Totals across the monthly charge records currently stored.", `
      <div class="table-wrap"><table><thead><tr><th>Charge type</th><th>Total</th></tr></thead><tbody>
        <tr><td>Rent</td><td>${money(rentTotal)}</td></tr>
        <tr><td>Water</td><td>${money(waterTotal)}</td></tr>
        <tr><td>Garbage</td><td>${money(garbageTotal)}</td></tr>
        <tr><td>Wi-Fi</td><td>${money(wifiTotal)}</td></tr>
        <tr><td>Electricity token costs recorded separately</td><td>${money(tokenTotal)}</td></tr>
      </tbody></table></div>`)}
    ${panel("Payment Totals", "Breakdown by payment method.", `<div class="table-wrap"><table><thead><tr><th>Method</th><th>Number of payments</th><th>Total</th></tr></thead><tbody><tr><td>Cash</td><td>${cash.length}</td><td>${money(total(cash))}</td></tr><tr><td>M-Pesa</td><td>${mpesa.length}</td><td>${money(total(mpesa))}</td></tr></tbody></table></div>`)}
  `);
}

function showSettings() {
  const settings = getSettings();

  showPage("settings", "Settings", "Update property details and back up local records.", `
    ${pageHeader("Property Settings", "Changes apply to receipts generated in this browser.")}
    ${panel("Property Details", "Edit the details printed on receipts.", `
      <form id="settingsForm" class="tenant-form">
        <label class="tenant-field">Property name<input id="settingProperty" required value="${escapeText(settings.property)}"></label>
        <label class="tenant-field">Postal address<input id="settingAddress" value="${escapeText(settings.address)}"></label>
        <label class="tenant-field">Phone number<input id="settingPhone" value="${escapeText(settings.phone)}"></label>
        <label class="tenant-field">Water rate per unit (KSh)<input id="settingWaterRate" type="number" min="0" step="0.01" value="${Number(settings.waterRate ?? 100)}"></label>
        <label class="tenant-field">Default garbage charge (KSh)<input id="settingGarbage" type="number" min="0" step="0.01" value="${Number(settings.garbageDefault || 0)}"></label>
        <label class="tenant-field">Default Wi-Fi charge (KSh)<input id="settingWifi" type="number" min="0" step="0.01" value="${Number(settings.wifiDefault || 0)}"></label>
        <label class="tenant-field">Received by<input id="settingReceivedBy" value="${escapeText(settings.receivedBy || "")}"></label>
        <button class="primary-button" type="submit">Save Settings</button>
      </form>`)}
    ${panel("Data Backup", "Download or restore records stored in this browser.", `
      <p class="table-note">Keep backups safe. The export includes tenant details, payments, charges, archived tenants and settings.</p>
      <button class="primary-button" id="exportBackupBtn">Download Backup (JSON)</button>
      <label class="tenant-field" style="margin-top:18px">Restore from a JSON backup<input id="restoreBackupFile" type="file" accept=".json,application/json"></label>
      <button class="text-button" id="restoreBackupBtn">Restore Selected Backup</button>
      <p class="demo-notice">Restoring replaces the current local records. Export a backup first.</p>`)}
  `);
}

function exportBackup() {
  const data = {
    exportedAt: new Date().toISOString(),
    tenants: getTenants(),
    archivedTenants: loadArray(STORAGE.archived),
    payments: getPayments(),
    charges: getCharges(),
    settings: getSettings()
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `neema-house-backup-${todayString()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function restoreBackup() {
  const file = $("#restoreBackupFile")?.files?.[0];
  if (!file) {
    alert("Choose a backup JSON file first.");
    return;
  }

  if (!confirm("Restore this backup? Current local records will be replaced.")) return;

  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.tenants) || !Array.isArray(data.payments)) {
      throw new Error("This does not look like a valid Neema House backup.");
    }

    saveArray(STORAGE.tenants, data.tenants);
    saveArray(STORAGE.archived, Array.isArray(data.archivedTenants) ? data.archivedTenants : []);
    saveArray(STORAGE.payments, data.payments);
    saveArray(STORAGE.charges, Array.isArray(data.charges) ? data.charges : []);
    setSettings({ ...getSettings(), ...(data.settings || {}) });

    alert("Backup restored in this browser.");
    showDashboard();
  } catch (error) {
    alert(`Could not restore backup: ${error.message}`);
  }
}

function openPage(page) {
  const pages = {
    dashboard: showDashboard,
    payments: showRecordPayment,
    receipts: showReceipts,
    history: showHistory,
    tenants: showTenants,
    houses: showHouses,
    arrears: showArrears,
    reports: showReports,
    settings: showSettings
  };

  (pages[page] || showDashboard)();
}

document.addEventListener("click", event => {
  const nav = event.target.closest("[data-page]");
  if (nav) {
    event.preventDefault();
    openPage(nav.dataset.page);
    return;
  }

  const quickAction = event.target.closest("[data-open-page]");
  if (quickAction) {
    event.preventDefault();
    openPage(quickAction.dataset.openPage);
    return;
  }

  const editButton = event.target.closest("[data-edit-tenant]");
  if (editButton) {
    editTenant(editButton.dataset.editTenant);
    return;
  }

  const moveOutButton = event.target.closest("[data-moveout-tenant]");
  if (moveOutButton) {
    moveOutTenant(moveOutButton.dataset.moveoutTenant);
    return;
  }

  const receiptButton = event.target.closest("[data-view-receipt]");
  if (receiptButton) {
    showReceipt(receiptButton.dataset.viewReceipt);
    return;
  }

  const pngButton = event.target.closest("[data-receipt-png]");
  if (pngButton) {
    downloadReceiptPNG(pngButton.dataset.receiptPng);
    return;
  }

  if (event.target.closest("#tenantCancel")) {
    clearTenantForm();
    return;
  }

  if (event.target.closest("#printReceiptBtn")) {
    window.print();
    return;
  }

  if (event.target.closest("#exportBackupBtn")) {
    exportBackup();
    return;
  }

  if (event.target.closest("#restoreBackupBtn")) {
    restoreBackup();
  }
});

document.addEventListener("submit", event => {
  if (event.target.id === "tenantForm") saveTenant(event);
  if (event.target.id === "paymentForm") savePayment(event);

  if (event.target.id === "settingsForm") {
    event.preventDefault();

    const waterRate = Number($("#settingWaterRate").value);
    const garbageDefault = Number($("#settingGarbage").value);
    const wifiDefault = Number($("#settingWifi").value);

    if ([waterRate, garbageDefault, wifiDefault].some(value => !Number.isFinite(value) || value < 0)) {
      alert("Water, garbage and Wi-Fi rates cannot be negative.");
      return;
    }

    setSettings({
      property: $("#settingProperty").value.trim() || "NEEMA HOUSE",
      address: $("#settingAddress").value.trim() || "P.O. Box 20104, NAKURU",
      phone: $("#settingPhone").value.trim() || "0722965523",
      waterRate,
      garbageDefault,
      wifiDefault,
      receivedBy: $("#settingReceivedBy").value.trim()
    });

    alert("Settings saved.");
    showSettings();
  }
});

const menuToggle = $("#menuToggle");
menuToggle?.addEventListener("click", () => {
  $("#sidebar")?.classList.toggle("open");
  $("#mobileOverlay")?.classList.toggle("show");
});

$("#mobileOverlay")?.addEventListener("click", () => {
  $("#sidebar")?.classList.remove("open");
  $("#mobileOverlay")?.classList.remove("show");
});

const todayElement = $("#today");
if (todayElement) {
  todayElement.textContent = new Date().toLocaleDateString("en-KE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

// ==========================================
// FIREBASE AUTHENTICATION + CLOUD SYNC
// ==========================================

const CLOUD_DOCUMENT = doc(db, "properties", "neema-house");

const CLOUD_KEYS = [
  STORAGE.tenants,
  STORAGE.archived,
  STORAGE.payments,
  STORAGE.charges,
  STORAGE.settings
];

let cloudReady = false;
let applyingCloudData = false;
let cloudWriteTimer = null;
let unsubscribeCloud = null;
let currentUser = null;

function showLoginScreen(message = "") {
  let screen = document.getElementById("firebaseLoginScreen");

  if (!screen) {
    screen = document.createElement("div");
    screen.id = "firebaseLoginScreen";

    screen.style.cssText = `
      position:fixed;inset:0;z-index:99999;
      display:flex;align-items:center;justify-content:center;
      padding:20px;background:#f3f7f4;font-family:Arial,sans-serif;
    `;

    screen.innerHTML = `
      <form id="firebaseLoginForm" style="
        width:100%;max-width:400px;background:white;padding:28px;
        border-radius:16px;box-shadow:0 10px 35px #0001;
        box-sizing:border-box;
      ">
        <h1 style="color:#0f5132;margin-top:0">NEEMA HOUSE</h1>
        <p>Sign in to access your rental records and cloud sync.</p>

        <label style="display:block;margin:18px 0 6px">Email address</label>
        <input id="firebaseEmail" type="email" required autocomplete="username"
          style="box-sizing:border-box;width:100%;padding:12px;border:1px solid #ccd5df;border-radius:8px">

        <label style="display:block;margin:18px 0 6px">Password</label>
        <input id="firebasePassword" type="password" required
          autocomplete="current-password"
          style="box-sizing:border-box;width:100%;padding:12px;border:1px solid #ccd5df;border-radius:8px">

        <button type="submit" style="
          width:100%;margin-top:22px;padding:13px;border:0;
          border-radius:8px;background:#0f5132;color:white;
          font-weight:bold;cursor:pointer;
        ">Sign In</button>

        <p id="firebaseLoginMessage" role="status"
          style="color:#b42318;white-space:pre-wrap"></p>
      </form>
    `;

    document.body.appendChild(screen);

    document.getElementById("firebaseLoginForm")
      .addEventListener("submit", async event => {
        event.preventDefault();

        const email = document.getElementById("firebaseEmail").value.trim();
        const password = document.getElementById("firebasePassword").value;
        const status = document.getElementById("firebaseLoginMessage");
        const button = event.currentTarget.querySelector("button");

        status.style.color = "#52645a";
        status.textContent = "Signing in…";
        button.disabled = true;

        try {
          await signInWithEmailAndPassword(auth, email, password);
        } catch (error) {
          status.style.color = "#b42318";
          status.textContent =
            error.code === "auth/invalid-credential"
              ? "Email or password is incorrect."
              : error.code === "auth/too-many-requests"
                ? "Too many attempts. Please wait and try again."
                : "Sign-in failed: " + error.message;
        } finally {
          button.disabled = false;
        }
      });
  }

  screen.style.display = "flex";

  const status = document.getElementById("firebaseLoginMessage");
  if (status) status.textContent = message;
}

function hideLoginScreen() {
  const screen = document.getElementById("firebaseLoginScreen");
  if (screen) screen.style.display = "none";
}

function readLocalCloudData() {
  const data = {};

  for (const key of CLOUD_KEYS) {
    try {
      data[key] = JSON.parse(localStorage.getItem(key) || "null");
    } catch {
      data[key] = null;
    }
  }

  return data;
}

function hasLocalRecords(data) {
  return CLOUD_KEYS.some(key => {
    const value = data[key];

    if (Array.isArray(value)) return value.length > 0;

    if (key === STORAGE.settings && value && typeof value === "object") {
      return Object.keys(value).length > 0;
    }

    return false;
  });
}

function applyCloudData(data) {
  applyingCloudData = true;

  try {
    for (const key of CLOUD_KEYS) {
      const value = data?.[key];

      if (value !== undefined && value !== null) {
        localStorage.setItem(key, JSON.stringify(value));
      } else {
        localStorage.removeItem(key);
      }
    }
  } finally {
    applyingCloudData = false;
  }
}

async function writeCloudData() {
  if (!currentUser || !cloudReady || applyingCloudData) return;

  const data = readLocalCloudData();

  await setDoc(CLOUD_DOCUMENT, {
    ...data,
    updatedAt: new Date().toISOString(),
    updatedBy: currentUser.uid
  }, { merge: true });
}

function scheduleCloudWrite() {
  if (!currentUser || !cloudReady || applyingCloudData) return;

  clearTimeout(cloudWriteTimer);

  cloudWriteTimer = setTimeout(async () => {
    try {
      await writeCloudData();
    } catch (error) {
      console.error("Cloud save failed:", error);
      alert(
        "Your changes may be saved only on this device. " +
        "Cloud sync failed: " + error.message
      );
    }
  }, 700);
}

// Sync localStorage writes made by the existing app to Firestore.
// The existing tenant/payment functions can continue using localStorage.
const originalLocalStorageSetItem = Storage.prototype.setItem;

Storage.prototype.setItem = function (key, value) {
  originalLocalStorageSetItem.call(this, key, value);

  if (
    this === window.localStorage &&
    CLOUD_KEYS.includes(key) &&
    !applyingCloudData
  ) {
    scheduleCloudWrite();
  }
};

async function initializeCloudForUser(user) {
  currentUser = user;
  cloudReady = false;

  if (unsubscribeCloud) {
    unsubscribeCloud();
    unsubscribeCloud = null;
  }

  showLoginScreen("Loading your shared rental records…");

  try {
    const snapshot = await getDoc(CLOUD_DOCUMENT);

    // First login to an empty cloud document:
    // upload this device's records only if records exist locally.
    if (!snapshot.exists()) {
      const localData = readLocalCloudData();

      if (hasLocalRecords(localData)) {
        await setDoc(CLOUD_DOCUMENT, {
          ...localData,
          updatedAt: new Date().toISOString(),
          updatedBy: user.uid
        });
      } else {
        await setDoc(CLOUD_DOCUMENT, {
          ...localData,
          updatedAt: new Date().toISOString(),
          updatedBy: user.uid
        });
      }
    } else {
      // Existing cloud records take priority over this browser's records.
      applyCloudData(snapshot.data());
    }

    cloudReady = true;
    hideLoginScreen();

    // Listen for changes made by the other signed-in device.
    unsubscribeCloud = onSnapshot(
      CLOUD_DOCUMENT,
      snapshot => {
        if (!snapshot.exists()) return;

        const data = snapshot.data();

        // Ignore the initial snapshot because getDoc above already loaded it.
        if (!cloudReady) return;

        applyCloudData(data);
        openPage(
          document.querySelector(".nav-link.active")?.dataset.page || "dashboard"
        );
      },
      error => {
        console.error("Cloud listener failed:", error);
        alert("Live cloud sync stopped: " + error.message);
      }
    );

    addSignOutButton();
    openPage("dashboard");
  } catch (error) {
    cloudReady = false;
    showLoginScreen(
      "Could not load cloud records: " + error.message +
      "\nCheck your Firestore rules and internet connection."
    );
    console.error("Firebase initialization failed:", error);
  }
}

function addSignOutButton() {
  if (document.getElementById("firebaseSignOutButton")) return;

  const button = document.createElement("button");
  button.id = "firebaseSignOutButton";
  button.type = "button";
  button.textContent = "Sign Out";
  button.style.cssText = `
    position:fixed;right:16px;bottom:16px;z-index:1000;
    background:#0f5132;color:white;border:0;border-radius:8px;
    padding:10px 14px;cursor:pointer;font-weight:bold;
  `;

  button.addEventListener("click", async () => {
    if (!confirm("Sign out of Neema House Manager?")) return;

    try {
      await signOut(auth);
    } catch (error) {
      alert("Could not sign out: " + error.message);
    }
  });

  document.body.appendChild(button);
}

onAuthStateChanged(auth, async user => {
  if (!user) {
    currentUser = null;
    cloudReady = false;

    clearTimeout(cloudWriteTimer);

    if (unsubscribeCloud) {
      unsubscribeCloud();
      unsubscribeCloud = null;
    }

    document.getElementById("firebaseSignOutButton")?.remove();
    showLoginScreen();
    return;
  }

  await initializeCloudForUser(user);
});
