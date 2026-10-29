/* =========================================================
   REHEMA ESTATE PROPERTY MANAGER
   Supabase-connected application
   ========================================================= */
const SUPABASE_URL = "https://qpvzbmtwlycnijjkwcto.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_L6TvJdQcV31OvzWz3bixEw_UxhPOpZQ";

if (!window.supabase) {
  throw new Error("Supabase library is missing. Check index.html.");
}

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);

const $ = selector => document.querySelector(selector);
const content = $("#pageContent");
const authScreen = $("#authScreen");
const app = $("#app");

let currentUser = null;
let currentPage = "dashboard";
let currentReceipt = null;
let toastTimer = null;

const OFFLINE_QUEUE_KEY = "rehemaPendingPayments";
const THEME_KEY = "rehemaAppearance";

const pageNames = {
  dashboard: "Dashboard",
  record: "Record Manager",
  receipts: "Receipts",
  history: "Payment History",
  tenants: "Tenants",
  houses: "Houses",
  arrears: "Areas / Arrears",
  reports: "Reports & Statements",
  settings: "Settings"
};

const allowedEmails = [
  "waitherajulia2@gmail.com",
  "shammahvanquisher@gmail.com"
];

/* ---------------- SHARED HELPERS ---------------- */

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function money(value) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 2
  }).format(Number(value) || 0);
}

function today() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthStart(date = today()) {
  return `${date.slice(0, 7)}-01`;
}

function notify(message, error = false) {
  const toast = $("#toast");
  if (!toast) {
    if (error) console.error(message);
    else console.log(message);
    return;
  }

  toast.textContent = message;
  toast.style.background = error ? "#a52d39" : "#004d35";
  toast.classList.add("show");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 4000);
}

function isOnline() {
  return navigator.onLine;
}

function setConnectionStatus() {
  const connection = $("#connectionStatus");
  const sync = $("#syncStatus");

  if (connection) {
    connection.textContent = isOnline()
      ? "Internet connected"
      : "Offline";
  }

  if (sync) {
    sync.textContent = isOnline()
      ? "Cloud available"
      : "Offline mode";
  }
}

function readQueue() {
  try {
    return JSON.parse(
      localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]"
    );
  } catch {
    return [];
  }
}

function writeQueue(queue) {
  localStorage.setItem(
    OFFLINE_QUEUE_KEY,
    JSON.stringify(queue)
  );
  updateSyncStatus();
}

function updateSyncStatus() {
  const sync = $("#syncStatus");
  if (!sync) return;

  const queue = readQueue();

  sync.textContent = queue.length
    ? `${queue.length} payment(s) pending`
    : isOnline()
      ? "All synced"
      : "Offline";
}

async function fetchRows(table, columns = "*") {
  const { data, error } = await db
    .from(table)
    .select(columns);

  if (error) throw error;
  return data || [];
}

function pageHeader(title, subtitle, action = "") {
  return `
    <div class="welcome">
      <div>
        <p class="eyebrow">REHEMA ESTATE</p>
        <h1>${escapeHTML(title)}</h1>
        <p class="muted">${escapeHTML(subtitle)}</p>
      </div>
      ${action}
    </div>`;
}

function statCard(label, value, icon, foot = "") {
  return `
    <div class="stat-card">
      <div class="stat-icon">${icon}</div>
      <div class="stat-label">${escapeHTML(label)}</div>
      <div class="stat-value">${escapeHTML(value)}</div>
      <div class="stat-foot">${escapeHTML(foot)}</div>
    </div>`;
}

function tableHTML(headers, rows) {
  if (!rows.length) {
    return '<div class="empty">No records found yet.</div>';
  }

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            ${headers.map(h => `<th>${escapeHTML(h)}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${rows.map(row => `
            <tr>
              ${row.map(cell => `<td>${cell ?? ""}</td>`).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>`;
}

/* ---------------- AUTHENTICATION ---------------- */

async function authorised(user) {
  if (!user?.id || !user?.email) return false;

  if (!allowedEmails.includes(user.email.toLowerCase())) {
    return false;
  }

  const { data, error } = await db
    .from("authorized_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  return !error && Boolean(data);
}

async function verifySession() {
  const { data, error } = await db.auth.getSession();

  if (error || !data.session) {
    showLogin();
    return;
  }

  const user = data.session.user;

  if (!(await authorised(user))) {
    await db.auth.signOut();
    showLogin();
    notify(
      "This account is not authorised for this estate.",
      true
    );
    return;
  }

  currentUser = user;
  showApp();
}

function showLogin() {
  if (authScreen) authScreen.classList.remove("hidden");
  if (app) app.classList.add("hidden");
}

function showApp() {
  if (authScreen) authScreen.classList.add("hidden");
  if (app) app.classList.remove("hidden");

  setConnectionStatus();
  updateSyncStatus();
  applySavedTheme();

  navigate("dashboard");
  syncPendingPayments();
}

const loginForm = $("#loginForm");

if (loginForm) {
  loginForm.addEventListener("submit", async event => {
    event.preventDefault();

    const button = event.currentTarget.querySelector(
      'button[type="submit"]'
    );

    if (button) {
      button.disabled = true;
      button.textContent = "Signing in…";
    }

    try {
      const email = $("#email").value.trim().toLowerCase();
      const password = $("#password").value;

      if (!allowedEmails.includes(email)) {
        throw new Error(
          "Only the two authorised email accounts are allowed."
        );
      }

      const { data, error } = await db.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      if (!(await authorised(data.user))) {
        await db.auth.signOut();
        throw new Error(
          "This account is not authorised for this estate."
        );
      }

      currentUser = data.user;
      $("#password").value = "";
      showApp();
      notify("Signed in successfully.");
    } catch (error) {
      notify(error.message || "Unable to sign in.", true);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "Sign in";
      }
    }
  });
}

const forgotPasswordButton = $("#forgotPassword");

if (forgotPasswordButton) {
  forgotPasswordButton.addEventListener("click", async () => {
    const email = $("#email").value.trim().toLowerCase();

    if (!allowedEmails.includes(email)) {
      notify(
        "Enter one of the authorised email addresses first.",
        true
      );
      return;
    }

    const { error } = await db.auth.resetPasswordForEmail(email);

    if (error) {
      notify(error.message, true);
    } else {
      notify(
        "If the account is eligible, a reset link will be emailed."
      );
    }
  });
}

const signOutButton = $("#signOut");

if (signOutButton) {
  signOutButton.addEventListener("click", async () => {
    const { error } = await db.auth.signOut();

    if (error) {
      notify(error.message, true);
      return;
    }

    currentUser = null;
    showLogin();
  });
}

db.auth.onAuthStateChange((_event, session) => {
  if (!session) {
    currentUser = null;
    showLogin();
  }
});

/* ---------------- APPEARANCE ---------------- */

function applySavedTheme() {
  let settings = {};

  try {
    settings = JSON.parse(
      localStorage.getItem(THEME_KEY) || "{}"
    );
  } catch {}

  document.body.classList.remove(
    "dark",
    "theme-royal",
    "theme-burgundy",
    "theme-teal",
    "theme-purple",
    "theme-charcoal"
  );

  if (settings.theme) {
    document.body.classList.add(settings.theme);
  }

  const mode = settings.mode || "system";
  const prefersDark = window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  if (mode === "dark" || (mode === "system" && prefersDark)) {
    document.body.classList.add("dark");
  }
}

function saveTheme(theme, mode) {
  localStorage.setItem(
    THEME_KEY,
    JSON.stringify({ theme, mode })
  );
  applySavedTheme();
}

/* ---------------- NAVIGATION ---------------- */

function navigate(page) {
  if (!pageNames[page]) return;

  currentPage = page;

  const title = $("#pageTitle");
  if (title) title.textContent = pageNames[page];

  document.querySelectorAll(".nav-link").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.page === page
    );
  });

  const sidebar = $("#sidebar");
  if (sidebar) sidebar.classList.remove("open");

  renderPage(page);
}

document.querySelectorAll("[data-page]").forEach(button => {
  button.addEventListener("click", () => {
    navigate(button.dataset.page);
  });
});

document.addEventListener("click", event => {
  const button = event.target.closest("[data-go]");
  if (button) navigate(button.dataset.go);
});

const menuToggle = $("#menuToggle");

if (menuToggle) {
  menuToggle.addEventListener("click", () => {
    $("#sidebar")?.classList.toggle("open");
  });
}

const refreshButton = $("#refreshButton");

if (refreshButton) {
  refreshButton.addEventListener("click", () => {
    renderPage(currentPage);
  });
}

window.addEventListener("online", () => {
  setConnectionStatus();
  syncPendingPayments();
});

window.addEventListener("offline", setConnectionStatus);

/* ---------------- PAGE ROUTER ---------------- */

async function renderPage(page) {
  if (!content) return;

  content.innerHTML = '<div class="loading">Loading…</div>';

  try {
    if (page === "dashboard") return await renderDashboard();
    if (page === "houses") return await renderHouses();
    if (page === "tenants") return await renderTenants();
    if (page === "record") return await renderRecordForm();
    if (page === "history") return await renderHistory();
    if (page === "receipts") return await renderReceipts();
    if (page === "arrears") return await renderArrears();
    if (page === "reports") return await renderReports();
    if (page === "settings") return renderSettings();
  } catch (error) {
    console.error("Page loading error:", error);

    content.innerHTML = `
      <div class="panel">
        <h3>Unable to load this page</h3>
        <p class="muted">${escapeHTML(error.message)}</p>
        <button class="btn outline" id="retryPage">
          Try again
        </button>
      </div>`;

    $("#retryPage")?.addEventListener("click", () => {
      renderPage(currentPage);
    });
  }
}

/* =========================================================
   PART 2 — DASHBOARD, HOUSES AND TENANTS
   ========================================================= */

/* ---------------- DASHBOARD ---------------- */

async function renderDashboard() {
  const [houses, tenants, charges, payments] = await Promise.all([
    fetchRows("houses"),
    fetchRows("tenants"),
    fetchRows("monthly_charges"),
    fetchRows("payments")
  ]);

  const activeTenants = tenants.filter(t => t.is_active);

  const occupiedHouseIds = new Set(
    activeTenants.map(t => t.house_id)
  );

  const currentMonth = today().slice(0, 7);

  const monthlyPayments = payments
    .filter(p => p.payment_date?.slice(0, 7) === currentMonth)
    .reduce(
      (sum, p) => sum + Number(p.amount_received || 0),
      0
    );

  const totalCharges = charges.reduce(
    (sum, c) => sum + Number(c.total_charges || 0),
    0
  );

  const totalPayments = payments.reduce(
    (sum, p) => sum + Number(p.amount_received || 0),
    0
  );

  const balance = totalCharges - totalPayments;

  const recent = [...payments]
    .sort((a, b) =>
      String(b.created_at || b.payment_date)
        .localeCompare(String(a.created_at || a.payment_date))
    )
    .slice(0, 6);

  content.innerHTML = `
    ${pageHeader(
      "Welcome back",
      "Here's what's happening with your estate.",
      '<button class="btn primary" data-go="record">＋ Record payment</button>'
    )}

    ${!isOnline()
      ? '<div class="sync-banner">You are offline. New payments may be queued locally until the connection returns.</div>'
      : ""}

    <div class="stats-grid">
      ${statCard("Total houses", houses.length, "⌂", "Registered properties")}
      ${statCard("Payments this month", money(monthlyPayments), "↗", "Based on payment date")}
      ${statCard("Net outstanding", money(balance), "KSh", "Charges minus payments")}
      ${statCard("Active tenants", activeTenants.length, "♙", "Currently registered")}
    </div>

    <div class="dashboard-grid">
      <section class="panel">
        <div class="panel-head"><h3>Quick actions</h3></div>

        <div class="quick-grid">
          <button class="quick-action" data-go="record"><span>＋</span><strong>Record payment</strong></button>
          <button class="quick-action" data-go="tenants"><span>♙</span><strong>Manage tenants</strong></button>
          <button class="quick-action" data-go="houses"><span>⌂</span><strong>Manage houses</strong></button>
          <button class="quick-action" data-go="receipts"><span>▤</span><strong>View receipts</strong></button>
          <button class="quick-action" data-go="arrears"><span>↗</span><strong>Check arrears</strong></button>
          <button class="quick-action" data-go="reports"><span>▧</span><strong>Statements</strong></button>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h3>House overview</h3>
          <button class="btn outline small-btn" data-go="houses">View all</button>
        </div>

        ${tableHTML(
          ["House", "Monthly rent", "Occupancy"],
          houses.slice(0, 8).map(h => [
            escapeHTML(h.house_number),
            money(h.monthly_rent),
            occupiedHouseIds.has(h.id)
              ? '<span class="badge">Occupied</span>'
              : '<span class="badge neutral">Vacant</span>'
          ])
        )}
      </section>

      <section class="panel">
        <div class="panel-head">
          <h3>Recent payments</h3>
          <button class="btn outline small-btn" data-go="history">View all</button>
        </div>

        ${tableHTML(
          ["Date", "Receipt", "Amount"],
          recent.map(p => [
            escapeHTML(p.payment_date),
            escapeHTML(p.receipt_number || "Pending sync"),
            money(p.amount_received)
          ])
        )}
      </section>

      <section class="panel">
        <h3>Financial summary</h3>
        <p>Total recorded charges: <strong>${money(totalCharges)}</strong></p>
        <p>Total payments: <strong>${money(totalPayments)}</strong></p>
        <p>Net balance: <strong>${money(balance)}</strong></p>
        <p class="muted small">
          Lifetime summary of recorded charges and payments.
        </p>
      </section>
    </div>`;
}

/* ---------------- HOUSES ---------------- */

async function renderHouses() {
  const [houses, tenants] = await Promise.all([
    fetchRows("houses"),
    fetchRows("tenants")
  ]);

  content.innerHTML = `
    ${pageHeader(
      "Houses",
      "Manage house numbers, rent and occupancy.",
      '<button class="btn primary" id="addHouse">＋ Add house</button>'
    )}

    <section id="houseFormHost"></section>

    <section class="panel">
      <div class="toolbar">
        <input id="houseSearch" placeholder="Search house number…">
      </div>
      <div id="houseTable"></div>
    </section>`;

  const draw = () => {
    const term = $("#houseSearch").value.toLowerCase();

    const filtered = houses.filter(h =>
      String(h.house_number || "").toLowerCase().includes(term)
    );

    $("#houseTable").innerHTML = tableHTML(
      ["House", "Monthly rent", "Tenant", "Status", "Actions"],
      filtered.map(h => {
        const tenant = tenants.find(
          t => t.house_id === h.id && t.is_active
        );

        return [
          escapeHTML(h.house_number),
          money(h.monthly_rent),
          escapeHTML(tenant?.full_name || "—"),
          tenant
            ? '<span class="badge">Occupied</span>'
            : '<span class="badge neutral">Vacant</span>',
          `<button class="btn outline small-btn"
            data-edit-house="${escapeHTML(h.id)}">Edit rent</button>`
        ];
      })
    );
  };

  draw();

  $("#houseSearch").addEventListener("input", draw);

  $("#addHouse").addEventListener("click", () => {
    showHouseForm();
  });

  $("#houseTable").addEventListener("click", event => {
    const button = event.target.closest("[data-edit-house]");
    if (!button) return;

    const house = houses.find(h => h.id === button.dataset.editHouse);

    if (house) showHouseForm(house);
  });
}

function showHouseForm(house = null) {
  $("#houseFormHost").innerHTML = `
    <section class="form-card" style="margin-bottom:18px">
      <h3>${house ? "Edit house" : "Add a house"}</h3>

      <form id="houseForm">
        <div class="form-grid">
          <div>
            <label>House number</label>
            <input name="house_number" required
              value="${escapeHTML(house?.house_number || "")}"
              ${house ? "readonly" : ""}>
          </div>

          <div>
            <label>Monthly rent (KSh)</label>
            <input name="monthly_rent" type="number"
              min="0" step=".01" required
              value="${house?.monthly_rent ?? ""}">
          </div>
        </div>

        <div class="form-actions">
          <button class="btn primary" type="submit">Save house</button>
          <button type="button" id="cancelHouse" class="btn outline">Cancel</button>
        </div>
      </form>
    </section>`;

  $("#cancelHouse").addEventListener("click", () => {
    $("#houseFormHost").innerHTML = "";
  });

  $("#houseForm").addEventListener("submit", async event => {
    event.preventDefault();

    const form = new FormData(event.currentTarget);

    const payload = {
      house_number: String(form.get("house_number") || "").trim(),
      monthly_rent: Number(form.get("monthly_rent"))
    };

    if (!payload.house_number || payload.monthly_rent < 0) {
      notify("Enter a valid house number and rent.", true);
      return;
    }

    try {
      const query = house
        ? db.from("houses").update(payload).eq("id", house.id)
        : db.from("houses").insert(payload);

      const { error } = await query;

      if (error) throw error;

      notify("House saved.");
      await renderHouses();
    } catch (error) {
      notify(error.message, true);
    }
  });
}

/* ---------------- TENANTS ---------------- */

async function renderTenants() {
  const [tenants, houses] = await Promise.all([
    fetchRows("tenants"),
    fetchRows("houses")
  ]);

  content.innerHTML = `
    ${pageHeader(
      "Tenants",
      "Register tenants and manage occupancy.",
      '<button class="btn primary" id="addTenant">＋ Add tenant</button>'
    )}

    <section id="tenantFormHost"></section>

    <section class="panel">
      <div class="toolbar">
        <input id="tenantSearch" placeholder="Search tenant, phone or house…">
        <select id="tenantStatus">
          <option value="active">Active tenants</option>
          <option value="all">All tenants</option>
        </select>
      </div>
      <div id="tenantTable"></div>
    </section>`;

  const draw = () => {
    const term = $("#tenantSearch").value.toLowerCase();
    const status = $("#tenantStatus").value;

    const filtered = tenants.filter(t => {
      const house = houses.find(h => h.id === t.house_id);

      return (status === "all" || t.is_active) &&
        `${t.full_name || ""} ${t.phone_number || ""} ${house?.house_number || ""}`
          .toLowerCase()
          .includes(term);
    });

    $("#tenantTable").innerHTML = tableHTML(
      ["Tenant", "Phone", "House", "Move-in", "Status", "Actions"],
      filtered.map(t => {
        const house = houses.find(h => h.id === t.house_id);

        return [
          escapeHTML(t.full_name),
          escapeHTML(t.phone_number || "—"),
          escapeHTML(house?.house_number || "—"),
          escapeHTML(t.move_in_date || "—"),
          t.is_active
            ? '<span class="badge">Active</span>'
            : '<span class="badge neutral">Moved out</span>',
          t.is_active
            ? `<button class="btn outline small-btn"
                data-moveout="${escapeHTML(t.id)}">Move out</button>`
            : "—"
        ];
      })
    );
  };

  draw();

  $("#tenantSearch").addEventListener("input", draw);
  $("#tenantStatus").addEventListener("change", draw);

  $("#addTenant").addEventListener("click", () => {
    showTenantForm(houses);
  });

  $("#tenantTable").addEventListener("click", async event => {
    const button = event.target.closest("[data-moveout]");
    if (!button) return;

    if (!confirm(
      "Mark this tenant as moved out? Their history will be preserved."
    )) {
      return;
    }

    try {
      const { error } = await db
        .from("tenants")
        .update({
          is_active: false,
          move_out_date: today()
        })
        .eq("id", button.dataset.moveout);

      if (error) throw error;

      notify("Tenant marked as moved out.");
      await renderTenants();
    } catch (error) {
      notify(error.message, true);
    }
  });
}

function showTenantForm(houses) {
  $("#tenantFormHost").innerHTML = `
    <section class="form-card" style="margin-bottom:18px">
      <h3>Register tenant</h3>

      <form id="tenantForm">
        <div class="form-grid">
          <div>
            <label>Tenant full name</label>
            <input name="full_name" required maxlength="150">
          </div>

          <div>
            <label>Phone number</label>
            <input name="phone_number" type="tel" required maxlength="30">
          </div>

          <div>
            <label>House</label>
            <select name="house_id" required>
              <option value="">Choose a house</option>
              ${houses.map(h => `
                <option value="${escapeHTML(h.id)}">
                  ${escapeHTML(h.house_number)} — ${money(h.monthly_rent)}
                </option>
              `).join("")}
            </select>
          </div>

          <div>
            <label>Move-in date</label>
            <input name="move_in_date" type="date"
              value="${today()}" required>
          </div>
        </div>

        <div class="form-actions">
          <button class="btn primary" type="submit">Save tenant</button>
          <button class="btn outline" type="button" id="cancelTenant">Cancel</button>
        </div>
      </form>
    </section>`;

  $("#cancelTenant").addEventListener("click", () => {
    $("#tenantFormHost").innerHTML = "";
  });

  $("#tenantForm").addEventListener("submit", async event => {
    event.preventDefault();

    const form = new FormData(event.currentTarget);

    const fullName = String(form.get("full_name") || "").trim();
    const phone = String(form.get("phone_number") || "").trim();
    const houseId = String(form.get("house_id") || "");
    const moveInDate = String(form.get("move_in_date") || "");

    if (!fullName || !phone || !houseId || !moveInDate) {
      notify("Complete all tenant fields.", true);
      return;
    }

    try {
      const [existingTenants, existingHouses] = await Promise.all([
        fetchRows("tenants"),
        fetchRows("houses")
      ]);

      const selectedHouse = existingHouses.find(h => h.id === houseId);

      if (!selectedHouse) {
        notify("Choose a valid house.", true);
        return;
      }

      const occupant = existingTenants.find(
        t => t.house_id === houseId && t.is_active
      );

      if (occupant) {
        notify("This house already has an active tenant.", true);
        return;
      }

      const { error } = await db.from("tenants").insert({
        full_name: fullName,
        phone_number: phone,
        house_id: houseId,
        move_in_date: moveInDate,
        is_active: true
      });

      if (error) throw error;

      notify("Tenant registered successfully.");
      await renderTenants();
    } catch (error) {
      notify(error.message, true);
    }
  });
}

/* =========================================================
   PART 3 — PAYMENTS, SYNC, HISTORY AND RECEIPTS
   ========================================================= */

/* ---------------- RECORD PAYMENT ---------------- */

async function renderRecordForm() {
  const [tenants, houses, settings] = await Promise.all([
    fetchRows("tenants"),
    fetchRows("houses"),
    fetchRows("estate_settings")
  ]);

  const activeTenants = tenants.filter(t => t.is_active);
  const estate = settings[0] || {};
  const waterRate = Number(estate.default_water_rate ?? 100);

  content.innerHTML = `
    ${pageHeader("Record Manager", "Record monthly charges and payments.")}

    <section class="form-card">
      <form id="paymentForm">
        <h3>1. Tenant and payment period</h3>

        <div class="form-grid">
          <div class="full-field">
            <label>Tenant</label>
            <select name="tenant_id" id="paymentTenant" required>
              <option value="">Choose a tenant</option>
              ${activeTenants.map(t => {
                const house = houses.find(h => h.id === t.house_id);

                return `
                  <option value="${escapeHTML(t.id)}"
                    data-rent="${Number(house?.monthly_rent || 0)}">
                    ${escapeHTML(t.full_name)} — ${escapeHTML(house?.house_number || "No house")}
                  </option>`;
              }).join("")}
            </select>
          </div>

          <div>
            <label>Payment date</label>
            <input type="date" name="payment_date" value="${today()}" required>
          </div>

          <div>
            <label>Month being paid for</label>
            <input type="month" name="period" value="${today().slice(0, 7)}" required>
          </div>

          <div>
            <label>Received By</label>
            <select name="received_by" required>
              <option value="">Choose recipient</option>
              <option value="Julie Ndegwa">Julie Ndegwa</option>
              <option value="John Maina">John Maina</option>
            </select>
          </div>
        </div>

        <h3>2. Monthly charges</h3>

        <p class="muted small">
          If charges already exist for this tenant and month, the existing
          charge record will be retained.
        </p>

        <div class="form-grid">
          <div>
            <label>Rent (KSh)</label>
            <input type="number" min="0" step=".01" name="rent" id="rent" value="0" required>
          </div>

          <div>
            <label>Water units</label>
            <input type="number" min="0" step=".01" name="water_units" id="waterUnits" value="0" required>
          </div>

          <div>
            <label>Water rate per unit (KSh)</label>
            <input type="number" min="0" step=".01" name="water_rate" id="waterRate" value="${waterRate}" required>
          </div>

          <div>
            <label>Garbage (KSh)</label>
            <input type="number" min="0" step=".01" name="garbage" value="0" required>
          </div>

          <div>
            <label>Wi-Fi (KSh)</label>
            <input type="number" min="0" step=".01" name="wifi" value="0" required>
          </div>
        </div>

        <div class="summary-strip">
          Calculated charges<br>
          <strong id="chargeTotal">${money(0)}</strong>
        </div>

        <h3>3. Payment details</h3>

        <div class="form-grid">
          <div>
            <label>Amount received (KSh)</label>
            <input type="number" name="amount_received" min=".01" step=".01" required>
          </div>

          <div>
            <label>Payment method</label>
            <select name="payment_method" id="paymentMethod" required>
              <option value="M-Pesa">M-Pesa</option>
              <option value="Cash">Cash</option>
            </select>
          </div>

          <div class="full-field" id="mpesaField">
            <label>M-Pesa reference code</label>
            <input name="mpesa_reference" placeholder="e.g. QAB12XYZ34">
          </div>

          <div class="full-field">
            <label>Notes (optional)</label>
            <textarea name="notes" rows="2"></textarea>
          </div>
        </div>

        <div class="form-actions">
          <button class="btn primary" type="submit">Save payment & create receipt</button>
          <button class="btn outline" type="button" id="clearPayment">Clear form</button>
        </div>

        <p class="muted small">
          Offline payments are queued locally. An official receipt number
          is not available until cloud confirmation.
        </p>
      </form>
    </section>`;

  const form = $("#paymentForm");
  const rentInput = $("#rent");

  const updateChargeTotal = () => {
    const data = new FormData(form);

    const rent = Number(data.get("rent") || 0);
    const units = Number(data.get("water_units") || 0);
    const rate = Number(data.get("water_rate") || 0);
    const garbage = Number(data.get("garbage") || 0);
    const wifi = Number(data.get("wifi") || 0);

    $("#chargeTotal").textContent = money(
      rent + units * rate + garbage + wifi
    );
  };

  $("#paymentTenant").addEventListener("change", event => {
    const option = event.target.selectedOptions[0];

    rentInput.value = option?.dataset.rent || 0;

    updateChargeTotal();
  });

  form.addEventListener("input", updateChargeTotal);

  $("#paymentMethod").addEventListener("change", () => {
    $("#mpesaField").classList.toggle(
      "hidden",
      $("#paymentMethod").value !== "M-Pesa"
    );
  });

  $("#clearPayment").addEventListener("click", () => {
    renderRecordForm();
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();

    const data = new FormData(form);

    const tenant = activeTenants.find(
      t => t.id === data.get("tenant_id")
    );

    if (!tenant || !tenant.house_id) {
      notify("Choose a tenant linked to a house.", true);
      return;
    }

    const receivedBy = String(data.get("received_by") || "").trim();

    if (!["Julie Ndegwa", "John Maina"].includes(receivedBy)) {
      notify("Choose Julie Ndegwa or John Maina under Received By.", true);
      return;
    }

    const method = String(data.get("payment_method") || "");
    const mpesa = String(data.get("mpesa_reference") || "").trim();

    if (method === "M-Pesa" && !mpesa) {
      notify("Enter the M-Pesa reference code.", true);
      return;
    }

    const amountReceived = Number(data.get("amount_received"));

    if (!(amountReceived > 0)) {
      notify("Amount received must be greater than zero.", true);
      return;
    }

    const period = `${data.get("period")}-01`;

    const rent = Number(data.get("rent") || 0);
    const units = Number(data.get("water_units") || 0);
    const rate = Number(data.get("water_rate") || 0);
    const garbage = Number(data.get("garbage") || 0);
    const wifi = Number(data.get("wifi") || 0);

    if ([rent, units, rate, garbage, wifi].some(
      value => !Number.isFinite(value) || value < 0
    )) {
      notify("Monthly charges cannot be negative.", true);
      return;
    }

    const charges = {
      tenant_id: tenant.id,
      house_id: tenant.house_id,
      period_start: period,
      rent,
      water_units: units,
      water_rate: rate,
      garbage,
      wifi,
      // Keep this field for compatibility with existing database schemas.
      other_charges: 0
    };

    const payment = {
      id: crypto.randomUUID(),
      tenant_id: tenant.id,
      house_id: tenant.house_id,
      payment_date: data.get("payment_date"),
      period_start: period,
      amount_received: amountReceived,
      payment_method: method,
      mpesa_reference: method === "M-Pesa" ? mpesa : null,
      received_by: receivedBy,
      paid_by: "",
      notes: String(data.get("notes") || "").trim() || null
    };

    try {
      if (!isOnline()) {
        const queue = readQueue();

        queue.push({
          payment,
          charges,
          queuedAt: new Date().toISOString()
        });

        writeQueue(queue);

        notify("Payment saved on this device as pending sync.");

        return renderPage("history");
      }

      const {
        data: existingCharge,
        error: lookupError
      } = await db
        .from("monthly_charges")
        .select("id")
        .eq("tenant_id", tenant.id)
        .eq("period_start", period)
        .maybeSingle();

      if (lookupError) throw lookupError;

      if (!existingCharge) {
        const { error: chargeError } = await db
          .from("monthly_charges")
          .insert(charges);

        if (chargeError) throw chargeError;
      }

      const { data: savedPayment, error: paymentError } = await db
        .from("payments")
        .insert(payment)
        .select()
        .single();

      if (paymentError) throw paymentError;

      currentReceipt = savedPayment;

      notify("Payment saved and official receipt created.");

      await showReceipt(savedPayment);
    } catch (error) {
      notify(error.message || "Payment could not be saved.", true);
    }
  });

  updateChargeTotal();

  $("#paymentMethod").dispatchEvent(new Event("change"));
}

/* ---------------- OFFLINE PAYMENT SYNC ---------------- */

async function syncPendingPayments() {
  if (!isOnline() || !currentUser) return;

  let queue = readQueue();

  if (!queue.length) {
    updateSyncStatus();
    return;
  }

  for (const item of [...queue]) {
    try {
      const {
        data: existingCharge,
        error: lookupError
      } = await db
        .from("monthly_charges")
        .select("id")
        .eq("tenant_id", item.charges.tenant_id)
        .eq("period_start", item.charges.period_start)
        .maybeSingle();

      if (lookupError) throw lookupError;

      if (!existingCharge) {
        const { error: chargeError } = await db
          .from("monthly_charges")
          .insert(item.charges);

        if (chargeError) {
          const { data: retryCharge } = await db
            .from("monthly_charges")
            .select("id")
            .eq("tenant_id", item.charges.tenant_id)
            .eq("period_start", item.charges.period_start)
            .maybeSingle();

          if (!retryCharge) throw chargeError;
        }
      }

      const { error: paymentError } = await db
        .from("payments")
        .upsert(item.payment, {
          onConflict: "id",
          ignoreDuplicates: true
        });

      if (paymentError) throw paymentError;

      queue = queue.filter(
        q => q.payment.id !== item.payment.id
      );

      writeQueue(queue);
    } catch (error) {
      console.warn("Payment sync deferred:", error.message);
    }
  }

  if (!queue.length) {
    notify("Pending payments synchronised.");
  }

  updateSyncStatus();
}

/* ---------------- PAYMENT HISTORY ---------------- */

async function renderHistory() {
  const [payments, tenants, houses] = await Promise.all([
    fetchRows("payments"),
    fetchRows("tenants"),
    fetchRows("houses")
  ]);

  const pending = readQueue();

  content.innerHTML = `
    ${pageHeader(
      "Payment History",
      "Search recorded payments and provisional offline entries.",
      '<button class="btn primary" data-go="record">＋ Record payment</button>'
    )}

    ${pending.length
      ? `<div class="sync-banner">${pending.length} payment(s) waiting to synchronise. Receipt numbers are provisional.</div>`
      : ""}

    <section class="panel">
      <div class="toolbar">
        <input id="historySearch" placeholder="Search tenant, receipt or M-Pesa reference…">

        <select id="historyMethod">
          <option value="">All methods</option>
          <option>Cash</option>
          <option>M-Pesa</option>
        </select>
      </div>

      <div id="historyTable"></div>
    </section>`;

  const draw = () => {
    const term = $("#historySearch").value.toLowerCase();
    const method = $("#historyMethod").value;

    const onlineRows = payments.map(p => ({
      ...p,
      pending: false
    }));

    const localRows = pending.map(item => ({
      ...item.payment,
      pending: true,
      receipt_number: "PENDING SYNC"
    }));

    const rows = [...localRows, ...onlineRows]
      .filter(p => {
        const tenant = tenants.find(t => t.id === p.tenant_id);
        const house = houses.find(h => h.id === p.house_id);

        const searchable = [
          tenant?.full_name,
          house?.house_number,
          p.receipt_number,
          p.mpesa_reference,
          p.paid_by,
          p.received_by
        ].join(" ").toLowerCase();

        return searchable.includes(term) &&
          (!method || p.payment_method === method);
      })
      .sort((a, b) =>
        String(b.payment_date).localeCompare(String(a.payment_date))
      );

    $("#historyTable").innerHTML = tableHTML(
      [
        "Date",
        "Receipt",
        "Tenant",
        "House",
        "Received by",
        "Method",
        "M-Pesa ref.",
        "Amount",
        "Status"
      ],
      rows.map(p => [
        escapeHTML(p.payment_date),
        escapeHTML(p.receipt_number || "—"),
        escapeHTML(
          tenants.find(t => t.id === p.tenant_id)?.full_name || "—"
        ),
        escapeHTML(
          houses.find(h => h.id === p.house_id)?.house_number || "—"
        ),
        escapeHTML(p.received_by || "—"),
        escapeHTML(p.payment_method || "—"),
        escapeHTML(p.mpesa_reference || "—"),
        money(p.amount_received),
        p.pending
          ? '<span class="badge warning">Pending sync</span>'
          : '<span class="badge">Saved</span>'
      ])
    );
  };

  draw();

  $("#historySearch").addEventListener("input", draw);
  $("#historyMethod").addEventListener("change", draw);
}

/* ---------------- RECEIPT LIST ---------------- */

async function renderReceipts() {
  const [payments, tenants, houses] = await Promise.all([
    fetchRows("payments"),
    fetchRows("tenants"),
    fetchRows("houses")
  ]);

  const sorted = [...payments].sort((a, b) =>
    String(b.payment_date).localeCompare(String(a.payment_date))
  );

  content.innerHTML = `
    ${pageHeader(
      "Receipts",
      "View, print and download payment receipts."
    )}

    <section class="panel">
      <div class="toolbar">
        <input id="receiptSearch" placeholder="Search receipt number or tenant…">
      </div>
      <div id="receiptTable"></div>
    </section>`;

  const draw = () => {
    const term = $("#receiptSearch").value.toLowerCase();

    const rows = sorted.filter(p => {
      const name = tenants.find(
        t => t.id === p.tenant_id
      )?.full_name || "";

      return `${name} ${p.receipt_number || ""}`
        .toLowerCase()
        .includes(term);
    });

    $("#receiptTable").innerHTML = tableHTML(
      [
        "Receipt",
        "Date",
        "Tenant",
        "House",
        "Received by",
        "Amount",
        "Action"
      ],
      rows.map(p => [
        escapeHTML(p.receipt_number || "—"),
        escapeHTML(p.payment_date),
        escapeHTML(
          tenants.find(t => t.id === p.tenant_id)?.full_name || "—"
        ),
        escapeHTML(
          houses.find(h => h.id === p.house_id)?.house_number || "—"
        ),
        escapeHTML(p.received_by || "—"),
        money(p.amount_received),
        `<button class="btn outline small-btn"
          data-receipt="${escapeHTML(p.id)}">View / print</button>`
      ])
    );
  };

  draw();

  $("#receiptSearch").addEventListener("input", draw);

  $("#receiptTable").addEventListener("click", event => {
    const button = event.target.closest("[data-receipt]");
    if (!button) return;

    const payment = payments.find(
      p => p.id === button.dataset.receipt
    );

    if (payment) showReceipt(payment);
  });
}
 

/* ---------------- RECEIPT VIEW AND DOWNLOAD ---------------- */

async function showReceipt(payment) {
  if (!payment) return;

  const [tenants, houses, charges, settings, payments] = await Promise.all([
    fetchRows("tenants"),
    fetchRows("houses"),
    fetchRows("monthly_charges"),
    fetchRows("estate_settings"),
    fetchRows("payments")
  ]);

  const tenant = tenants.find(t => t.id === payment.tenant_id);
  const house = houses.find(h => h.id === (payment.house_id || tenant?.house_id));
  const charge = charges.find(c =>
    c.tenant_id === payment.tenant_id &&
    c.period_start === payment.period_start
  );
  const estate = settings[0] || {};

  const previousCharges = charges
    .filter(c => c.tenant_id === payment.tenant_id &&
      String(c.period_start || "") < String(payment.period_start || ""))
    .reduce((sum, c) => sum + Number(c.total_charges || 0), 0);

  const previousPayments = payments
    .filter(p => p.tenant_id === payment.tenant_id &&
      String(p.period_start || "") < String(payment.period_start || ""))
    .reduce((sum, p) => sum + Number(p.amount_received || 0), 0);

  const previousBalance = previousCharges - previousPayments;

  const paymentsThisMonth = payments
    .filter(p =>
      p.tenant_id === payment.tenant_id &&
      p.period_start === payment.period_start &&
      (
        String(p.payment_date || "") < String(payment.payment_date || "") ||
        (
          p.payment_date === payment.payment_date &&
          (p.created_at && payment.created_at
            ? p.created_at <= payment.created_at
            : true)
        ) ||
        p.id === payment.id
      )
    )
    .reduce((sum, p) => sum + Number(p.amount_received || 0), 0);

  const amountDue = previousBalance + Number(charge?.total_charges || 0);
  const closing = amountDue - paymentsThisMonth;

  const estateName = estate.estate_name || "REHEMA ESTATE";
  const postalAddress = estate.postal_address || "P.O. Box 201104, Nakuru";
  const phonePrimary = estate.phone_primary || "0720 871123";
  const phoneSecondary = estate.phone_secondary || "0722 965523";
  const receiptNumber = payment.receipt_number || "PENDING";
  const amountReceived = Number(payment.amount_received || 0);

  const billingMonth = payment.period_start
    ? new Date(payment.period_start + "T12:00:00").toLocaleDateString("en-KE", {
        month: "long",
        year: "numeric"
      })
    : "—";

  const chargeItems = [
    ["Monthly rent", Number(charge?.rent || 0)],
    [
      `Water (${Number(charge?.water_units || 0)} units)`,
      Number(charge?.water_units || 0) * Number(charge?.water_rate || 0)
    ],
    ["Garbage", Number(charge?.garbage || 0)],
    ["Wi-Fi", Number(charge?.wifi || 0)]
  ];

  content.innerHTML = `
    <style>
      .receipt-page {
        max-width: 620px;
        margin: 0 auto;
      }

      .estate-receipt {
        box-sizing: border-box;
        width: 100%;
        max-width: 100%;
        min-width: 0;
        background: #fff;
        color: #26372d;
        border: 1px solid #dce7df;
        border-radius: 10px;
        overflow: hidden;
        font-family: Arial, Helvetica, sans-serif;
      }

      .er-header {
        background: #00783e;
        color: #fff;
        padding: 17px 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
      }

      .er-estate-name {
        font-size: 22px;
        font-weight: 800;
        margin-bottom: 5px;
        overflow-wrap: anywhere;
      }

      .er-contact {
        font-size: 11px;
        line-height: 1.6;
      }

      .er-receipt-badge {
        border: 1px solid rgba(255,255,255,.7);
        border-radius: 6px;
        padding: 8px 10px;
        text-align: center;
        flex-shrink: 0;
      }

      .er-receipt-badge small {
        display: block;
        font-size: 9px;
        letter-spacing: 1px;
        margin-bottom: 3px;
      }

      .er-receipt-badge strong {
        font-size: 15px;
      }

      .er-content {
        box-sizing: border-box;
        width: 100%;
        min-width: 0;
        padding: 18px 20px;
        overflow: hidden;
      }

      .er-title-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        margin-bottom: 14px;
      }

      .er-title {
        color: #00783e;
        font-size: 19px;
        margin: 0 0 4px;
      }

      .er-muted {
        color: #718076;
        font-size: 10px;
        line-height: 1.5;
      }

      .er-number {
        text-align: right;
        font-size: 11px;
        line-height: 1.6;
        overflow-wrap: anywhere;
      }

      .er-details {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }

      .er-detail {
        min-width: 0;
        padding: 9px 11px;
        border: 1px solid #e0e9e2;
        border-radius: 6px;
        background: #fbfdfb;
      }

      .er-label {
        font-size: 9px;
        font-weight: 800;
        color: #708276;
        letter-spacing: .5px;
        margin-bottom: 4px;
      }

      .er-value {
        font-size: 12px;
        font-weight: 700;
        line-height: 1.4;
        overflow-wrap: anywhere;
      }

      .er-amount-banner {
        margin-top: 12px;
        background: #eff8f1;
        border: 1px solid #d2e9d8;
        border-radius: 7px;
        padding: 12px 14px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
      }

      .er-amount {
        color: #00783e;
        font-size: 25px;
        font-weight: 800;
        overflow-wrap: anywhere;
      }

      .er-section-title {
        color: #00783e;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: .7px;
        margin: 4px 0 2px;
        padding-bottom: 2px;
        border-bottom: 1px solid #008542;
      }

      .er-table {
        display: table !important;
        width: 100% !important;
        min-width: 0 !important;
        max-width: 100% !important;
        table-layout: fixed !important;
        border-collapse: collapse;
        border-spacing: 0;
        box-sizing: border-box;
        margin: 0;
      }

      .er-table th,
      .er-table td {
        box-sizing: border-box;
        min-width: 0;
        padding: 6px 8px;
        border-bottom: 1px solid #e7eee8;
        line-height: 1.3;
        overflow-wrap: anywhere;
      }

      .er-table th:first-child,
      .er-table td:first-child {
        width: 62%;
        text-align: left;
        padding-right: 4px;
      }

      .er-table th:last-child,
      .er-table td:last-child {
        width: 38%;
        text-align: right;
        padding-left: 4px;
        white-space: normal;
        overflow-wrap: anywhere;
      }

      .er-table th {
        background: #f0f6f1;
        color: #285b3d;
        font-size: 9px;
        letter-spacing: .5px;
      }

      .er-table .er-total-row td {
        font-weight: 800;
        color: #006b37;
        background: #f0f8f2;
      }

      .er-account {
        border: 1px solid #dce7df;
        border-radius: 6px;
        overflow: hidden;
      }

      .er-account-row {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        padding: 7px 10px;
        border-bottom: 1px solid #e6eee7;
        font-size: 10px;
        line-height: 1.4;
      }

      .er-account-row:last-child {
        border-bottom: none;
      }

      .er-account-row span {
        flex: 1;
      }

      .er-account-row strong {
        text-align: right;
        overflow-wrap: anywhere;
      }

      .er-balance {
        margin-top: 12px;
        border-radius: 7px;
        padding: 12px 14px;
        background: #00783e;
        color: white;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
      }

      .er-balance-label {
        font-size: 10px;
        font-weight: 800;
        margin-bottom: 4px;
      }

      .er-balance-status {
        font-size: 10px;
      }

      .er-balance-amount {
        font-size: 23px;
        font-weight: 800;
        text-align: right;
        overflow-wrap: anywhere;
      }

      .er-footer {
        padding: 12px 15px;
        background: #f7faf7;
        border-top: 1px solid #e2eae3;
        text-align: center;
      }

      .er-footer strong {
        display: block;
        color: #00783e;
        font-size: 11px;
        margin-bottom: 4px;
      }

      .er-footer p {
        margin: 0;
        font-size: 9px;
        color: #728076;
        line-height: 1.5;
      }

      .er-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 10px;
        margin: 15px 0;
      }

      .er-action {
        border: 0;
        border-radius: 7px;
        padding: 11px 16px;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
      }

      .er-download {
        background: #008542;
        color: #fff;
      }

      .er-print {
        background: #fff;
        color: #006b37;
        border: 1px solid #008542;
      }

      .er-action:disabled {
        opacity: .6;
        cursor: wait;
      }

      @media (max-width: 480px) {
        .er-header {
          padding: 14px;
        }

        .er-estate-name {
          font-size: 18px;
        }

        .er-content {
          padding: 13px;
        }

        .er-title-row {
          flex-direction: column;
        }

        .er-number {
          text-align: left;
        }

        .er-balance-amount {
          font-size: 19px;
        }
      }

      @media print {
        body * {
          visibility: hidden !important;
        }

        #printableReceipt,
        #printableReceipt * {
          visibility: visible !important;
        }

        #printableReceipt {
          position: absolute !important;
          left: 0 !important;
          top: 0 !important;
          width: 100% !important;
          max-width: none !important;
          box-shadow: none !important;
        }

        .no-print,
        .er-actions {
          display: none !important;
        }

        .er-header,
        .er-amount-banner,
        .er-balance,
        .er-table th,
        .er-table .er-total-row td {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        @page {
          size: A4 portrait;
          margin: 10mm;
        }
      }
    </style>

    ${pageHeader(
      "Payment Receipt",
      "View, download or print a tenant payment receipt.",
      '<button class="btn outline no-print" id="backReceipts">← Back</button>'
    )}

    <div class="receipt-page">
      <article id="printableReceipt" class="estate-receipt">
        <header class="er-header">
          <div style="min-width:0">
            <div class="er-estate-name">${escapeHTML(estateName)}</div>
            <div class="er-contact">
              ${escapeHTML(postalAddress)}<br>
              Tel: ${escapeHTML(phonePrimary)} · ${escapeHTML(phoneSecondary)}
            </div>
          </div>
          <div class="er-receipt-badge">
            <small>PAYMENT</small>
            <strong>RECEIPT</strong>
          </div>
        </header>

        <div class="er-content">
          <div class="er-title-row">
            <div>
              <h2 class="er-title">Payment Receipt</h2>
              <div class="er-muted">Official acknowledgement of payment received.</div>
            </div>
            <div class="er-number">
              <strong>No. ${escapeHTML(receiptNumber)}</strong><br>
              Date: ${escapeHTML(payment.payment_date || "—")}
            </div>
          </div>

          <div class="er-details">
            <div class="er-detail">
              <div class="er-label">TENANT</div>
              <div class="er-value">${escapeHTML(tenant?.full_name || "—")}</div>
            </div>
            <div class="er-detail">
              <div class="er-label">HOUSE / UNIT</div>
              <div class="er-value">${escapeHTML(house?.house_number || "—")}</div>
            </div>
            <div class="er-detail">
              <div class="er-label">BILLING MONTH</div>
              <div class="er-value">${escapeHTML(billingMonth)}</div>
            </div>
            <div class="er-detail">
              <div class="er-label">PAYMENT METHOD</div>
              <div class="er-value">${escapeHTML(payment.payment_method || "—")}</div>
            </div>
          </div>

          <div class="er-amount-banner">
            <div>
              <div class="er-label">AMOUNT RECEIVED</div>
              <div class="er-muted">Payment recorded successfully</div>
            </div>
            <div class="er-amount">${money(amountReceived)}</div>
          </div>

          <div class="er-section-title">MONTHLY CHARGES</div>
          <table class="er-table">
            <thead>
              <tr><th>Description</th><th>Amount (KES)</th></tr>
            </thead>
            <tbody>
              ${chargeItems.map(([label, amount]) => `
                <tr>
                  <td>${escapeHTML(label)}</td>
                  <td>${escapeHTML(money(amount))}</td>
                </tr>
              `).join("")}
              <tr class="er-total-row">
                <td>TOTAL MONTHLY CHARGES</td>
                <td>${money(charge?.total_charges || 0)}</td>
              </tr>
            </tbody>
          </table>

          <div class="er-section-title">PAYMENT DETAILS</div>
          <div class="er-account">
            <div class="er-account-row">
              <span>M-Pesa reference</span>
              <strong>${escapeHTML(payment.mpesa_reference || "N/A")}</strong>
            </div>
            <div class="er-account-row">
              <span>Payment received by</span>
              <strong>${escapeHTML(payment.received_by || "—")}</strong>
            </div>
            <div class="er-account-row">
              <span>Previous balance</span>
              <strong>${money(previousBalance)}</strong>
            </div>
            <div class="er-account-row">
              <span>Total due before this month's payments</span>
              <strong>${money(amountDue)}</strong>
            </div>
            <div class="er-account-row">
              <span>Total payments this month</span>
              <strong>${money(paymentsThisMonth)}</strong>
            </div>
          </div>

          <div class="er-balance">
            <div>
              <div class="er-balance-label">CLOSING BALANCE</div>
              <div class="er-balance-status">
                ${closing < 0 ? "Credit balance" : closing > 0 ? "Outstanding balance" : "Account settled"}
              </div>
            </div>
            <div class="er-balance-amount">${money(closing)}</div>
          </div>
        </div>

        <footer class="er-footer">
          <strong>THANK YOU FOR YOUR PAYMENT</strong>
          <p>Keep this receipt for your records.<br>
          ${escapeHTML(estateName)} · ${escapeHTML(phonePrimary)}</p>
        </footer>
      </article>
    </div>

    <div class="er-actions no-print">
      <button class="er-action er-download" id="downloadReceipt" type="button">
        Download Receipt (PNG)
      </button>
      <button class="er-action er-print" id="printReceipt" type="button">
        Print Receipt
      </button>
    </div>
  `;

  $("#backReceipts").addEventListener("click", () => navigate("receipts"));
  $("#printReceipt").addEventListener("click", () => window.print());

  $("#downloadReceipt").addEventListener("click", async () => {
    const receipt = $("#printableReceipt");
    const button = $("#downloadReceipt");

    if (!receipt) {
      notify("Receipt not found.", true);
      return;
    }

    if (typeof html2canvas === "undefined") {
      notify("Image library is not loaded. Check index.html.", true);
      return;
    }

    button.disabled = true;
    button.textContent = "Preparing receipt...";

    const originalWidth = receipt.style.width;
    const originalMaxWidth = receipt.style.maxWidth;

    try {
      receipt.style.width = "620px";
      receipt.style.maxWidth = "620px";

      await new Promise(resolve => requestAnimationFrame(resolve));

      const canvas = await html2canvas(receipt, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
        scrollX: 0,
        scrollY: 0
      });

      // Image dimensions follow the receipt. No oversized square canvas.
      const padding = 12;
      const output = document.createElement("canvas");
      output.width = canvas.width + padding * 2;
      output.height = canvas.height + padding * 2;

      const ctx = output.getContext("2d");
      if (!ctx) throw new Error("Unable to create image canvas.");

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, output.width, output.height);
      ctx.drawImage(canvas, padding, padding);

      const blob = await new Promise(resolve =>
        output.toBlob(resolve, "image/png")
      );

      if (!blob) throw new Error("Could not generate PNG.");

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const safeNumber = String(receiptNumber).replace(/[^a-zA-Z0-9_-]/g, "_");

      link.href = url;
      link.download = `Rehema-Estate-Receipt-${safeNumber}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();

      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify("Receipt downloaded successfully.");
    } catch (error) {
      console.error("Receipt download failed:", error);
      notify("Receipt download failed. Please try printing instead.", true);
    } finally {
      receipt.style.width = originalWidth;
      receipt.style.maxWidth = originalMaxWidth;
      button.disabled = false;
      button.textContent = "Download Receipt (PNG)";
    }
  });
}

/* =========================================================
   PART 4 — ARREARS, REPORTS, SETTINGS AND STARTUP
   ========================================================= */

/* ---------------- ARREARS ---------------- */

async function renderArrears() {
  const balances = await fetchRows("tenant_balances");

  const active = balances.filter(b => b.is_active);
  const owing = active.filter(b => Number(b.balance) > 0);
  const credits = active.filter(b => Number(b.balance) < 0);
  const settled = active.filter(b => Number(b.balance) === 0);

  const totalOwed = owing.reduce(
    (sum, b) => sum + Number(b.balance || 0),
    0
  );

  content.innerHTML = `
    ${pageHeader(
      "Arrears",
      "Review outstanding balances and tenant credits."
    )}

    <div class="stats-grid">
      ${statCard("Tenants owing", owing.length, "!", "Outstanding balances")}
      ${statCard("Total arrears", money(totalOwed), "↗", "Amounts owed")}
      ${statCard("Credit accounts", credits.length, "+", "Credit balances")}
      ${statCard("Settled accounts", settled.length, "✓", "Zero balance")}
    </div>

    <section class="panel">
      <div class="toolbar">
        <input id="arrearsSearch" placeholder="Search tenant or house…">

        <select id="arrearsFilter">
          <option value="all">All active tenants</option>
          <option value="owing">Owing money</option>
          <option value="credit">Credit balance</option>
          <option value="settled">Settled</option>
        </select>
      </div>

      <div id="arrearsTable"></div>
    </section>`;

  const draw = () => {
    const term = $("#arrearsSearch").value.toLowerCase();
    const filter = $("#arrearsFilter").value;

    const rows = active.filter(b => {
      const text = `${b.full_name || ""} ${b.house_number || ""}`
        .toLowerCase();

      const balance = Number(b.balance || 0);

      const matchesSearch = text.includes(term);

      const matchesFilter =
        filter === "all" ||
        (filter === "owing" && balance > 0) ||
        (filter === "credit" && balance < 0) ||
        (filter === "settled" && balance === 0);

      return matchesSearch && matchesFilter;
    }).sort((a, b) => Number(b.balance) - Number(a.balance));

    $("#arrearsTable").innerHTML = tableHTML(
      [
        "Tenant",
        "House",
        "Total charges",
        "Total paid",
        "Balance",
        "Status"
      ],
      rows.map(b => {
        const balance = Number(b.balance || 0);

        const status = balance > 0
          ? '<span class="badge danger">Owing</span>'
          : balance < 0
            ? '<span class="badge warning">Credit</span>'
            : '<span class="badge">Settled</span>';

        return [
          escapeHTML(b.full_name || "—"),
          escapeHTML(b.house_number || "—"),
          money(b.total_charges),
          money(b.total_paid),
          `<strong>${money(balance)}</strong>`,
          status
        ];
      })
    );
  };

  draw();

  $("#arrearsSearch").addEventListener("input", draw);
  $("#arrearsFilter").addEventListener("change", draw);
}

/* ---------------- REPORTS AND STATEMENTS ---------------- */

async function renderReports() {
  const [tenants, houses, charges, payments] = await Promise.all([
    fetchRows("tenants"),
    fetchRows("houses"),
    fetchRows("monthly_charges"),
    fetchRows("payments")
  ]);

  const settings = await fetchRows("estate_settings");
  const estate = settings[0] || {};

  content.innerHTML = `
    ${pageHeader(
      "Reports & Statements",
      "Generate and download professional tenant account statements."
    )}

    <section class="form-card no-print">
      <form id="statementForm">
        <label>Select tenant</label>

        <select name="tenant_id" required>
          <option value="">Select tenant</option>

          ${tenants.map(t => {
            const house = houses.find(h => h.id === t.house_id);

            return `
              <option value="${escapeHTML(t.id)}">
                ${escapeHTML(t.full_name)} —
                ${escapeHTML(house?.house_number || "—")}
                ${t.is_active ? "" : " (Moved out)"}
              </option>
            `;
          }).join("")}
        </select>

        <div class="form-grid">
          <div>
            <label>Statement from</label>
            <input type="date" name="from"
              value="${new Date().getFullYear()}-01-01" required>
          </div>

          <div>
            <label>Statement to</label>
            <input type="date" name="to"
              value="${today()}" required>
          </div>
        </div>

        <div class="form-actions">
          <button class="btn primary" type="submit">
            Generate statement
          </button>
        </div>
      </form>
    </section>

    <section id="statementResult" style="margin-top:20px"></section>
  `;

  $("#statementForm").addEventListener("submit", event => {
    event.preventDefault();

    const data = new FormData(event.currentTarget);

    const tenant = tenants.find(
      t => t.id === data.get("tenant_id")
    );

    const from = String(data.get("from") || "");
    const to = String(data.get("to") || "");

    if (!tenant || !from || !to || from > to) {
      notify("Choose a tenant and a valid date range.", true);
      return;
    }

    const house = houses.find(h => h.id === tenant.house_id);

    const tenantCharges = charges.filter(
      c => c.tenant_id === tenant.id
    );

    const tenantPayments = payments.filter(
      p => p.tenant_id === tenant.id
    );

    /*
      STATEMENT CALCULATIONS

      Charges use period_start.
      Payments use payment_date.
      Opening balance includes all transactions before the
      selected starting date.
      Closing balance is calculated chronologically.
    */

    const openingCharges = tenantCharges
      .filter(c => String(c.period_start || "") < from)
      .reduce(
        (sum, c) => sum + Number(c.total_charges || 0),
        0
      );

    const openingPayments = tenantPayments
      .filter(p => String(p.payment_date || "") < from)
      .reduce(
        (sum, p) => sum + Number(p.amount_received || 0),
        0
      );

    const openingBalance = openingCharges - openingPayments;

    const ledger = [
      ...tenantCharges
        .filter(c =>
          String(c.period_start || "") >= from &&
          String(c.period_start || "") <= to
        )
        .map(c => ({
          date: String(c.period_start || ""),
          sortOrder: 0,
          type: "Monthly rent / charges",
          receipt: "—",
          receivedBy: "—",
          method: "—",
          reference: "—",
          charge: Number(c.total_charges || 0),
          payment: 0
        })),

      ...tenantPayments
        .filter(p =>
          String(p.payment_date || "") >= from &&
          String(p.payment_date || "") <= to
        )
        .map(p => ({
          date: String(p.payment_date || ""),
          sortOrder: 1,
          type: "Rent payment",
          receipt: p.receipt_number || "—",
          receivedBy: p.received_by || "—",
          method: p.payment_method || "—",
          reference: p.mpesa_reference || "—",
          charge: 0,
          payment: Number(p.amount_received || 0)
        }))
    ].sort((a, b) => {
      const comparison = a.date.localeCompare(b.date);

      return comparison !== 0
        ? comparison
        : a.sortOrder - b.sortOrder;
    });

    let runningBalance = openingBalance;

    const statementRows = ledger.map(item => {
      runningBalance += item.charge - item.payment;

      return `
        <tr>
          <td>${escapeHTML(item.date || "—")}</td>
          <td>${escapeHTML(item.type)}</td>
          <td>${escapeHTML(item.receipt)}</td>
          <td>${escapeHTML(item.method)}</td>
          <td>${escapeHTML(item.reference)}</td>
          <td class="amount">
            ${item.charge ? money(item.charge) : "—"}
          </td>
          <td class="amount">
            ${item.payment ? money(item.payment) : "—"}
          </td>
          <td class="amount balance-cell">
            ${money(runningBalance)}
          </td>
        </tr>
      `;
    }).join("");

    const closingBalance = runningBalance;

    const estateName = estate.estate_name || "REHEMA ESTATE";
    const postalAddress =
      estate.postal_address || "P.O. Box 201104, Nakuru";
    const phonePrimary = estate.phone_primary || "0720 871123";
    const phoneSecondary = estate.phone_secondary || "0722 965523";

    const statementNumber =
      "ST-" +
      String(tenant.id).replace(/[^a-zA-Z0-9]/g, "").slice(-8).toUpperCase() +
      "-" +
      from.replace(/-/g, "") +
      "-" +
      to.replace(/-/g, "");

    const generatedDate = today();

    const balanceLabel =
      closingBalance > 0
        ? "BALANCE DUE"
        : closingBalance < 0
          ? "CREDIT BALANCE"
          : "ACCOUNT SETTLED";

    const balanceDescription =
      closingBalance > 0
        ? "Please clear the outstanding amount."
        : closingBalance < 0
          ? "Your account has a credit balance."
          : "No outstanding balance for this account.";

    $("#statementResult").innerHTML = `
      <style>
        .saf-statement {
          width: 100%;
          max-width: 1000px;
          margin: 0 auto;
          background: #fff;
          color: #202820;
          border: 1px solid #dfe7e1;
          border-radius: 10px;
          overflow: hidden;
          font-family: Arial, Helvetica, sans-serif;
          box-shadow: 0 4px 18px rgba(0,0,0,.07);
        }

        .saf-header {
          background: #008542;
          color: #fff;
          padding: 28px 30px;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 20px;
        }

        .saf-brand {
          font-size: 27px;
          font-weight: 800;
          letter-spacing: -.5px;
          margin: 0 0 7px;
        }

        .saf-subtitle {
          font-size: 12px;
          letter-spacing: 2px;
          font-weight: bold;
          opacity: .95;
        }

        .saf-header-right {
          text-align: right;
          font-size: 12px;
          line-height: 1.8;
        }

        .saf-header-right h3 {
          margin: 0 0 5px;
          font-size: 19px;
        }

        .saf-body {
          padding: 28px 30px;
        }

        .saf-document-title {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 15px;
          margin-bottom: 24px;
        }

        .saf-document-title h2 {
          font-size: 23px;
          margin: 0 0 7px;
          color: #123d27;
        }

        .saf-muted {
          color: #68746c;
          font-size: 12px;
          line-height: 1.7;
        }

        .saf-reference {
          text-align: right;
          font-size: 12px;
          line-height: 1.8;
          overflow-wrap: anywhere;
        }

        .saf-details {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0;
          border: 1px solid #e1e9e3;
          border-radius: 8px;
          overflow: hidden;
          margin-bottom: 22px;
        }

        .saf-detail {
          padding: 15px 17px;
          border-bottom: 1px solid #e1e9e3;
        }

        .saf-detail:nth-child(odd) {
          border-right: 1px solid #e1e9e3;
        }

        .saf-detail:nth-last-child(-n+2) {
          border-bottom: none;
        }

        .saf-label {
          color: #68746c;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: .7px;
          margin-bottom: 7px;
        }

        .saf-value {
          font-size: 14px;
          font-weight: 700;
          overflow-wrap: anywhere;
        }

        .saf-summary {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          margin-bottom: 25px;
        }

        .saf-summary-card {
          padding: 17px;
          border-radius: 8px;
          background: #f3f7f4;
          border: 1px solid #e2ebe4;
        }

        .saf-summary-card.due {
          background: #eaf5ee;
          border-color: #cce3d3;
        }

        .saf-summary-card .saf-value {
          font-size: 19px;
          margin-top: 7px;
        }

        .saf-table-heading {
          color: #123d27;
          font-size: 15px;
          font-weight: 800;
          margin: 25px 0 12px;
        }

        .saf-table-wrap {
          width: 100%;
          overflow-x: auto;
        }

        .saf-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11px;
          min-width: 700px;
        }

        .saf-table th {
          background: #008542;
          color: #fff;
          text-align: left;
          padding: 12px 9px;
          white-space: nowrap;
        }

        .saf-table td {
          padding: 12px 9px;
          border-bottom: 1px solid #e5ebe6;
          vertical-align: top;
        }

        .saf-table tbody tr:nth-child(even) {
          background: #f7faf8;
        }

        .saf-table .amount {
          text-align: right;
          white-space: nowrap;
        }

        .saf-table .balance-cell {
          font-weight: 700;
          color: #145d36;
        }

        .saf-opening-row td {
          background: #edf5ef;
          font-weight: 700;
        }

        .saf-closing {
          margin-top: 22px;
          padding: 20px;
          background: #f0f7f2;
          border: 1px solid #cfe5d5;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 15px;
        }

        .saf-closing-label {
          font-size: 12px;
          font-weight: 800;
          letter-spacing: .8px;
          color: #235b39;
        }

        .saf-closing-amount {
          font-size: 26px;
          font-weight: 800;
          color: #007a3d;
          text-align: right;
        }

        .saf-footer {
          padding: 18px 30px;
          background: #f6f8f6;
          border-top: 1px solid #e2e9e3;
          font-size: 11px;
          color: #647067;
          line-height: 1.8;
        }

        .saf-actions {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 12px;
          margin: 20px auto;
        }

        .saf-download-btn {
          background: #008542;
          color: #fff;
          border: none;
          border-radius: 6px;
          padding: 12px 20px;
          font-weight: 700;
          cursor: pointer;
        }

        .saf-download-btn:hover {
          background: #006d36;
        }

        .saf-print-btn {
          background: #fff;
          color: #008542;
          border: 1px solid #008542;
          border-radius: 6px;
          padding: 12px 20px;
          font-weight: 700;
          cursor: pointer;
        }

        @media (max-width: 600px) {
          .saf-header {
            padding: 22px 18px;
            flex-direction: column;
          }

          .saf-header-right {
            text-align: left;
          }

          .saf-body {
            padding: 20px 15px;
          }

          .saf-document-title {
            flex-direction: column;
          }

          .saf-reference {
            text-align: left;
          }

          .saf-details {
            grid-template-columns: 1fr;
          }

          .saf-detail,
          .saf-detail:nth-child(odd) {
            border-right: none;
            border-bottom: 1px solid #e1e9e3;
          }

          .saf-detail:last-child {
            border-bottom: none;
          }

          .saf-summary {
            grid-template-columns: 1fr;
          }

          .saf-closing {
            align-items: flex-start;
            flex-direction: column;
          }

          .saf-closing-amount {
            text-align: left;
          }
        }

        @media print {
          body * {
            visibility: hidden !important;
          }

          #printableStatement,
          #printableStatement * {
            visibility: visible !important;
          }

          #printableStatement {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            max-width: none;
            border: none;
            border-radius: 0;
            box-shadow: none;
            margin: 0;
          }

          .no-print,
          .saf-actions {
            display: none !important;
          }

          .saf-header,
          .saf-table th,
          .saf-opening-row td,
          .saf-closing,
          .saf-summary-card {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          @page {
            size: A4 landscape;
            margin: 10mm;
          }
        }
      </style>

      <article class="saf-statement" id="printableStatement">

        <header class="saf-header">
          <div>
            <h1 class="saf-brand">
              ${escapeHTML(estateName)}
            </h1>

            <div class="saf-subtitle">
              TENANT ACCOUNT SERVICES
            </div>
          </div>

          <div class="saf-header-right">
            <h3>ACCOUNT STATEMENT</h3>
            <div>${escapeHTML(postalAddress)}</div>
            <div>${escapeHTML(phonePrimary)}</div>
            <div>${escapeHTML(phoneSecondary)}</div>
          </div>
        </header>

        <div class="saf-body">

          <div class="saf-document-title">
            <div>
              <h2>Tenant Statement</h2>
              <div class="saf-muted">
                Summary of charges and payments for the selected period.
              </div>
            </div>

            <div class="saf-reference">
              <strong>Statement reference</strong><br>
              ${escapeHTML(statementNumber)}<br>
              <strong>Generated:</strong>
              ${escapeHTML(generatedDate)}
            </div>
          </div>

          <div class="saf-details">
            <div class="saf-detail">
              <div class="saf-label">Tenant name</div>
              <div class="saf-value">
                ${escapeHTML(tenant.full_name)}
              </div>
            </div>

            <div class="saf-detail">
              <div class="saf-label">House / Unit</div>
              <div class="saf-value">
                ${escapeHTML(house?.house_number || "—")}
              </div>
            </div>

            <div class="saf-detail">
              <div class="saf-label">Statement period</div>
              <div class="saf-value">
                ${escapeHTML(from)} to ${escapeHTML(to)}
              </div>
            </div>

            <div class="saf-detail">
              <div class="saf-label">Account status</div>
              <div class="saf-value">
                ${escapeHTML(tenant.is_active ? "Active tenant" : "Moved out")}
              </div>
            </div>
          </div>

          <div class="saf-summary">
            <div class="saf-summary-card">
              <div class="saf-label">Opening balance</div>
              <div class="saf-value">${money(openingBalance)}</div>
            </div>

            <div class="saf-summary-card">
              <div class="saf-label">Charges this period</div>
              <div class="saf-value">
                ${money(ledger.reduce((sum, item) => sum + item.charge, 0))}
              </div>
            </div>

            <div class="saf-summary-card">
              <div class="saf-label">Payments this period</div>
              <div class="saf-value">
                ${money(ledger.reduce((sum, item) => sum + item.payment, 0))}
              </div>
            </div>
          </div>

          <div class="saf-table-heading">
            Transaction Details
          </div>

          <div class="saf-table-wrap">
            <table class="saf-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Transaction</th>
                  <th>Receipt No.</th>
                  <th>Method</th>
                  <th>M-Pesa Ref.</th>
                  <th style="text-align:right">Charges</th>
                  <th style="text-align:right">Payments</th>
                  <th style="text-align:right">Balance</th>
                </tr>
              </thead>

              <tbody>
                <tr class="saf-opening-row">
                  <td>${escapeHTML(from)}</td>
                  <td colspan="6">Opening balance</td>
                  <td class="amount">${money(openingBalance)}</td>
                </tr>

                ${statementRows || `
                  <tr>
                    <td colspan="8" style="text-align:center;padding:24px">
                      No transactions were recorded during this period.
                    </td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>

          <div class="saf-closing">
            <div>
              <div class="saf-closing-label">
                ${escapeHTML(balanceLabel)}
              </div>

              <div class="saf-muted">
                ${escapeHTML(balanceDescription)}
              </div>
            </div>

            <div class="saf-closing-amount">
              ${money(closingBalance)}
            </div>
          </div>

        </div>

        <footer class="saf-footer">
          <strong>${escapeHTML(estateName)}</strong><br>
          ${escapeHTML(postalAddress)}<br>
          Contact: ${escapeHTML(phonePrimary)} / ${escapeHTML(phoneSecondary)}<br>
          This statement is generated from the records available in the estate
          management system. Please contact the management if you identify any
          discrepancy.
        </footer>
      </article>

      <div class="saf-actions no-print">
        <button id="downloadStatementPDF" class="saf-download-btn" type="button">
          Download Statement PDF
        </button>

        <button id="printStatement" class="saf-print-btn" type="button">
          Print Statement
        </button>
      </div>
    `;

    /*
      DOWNLOAD PDF

      Uses html2pdf.js when it is already loaded.
      If it is not loaded, the user can still save the statement
      through the browser's Print > Save as PDF option.
    */

    $("#downloadStatementPDF").addEventListener("click", async () => {
      const statementElement = $("#printableStatement");

      const filename =
        `Statement-${String(tenant.full_name || "Tenant")
          .replace(/[^a-z0-9-_ ]/gi, "")
          .trim()
          .replace(/\s+/g, "-")}-${from}-to-${to}.pdf`;

      if (typeof html2pdf !== "undefined") {
        const button = $("#downloadStatementPDF");
        const originalText = button.textContent;

        button.disabled = true;
        button.textContent = "Preparing PDF...";

        try {
          await html2pdf()
            .set({
              margin: [8, 8, 8, 8],
              filename,
              image: {
                type: "jpeg",
                quality: 0.98
              },
              html2canvas: {
                scale: 2,
                useCORS: true,
                backgroundColor: "#ffffff",
                scrollY: 0
              },
              jsPDF: {
                unit: "mm",
                format: "a4",
                orientation: "landscape"
              },
              pagebreak: {
                mode: ["css", "legacy"]
              }
            })
            .from(statementElement)
            .save();
        } catch (error) {
          console.error("PDF download failed:", error);
          notify("PDF download failed. Use Print Statement instead.", true);
        } finally {
          button.disabled = false;
          button.textContent = originalText;
        }
      } else {
        notify(
          "PDF library is not loaded. Choose Print Statement, then select Save as PDF."
        );

        window.print();
      }
    });

    $("#printStatement").addEventListener("click", () => {
      window.print();
    });
  });
}

/* ---------------- SETTINGS ---------------- */

function renderSettings() {
  const saved = (() => {
    try {
      return JSON.parse(localStorage.getItem(THEME_KEY) || "{}");
    } catch {
      return {};
    }
  })();

  content.innerHTML = `
    ${pageHeader(
      "Settings",
      "Customise the appearance of your property manager."
    )}

    <div class="settings-row">
      <section class="panel">
        <h3>Appearance</h3>

        <label>Colour theme</label>

        <select id="themeChoice">
          <option value="">Navy & Dark Emerald — default</option>
          <option value="theme-royal">Royal Blue</option>
          <option value="theme-burgundy">Burgundy</option>
          <option value="theme-teal">Teal</option>
          <option value="theme-purple">Purple</option>
          <option value="theme-charcoal">Charcoal</option>
        </select>

        <label>Display mode</label>

        <select id="modeChoice">
          <option value="system">System preference</option>
          <option value="light">Light mode</option>
          <option value="dark">Dark mode</option>
        </select>

        <div class="form-actions">
          <button id="saveAppearance" class="btn primary">
            Save appearance
          </button>
        </div>
      </section>

      <section class="panel">
        <h3>Estate information</h3>

        <p class="muted small">
          Edit the information printed on receipts and statements.
        </p>

        <form id="estateForm">
          <label>Estate name</label>
          <input name="estate_name"
            value="REHEMA ESTATE" required>

          <label>Postal address</label>
          <input name="postal_address"
            value="P.O. Box 201104, Nakuru" required>

          <label>Primary phone</label>
          <input name="phone_primary"
            value="0720 871123" required>

          <label>Secondary phone</label>
          <input name="phone_secondary"
            value="0722 965523" required>

          <label>Water rate per unit (KSh)</label>
          <input name="default_water_rate"
            type="number" min="0" step=".01"
            value="100" required>

          <div class="form-actions">
            <button class="btn primary" type="submit">
              Save estate details
            </button>
          </div>
        </form>
      </section>
    </div>

    <section class="panel" style="margin-top:18px">
      <h3>Account</h3>

      <p>
        Signed in as
        <strong>${escapeHTML(currentUser?.email || "")}</strong>
      </p>

      <p class="muted small">
        Both authorised accounts have the same application features.
      </p>

      <button class="btn outline" id="settingsSignOut">
        Sign out
      </button>
    </section>

    <section class="panel" style="margin-top:18px">
      <h3>Data and backups</h3>

      <p class="muted">
        Export payment records to a CSV file. Protect downloaded files
        because they contain private tenant information.
      </p>

      <button class="btn outline" id="exportPayments">
        Export payment CSV
      </button>
    </section>`;

  $("#themeChoice").value = saved.theme || "";
  $("#modeChoice").value = saved.mode || "system";

  $("#saveAppearance").addEventListener("click", () => {
    saveTheme(
      $("#themeChoice").value,
      $("#modeChoice").value
    );

    notify("Appearance preferences saved on this device.");
  });

  $("#estateForm").addEventListener("submit", async event => {
    event.preventDefault();

    const data = new FormData(event.currentTarget);

    const payload = {
      id: 1,
      estate_name: String(data.get("estate_name") || "").trim(),
      postal_address: String(data.get("postal_address") || "").trim(),
      phone_primary: String(data.get("phone_primary") || "").trim(),
      phone_secondary: String(data.get("phone_secondary") || "").trim(),
      default_water_rate: Number(data.get("default_water_rate")),
      currency: "KES"
    };

    try {
      const { error } = await db
        .from("estate_settings")
        .upsert(payload, { onConflict: "id" });

      if (error) throw error;

      notify("Estate settings saved.");
    } catch (error) {
      notify(error.message, true);
    }
  });

  $("#settingsSignOut").addEventListener("click", () => {
    $("#signOut")?.click();
  });

  $("#exportPayments").addEventListener("click", async () => {
    try {
      const payments = await fetchRows("payments");

      const headers = [
        "Receipt Number",
        "Payment Date",
        "Tenant ID",
        "House ID",
        "Period",
        "Paid By",
        "Received By",
        "Method",
        "M-Pesa Reference",
        "Amount"
      ];

      const lines = [
        headers,
        ...payments.map(p => [
          p.receipt_number,
          p.payment_date,
          p.tenant_id,
          p.house_id,
          p.period_start,
          p.paid_by,
          p.received_by,
          p.payment_method,
          p.mpesa_reference || "",
          p.amount_received
        ])
      ];

      const csv = lines.map(row =>
        row.map(value =>
          `"${String(value ?? "").replace(/"/g, '""')}"`
        ).join(",")
      ).join("\r\n");

      const blob = new Blob(
        ["\uFEFF" + csv],
        { type: "text/csv;charset=utf-8;" }
      );

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = `rehema-payments-${today()}.csv`;

      document.body.appendChild(link);
      link.click();
      link.remove();

      URL.revokeObjectURL(url);

      notify("Payment CSV exported.");
    } catch (error) {
      notify(error.message, true);
    }
  });
}

/* ---------------- APPLICATION STARTUP ---------------- */

(async function init() {
  applySavedTheme();
  setConnectionStatus();
  updateSyncStatus();

  await verifySession();
})();
