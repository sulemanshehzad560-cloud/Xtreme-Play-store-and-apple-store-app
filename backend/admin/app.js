// Xtreme Dispatch: office dashboard for the Xtreme-Cleaning Partner API.
// Plain ES modules, no build step. Every action goes through the admin API, which
// enforces the admin role on the server.

const $ = (sel) => document.querySelector(sel);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const aed = (n) => (n == null ? "To quote" : `AED ${Number(n).toLocaleString("en-US")}`);
const when = (iso) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai" }).format(new Date(iso));
const LABEL = { requested: "Requested", confirmed: "Confirmed", assigned: "Assigned", en_route: "On the way", arrived: "Arrived", in_progress: "In progress", completed: "Completed", cancelled: "Cancelled" };
const STAFF_LABEL = { off_duty: "Off duty", available: "Available", en_route: "On the way", on_job: "On a job", on_break: "On break" };
const STAFF_COLOR = { available: "#1E9E5A", en_route: "#B98F35", on_job: "#2F6FDE", on_break: "#C77C02", off_duty: "#8A8172" };

// ------------------------------------------------------------------ session & API

let session = JSON.parse(sessionStorage.getItem("xtreme.admin") || "null");
const saveSession = (s) => {
  session = s;
  if (s) sessionStorage.setItem("xtreme.admin", JSON.stringify(s));
  else sessionStorage.removeItem("xtreme.admin");
};

let refreshing = null;
async function refresh() {
  refreshing ??= fetch("/v1/auth/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken: session.refreshToken }) })
    .then(async (r) => {
      if (!r.ok) throw new Error("expired");
      saveSession({ ...session, ...(await r.json()) });
    })
    .finally(() => (refreshing = null));
  return refreshing;
}

async function api(path, { method, body } = {}, retry = true) {
  const res = await fetch(`/v1${path}`, {
    method: method ?? (body ? "POST" : "GET"),
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(session ? { Authorization: `Bearer ${session.accessToken}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && retry && session) {
    try {
      await refresh();
      return api(path, { method, body }, false);
    } catch {
      logout();
      throw new Error("Session expired");
    }
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message ?? `Request failed (${res.status})`);
  return data;
}

function toast(msg) {
  if (!msg) return; // a cancelled confirmation needs no message
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("show"), 2600);
}

/** A confirm / cancel box for anything that changes money, prices, access or the live server. */
function confirmBox({ title, message, confirm = "Confirm", danger = false }) {
  return new Promise((resolve) => {
    const d = $("#confirm-dialog");
    d.innerHTML = `<form method="dialog" class="confirm">
      <div class="confirm-icon ${danger ? "danger" : ""}">${danger ? "!" : "?"}</div>
      <h3>${esc(title)}</h3><p>${esc(message)}</p>
      <div class="confirm-actions"><button class="btn outline" value="cancel">Cancel</button><button class="btn ${danger ? "danger-solid" : "primary"}" value="ok" autofocus>${esc(confirm)}</button></div>
    </form>`;
    d.returnValue = "";
    d.onclose = () => resolve(d.returnValue === "ok");
    d.showModal();
  });
}

/** Stops the action quietly when the confirmation is cancelled. */
async function sure(opts) {
  if (!(await confirmBox(opts))) throw new Error("");
}

async function act(fn, ok) {
  try {
    await fn();
    if (ok) toast(ok);
    await loadAll();
  } catch (e) {
    toast(e.message);
  }
}

// ------------------------------------------------------------------ login

let phone = "";
$("#phone-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#login-error").textContent = "";
  try {
    phone = (await api("/auth/otp/request", { body: { phone: $("#phone").value } })).phone;
    $("#phone-form").classList.add("hidden");
    $("#code-form").classList.remove("hidden");
    $("#code").focus();
  } catch (err) {
    $("#login-error").textContent = err.message;
  }
});
$("#code-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#login-error").textContent = "";
  try {
    const s = await api("/auth/otp/verify", { body: { phone, code: $("#code").value } });
    if (s.user.role !== "admin") {
      await api("/auth/logout", { body: { refreshToken: s.refreshToken } }).catch(() => {});
      throw new Error("This number is not an admin account.");
    }
    saveSession(s);
    start();
  } catch (err) {
    $("#login-error").textContent = err.message;
  }
});
function logout() {
  if (session) fetch("/v1/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken: session.refreshToken }) });
  saveSession(null);
  location.reload();
}
$("#logout").addEventListener("click", logout);

// An unattended dashboard signs itself out after 30 minutes without activity.
let lastActive = Date.now();
["click", "keydown", "mousemove", "touchstart"].forEach((ev) => document.addEventListener(ev, () => (lastActive = Date.now()), { passive: true }));
setInterval(() => {
  if (session && Date.now() - lastActive > 30 * 60_000) {
    logout();
    toast("Signed out after 30 minutes without activity");
  }
}, 60_000);

// ------------------------------------------------------------------ data

const state = { bookings: [], staff: [], payments: [], dashboard: null };

async function loadAll() {
  const day = $("#day").value;
  const now = new Date();
  const from = day === "today" ? new Date(now.toDateString()) : day === "upcoming" ? new Date(now.getTime() - 12 * 3600e3) : undefined;
  const to = day === "today" ? new Date(new Date(now.toDateString()).getTime() + 86400e3) : undefined;
  const q = new URLSearchParams({ limit: "300", status: "requested,confirmed,assigned,en_route,arrived,in_progress,completed" });
  if (from) q.set("from", from.toISOString());
  if (to) q.set("to", to.toISOString());
  const [bookings, staff, dashboard, payments] = await Promise.all([
    api(`/admin/bookings?${q}`),
    api("/admin/staff"),
    api("/admin/dashboard"),
    api("/admin/payments?limit=100"),
  ]);
  Object.assign(state, { bookings, staff, dashboard, payments });
  render();
}

// ------------------------------------------------------------------ render

function render() {
  renderKpis();
  renderBoard();
  renderStaff();
  renderPayments();
  renderMap();
}

function renderKpis() {
  const d = state.dashboard;
  if (!d) return;
  const today = Object.values(d.today).reduce((a, b) => a + b, 0);
  $("#kpis").innerHTML = [
    [`${d.awaitingConfirmation}`, "Survey jobs to confirm", d.awaitingConfirmation > 0],
    [`${d.awaitingPayment ?? 0}`, "Awaiting customer payment"],
    [`${today}`, "Jobs scheduled today"],
    [`${(d.today.en_route ?? 0) + (d.today.arrived ?? 0) + (d.today.in_progress ?? 0)}`, "Jobs live now"],
    [`${d.staff.available} / ${d.staff.onDuty}`, "Teams available / on duty"],
    [aed(d.collectedTodayAed), "Collected today"],
  ]
    .map(([v, l, alert]) => `<div class="kpi ${alert ? "alert" : ""}"><b>${esc(v)}</b><span>${esc(l)}</span></div>`)
    .join("");
}

// Prepaid bookings sit in "Awaiting payment" (no dispatch) until the customer pays, which
// confirms them automatically. Survey-priced jobs are confirmed by the office.
const COLUMNS = [
  ["Awaiting payment", (b) => b.status === "requested" && b.awaitingPayment],
  ["Survey requests", (b) => b.status === "requested" && !b.awaitingPayment],
  ["Paid · needs team", (b) => b.status === "confirmed"],
  ["Team assigned", (b) => b.status === "assigned"],
  ["Live now", (b) => ["en_route", "arrived", "in_progress"].includes(b.status)],
  ["Completed", (b) => b.status === "completed"],
];

function renderBoard() {
  const term = $("#search").value.trim().toLowerCase();
  const match = (b) =>
    !term || [b.reference, b.customer?.fullName, b.customer?.phone, b.address.area, b.service.name].join(" ").toLowerCase().includes(term);
  $("#board").innerHTML = COLUMNS.map(([title, inColumn]) => {
    const items = state.bookings.filter((b) => inColumn(b) && match(b));
    return `<div class="col"><h3>${esc(title)} <em>${items.length}</em></h3>${items.map(card).join("") || '<p class="muted" style="margin:6px">Nothing here</p>'}</div>`;
  }).join("");
}

function card(b) {
  const team = b.team.map((m) => esc(m.displayName) + (m.isLead ? " ★" : "")).join(", ");
  const actions = [];
  if (b.status === "requested" && !b.awaitingPayment) actions.push(`<button class="btn primary small" data-act="confirm" data-id="${b.id}">Confirm</button>`);
  if (["requested", "confirmed", "assigned"].includes(b.status) && !b.awaitingPayment) actions.push(`<button class="btn gold small" data-act="assign" data-id="${b.id}">${b.team.length ? "Reassign" : "Assign team"}</button>`);
  if (b.paymentStatus === "unpaid" && b.status !== "cancelled" && (b.pricing === "inspection" || b.priceAed == null)) {
    actions.push(`<button class="btn ${b.priceAed == null ? "primary" : "outline"} small" data-act="price" data-id="${b.id}">${b.priceAed == null ? "Send quote" : "Change quote"}</button>`);
  }
  if (b.status !== "completed") actions.push(`<button class="btn danger small" data-act="cancel" data-id="${b.id}">Cancel</button>`);
  if (b.paymentStatus === "paid" || b.paymentStatus === "partially_refunded") actions.push(`<button class="btn outline small" data-act="refund" data-id="${b.id}">Refund</button>`);
  if (b.status === "completed" && (b.paymentStatus === "paid" || b.paymentStatus === "partially_refunded"))
    actions.push(`<button class="btn outline small" data-act="invoice" data-id="${b.id}">${b.invoiceSentAt ? "Resend invoice" : "Email invoice"}</button>`);
  return `<div class="card">
    <div class="row"><span class="title">${esc(b.service.name)}</span><span class="pill ${b.awaitingPayment ? "awaiting" : b.status}">${b.awaitingPayment ? "Awaiting payment" : LABEL[b.status]}</span></div>
    <div class="meta">${esc(b.reference)} · ${when(b.scheduledAt)}</div>
    <div class="meta">👤 ${esc(b.customer?.fullName ?? "Customer")} · <a href="tel:${esc(b.customer?.phone)}">${esc(b.customer?.phone ?? "")}</a></div>
    <div class="meta">📍 ${esc([b.address.unit, b.address.building, b.address.area].filter(Boolean).join(", "))}</div>
    <div class="row"><span class="meta">${esc(b.property.type)} · ${esc(b.property.size)}</span><b>${b.discountAed ? `<s class="muted">${aed(b.priceAed)}</s> ${aed(b.amountDueAed)}` : aed(b.priceAed)}</b></div>
    ${b.frequency && b.frequency !== "one_time" ? `<div class="meta">↻ Repeats ${b.frequency === "weekly" ? "weekly" : "every 2 weeks"}${b.repeatOfId ? " · next visit in series" : ""}</div>` : ""}
    ${b.discountAed ? `<div class="meta">🏷️ Discount ${aed(b.discountAed)}${b.promoCode ? ` · code ${esc(b.promoCode)}` : ""}</div>` : ""}
    ${b.awaitingPayment ? `<div class="meta warn">⏳ Waiting for the customer to pay. It is confirmed automatically once paid.</div>` : ""}
    <div class="row"><span class="pill ${b.paymentStatus}">${esc(b.paymentStatus.replace("_", " "))} · ${esc(b.paymentMethod.replace("_", " "))}</span></div>
    ${team ? `<div class="meta">🧑‍🔧 ${team}</div>` : ""}
    ${b.notes ? `<div class="meta">📝 ${esc(b.notes)}</div>` : ""}
    ${b.invoiceSentAt ? `<div class="meta">✉️ Invoice emailed ${when(b.invoiceSentAt)}</div>` : ""}
    <div class="actions">${actions.join("")}</div>
  </div>`;
}

$("#board").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const b = state.bookings.find((x) => x.id === btn.dataset.id);
  ({ confirm: confirmBooking, assign: assignTeam, price: setPrice, cancel: cancelBooking, refund: refundBooking, invoice: emailInvoice })[btn.dataset.act](b);
});

const emailInvoice = (b) =>
  act(async () => {
    const r = await api(`/admin/bookings/${b.id}/invoice/email`, { body: {} });
    if (!r.sentTo) throw new Error("The customer has no email address yet. They were asked to add one in the app.");
    toast(`Invoice emailed to ${r.sentTo}`);
  });
const confirmBooking = (b) => act(() => api(`/admin/bookings/${b.id}/confirm`, { body: {} }), `${b.reference} confirmed`);

function modal(html, onSubmit) {
  const dlg = $("#modal");
  dlg.onclose = () => dlg.classList.remove("wide");
  $("#modal-body").innerHTML = html;
  $("#modal-body").onsubmit = async (e) => {
    if (e.submitter?.value === "cancel") return;
    e.preventDefault();
    try {
      await onSubmit(new FormData($("#modal-body")));
      dlg.close();
      await loadAll();
    } catch (err) {
      toast(err.message);
    }
  };
  dlg.showModal();
}

function assignTeam(b) {
  const skilled = (s) => !s.skills.length || s.skills.includes(b.service.key);
  const list = [...state.staff].filter((s) => s.active).sort((a, z) => Number(skilled(z)) - Number(skilled(a)) || a.displayName.localeCompare(z.displayName));
  const current = new Set(b.team.map((m) => m.id));
  modal(
    `<h2>Assign team · ${esc(b.reference)}</h2>
     <p class="muted">${esc(b.service.name)} · ${when(b.scheduledAt)} · ${esc(b.address.area)}</p>
     <div class="checklist">${list
       .map(
         (s) => `<label><input type="checkbox" name="staff" value="${s.id}" ${current.has(s.id) ? "checked" : ""}/>
           ${esc(s.displayName)} <small>${STAFF_LABEL[s.status]}${skilled(s) ? "" : " · other skills"}${s.currentBooking ? ` · on ${esc(s.currentBooking.reference)}` : ""}</small></label>`,
       )
       .join("")}</div>
     <label>Team lead<select name="lead">${list.map((s) => `<option value="${s.id}" ${b.team.find((m) => m.isLead)?.id === s.id ? "selected" : ""}>${esc(s.displayName)}</option>`).join("")}</select></label>
     <div class="modal-actions"><button class="btn outline" value="cancel" formnovalidate>Close</button><button class="btn primary">Assign</button></div>`,
    async (form) => {
      const staffIds = form.getAll("staff");
      if (!staffIds.length) throw new Error("Choose at least one team member");
      const lead = staffIds.includes(form.get("lead")) ? form.get("lead") : staffIds[0];
      await api(`/admin/bookings/${b.id}/assign`, { body: { staffIds, leadId: lead } });
      toast(`Team assigned to ${b.reference}`);
    },
  );
}

function setPrice(b) {
  modal(
    `<h2>${b.priceAed == null ? "Send quote" : "Change quote"} · ${esc(b.reference)}</h2>
     <p class="muted">${esc(b.service.name)}. The customer is notified at once and can pay securely in the app. The team lead can also quote on site from the staff app.</p>
     <label>Price (AED, VAT included)<input name="price" type="number" min="1" max="1000000" required value="${b.priceAed ?? ""}" /></label>
     <label>What it covers (optional)<input name="note" maxlength="200" placeholder="e.g. king-size mattress, both sides" /></label>
     <div class="modal-actions"><button class="btn outline" value="cancel" formnovalidate>Close</button><button class="btn primary">Save price</button></div>`,
    async (form) => {
      const note = String(form.get("note") || "").trim();
      await api(`/admin/bookings/${b.id}/price`, { body: { priceAed: Number(form.get("price")), ...(note ? { note } : {}) } });
      toast("Quote sent to the customer");
    },
  );
}

function cancelBooking(b) {
  modal(
    `<h2>Cancel ${esc(b.reference)}?</h2>
     <p class="muted">The customer and team are notified. Paid bookings are refunded automatically.</p>
     <label>Reason<input name="reason" placeholder="e.g. customer requested" /></label>
     <div class="modal-actions"><button class="btn outline" value="cancel" formnovalidate>Keep booking</button><button class="btn danger">Cancel booking</button></div>`,
    async (form) => {
      await api(`/admin/bookings/${b.id}/status`, { body: { status: "cancelled", reason: form.get("reason") || undefined } });
      toast(`${b.reference} cancelled`);
    },
  );
}

async function refundBooking(b) {
  const payments = (await api(`/bookings/${b.id}/payments`)).filter((p) => p.status === "captured" || p.status === "partially_refunded");
  const p = payments[0];
  if (!p) return toast("No refundable payment");
  const left = p.amountAed - p.refundedAed;
  modal(
    `<h2>Refund · ${esc(b.reference)}</h2>
     <p class="muted">Paid ${aed(p.amountAed)} by ${esc(p.method)}. Up to ${aed(left)} can be refunded.</p>
     <label>Amount (AED)<input name="amount" type="number" step="0.01" min="0.01" max="${left}" value="${left}" required /></label>
     <label>Reason<input name="reason" required minlength="3" placeholder="e.g. late arrival" /></label>
     <div class="modal-actions"><button class="btn outline" value="cancel" formnovalidate>Close</button><button class="btn primary">Refund</button></div>`,
    async (form) => {
      await sure({ title: `Refund ${aed(Number(form.get("amount")))}?`, message: `The money goes back to the customer's ${p.method === "tamara" ? "Tamara account" : "card"}. This cannot be undone.`, confirm: "Refund", danger: true });
      await api(`/admin/payments/${p.id}/refund`, { body: { amountAed: Number(form.get("amount")), reason: form.get("reason") } });
      toast("Refund issued");
    },
  );
}

// ------------------------------------------------------------------ staff directory

const SKILLS = {
  regular: "Regular cleaning", deep: "Deep cleaning", move: "Move in / out", postcon: "Post-construction",
  kitbath: "Kitchen & bathroom", carpet: "Carpet & sofa", ac: "AC ducts", pest: "Pest control",
  tank: "Water tank", facade: "Facade & windows", kitchenex: "Kitchen exhaust", laundry: "Laundry",
  drapery: "Curtains", helper: "Nanny & helper", fm: "Facilities mgmt", disinfect: "Disinfection",
};

function renderStaff() {
  const term = $("#staff-search").value.trim().toLowerCase();
  const filter = $("#staff-filter").value;
  const rows = state.staff.filter(
    (s) =>
      (filter === "all" || (filter === "active" ? s.active : !s.active)) &&
      (!term || [s.displayName, s.employeeCode, s.phone, s.teamName, s.jobTitle, s.email].join(" ").toLowerCase().includes(term)),
  );
  $("#staff-table").innerHTML = `<tr><th>Name</th><th>Code</th><th>Mobile</th><th>Role / team</th><th>Status</th><th>Emergency contact</th><th>Joined</th><th></th></tr>${rows
    .map(
      (s) => `<tr class="clickable" data-open="${s.id}">
      <td><b>${esc(s.displayName)}</b>${s.email ? `<br><small class="muted">${esc(s.email)}</small>` : ""}</td>
      <td>${esc(s.employeeCode)}</td><td>${esc(s.phone ?? "")}</td>
      <td>${esc(s.jobTitle ?? "—")}${s.teamName ? `<br><small class="muted">${esc(s.teamName)}</small>` : ""}</td>
      <td><span class="pill" style="background:${STAFF_COLOR[s.status]}22;color:${STAFF_COLOR[s.status]}">${STAFF_LABEL[s.status]}</span>${s.active ? "" : ' <span class="pill cancelled">inactive</span>'}${s.currentBooking ? `<br><small class="muted">on ${esc(s.currentBooking.reference)}</small>` : ""}</td>
      <td>${s.emergencyContactName ? `${esc(s.emergencyContactName)}<br><small class="muted">${esc(s.emergencyContactPhone ?? "")}</small>` : '<small class="muted">—</small>'}</td>
      <td>${esc(s.joinedOn ?? "—")}</td>
      <td><button class="btn outline small" data-edit="${s.id}">Edit</button></td></tr>`,
    )
    .join("") || '<tr><td colspan="8" class="muted">No staff match.</td></tr>'}`;
}
$("#staff-search").addEventListener("input", renderStaff);
$("#staff-filter").addEventListener("change", renderStaff);
$("#staff-table").addEventListener("click", (e) => {
  const row = e.target.closest("[data-edit],[data-open]");
  if (!row) return;
  staffForm(state.staff.find((s) => s.id === (row.dataset.edit ?? row.dataset.open)));
});
$("#add-staff").addEventListener("click", () => staffForm(null));
$("#export-staff").addEventListener("click", async () => {
  const res = await fetch("/v1/admin/staff.csv", { headers: { Authorization: `Bearer ${session.accessToken}` } });
  if (!res.ok) return toast("Export failed");
  const url = URL.createObjectURL(await res.blob());
  Object.assign(document.createElement("a"), { href: url, download: `xtreme-staff-${new Date().toISOString().slice(0, 10)}.csv` }).click();
  URL.revokeObjectURL(url);
});

/** One form for adding and editing: contact, job, emergency contact, skills, notes. */
async function staffForm(s) {
  if (s) s = await api(`/admin/staff/${s.id}`);
  const v = (k) => esc(s?.[k] ?? "");
  const login = s?.login;
  const history = s ? await api(`/admin/audit?targetType=staff&targetId=${s.id}&limit=20`).catch(() => []) : [];
  $("#modal").classList.add("wide");
  modal(
    `<h2>${s ? `Edit ${esc(s.displayName)}` : "Add staff member"}</h2>
     ${s ? "" : '<p class="muted">They sign in to the Xtreme-Cleaning Partner app under <b>Staff sign in</b> with their Staff ID (the employee code) and the password you set here.</p>'}
     ${
       s
         ? `<div class="signin-box">
              <div><b>App sign-in</b><div class="muted">Staff ID <code>${esc(login.staffId)}</code> · ${
                login.locked ? '<span class="pill cancelled">locked after wrong passwords</span>' : login.hasPassword ? `password set ${login.passwordSetAt ? when(login.passwordSetAt) : ""}` : "no password yet"
              }</div><div id="new-pw" class="muted"></div></div>
              <button type="button" class="btn gold small" id="reset-pw">${login.hasPassword ? "Reset password" : "Create password"}</button>
            </div>`
         : ""
     }
     <div class="form-grid">
       <label>Full name<input name="displayName" required minlength="2" value="${v("displayName")}" /></label>
       <label>Employee code<input name="employeeCode" required value="${v("employeeCode")}" /></label>
       <label>Mobile number<input name="phone" required value="${v("phone")}" placeholder="050 123 4567" /></label>
       <label>Email<input name="email" type="email" value="${v("email")}" /></label>
       <label>Job title<input name="jobTitle" value="${v("jobTitle")}" placeholder="e.g. Senior cleaner" /></label>
       <label>Team<input name="teamName" value="${v("teamName")}" placeholder="e.g. Gold Team" /></label>
       <label>Emergency contact name<input name="emergencyContactName" value="${v("emergencyContactName")}" /></label>
       <label>Emergency contact phone<input name="emergencyContactPhone" value="${v("emergencyContactPhone")}" /></label>
       <label>Joined on<input name="joinedOn" type="date" value="${v("joinedOn")}" /></label>
       ${s ? "" : '<label>App password (optional)<input name="password" minlength="8" autocomplete="new-password" placeholder="At least 8 characters, or set it later" /></label>'}
       <label>New order alerts<select name="notifyNewOrders"><option value="true" ${s?.notifyNewOrders !== false ? "selected" : ""}>On: push for every new order</option><option value="false" ${s?.notifyNewOrders === false ? "selected" : ""}>Off: only jobs assigned to them</option></select></label>
       <label>Status<select name="active"><option value="true" ${s?.active !== false ? "selected" : ""}>Active</option><option value="false" ${s?.active === false ? "selected" : ""}>Inactive (can't sign in to jobs)</option></select></label>
       <label class="full">Skills (empty = can do every service)
         <div class="checklist" style="grid-template-columns:repeat(4,1fr);max-height:none">${Object.entries(SKILLS).map(([k, label]) => `<label style="padding:6px 8px;font-size:13px"><input type="checkbox" name="skills" value="${k}" ${s?.skills?.includes(k) ? "checked" : ""}/>${label}</label>`).join("")}</div>
       </label>
       <label class="full">Internal notes<textarea name="notes" rows="3">${v("notes")}</textarea></label>
     </div>
     ${
       history.length
         ? `<details><summary class="muted">Change history (${history.length})</summary>${history.map(logLine).join("")}</details>`
         : ""
     }
     <div class="modal-actions"><button class="btn outline" value="cancel" formnovalidate>Close</button><button class="btn primary">${s ? "Save changes" : "Add staff member"}</button></div>`,
    async (form) => {
      const body = {
        displayName: form.get("displayName"),
        employeeCode: form.get("employeeCode"),
        phone: form.get("phone"),
        email: form.get("email") || null,
        jobTitle: form.get("jobTitle") || null,
        teamName: form.get("teamName") || null,
        emergencyContactName: form.get("emergencyContactName") || null,
        emergencyContactPhone: form.get("emergencyContactPhone") || null,
        joinedOn: form.get("joinedOn") || null,
        notes: form.get("notes") || null,
        skills: form.getAll("skills"),
        notifyNewOrders: form.get("notifyNewOrders") === "true",
      };
      if (s) {
        await api(`/admin/staff/${s.id}`, { method: "PATCH", body: { ...body, active: form.get("active") === "true" } });
        toast("Staff details saved");
      } else {
        const password = form.get("password");
        await api("/admin/staff", { body: { ...body, ...(password ? { password } : {}) } });
        toast(password ? `Staff member added. Staff ID ${body.employeeCode}` : "Staff member added. Create their app password from Edit.");
      }
    },
  );
  $("#reset-pw")?.addEventListener("click", async () => {
    if (!(await confirmBox({ title: "Create a new password?", message: `${s.displayName}'s current password stops working and they are signed out.`, confirm: "Create password", danger: true }))) return;
    try {
      const r = await api(`/admin/staff/${s.id}/password`, { body: {} });
      $("#new-pw").innerHTML = `New password: <code class="pw">${esc(r.password)}</code> <button type="button" class="btn outline small" id="copy-pw">Copy</button><br/>Give it to ${esc(s.displayName)} privately. It is shown only once.`;
      $("#copy-pw").onclick = () => navigator.clipboard.writeText(r.password).then(() => toast("Password copied"));
    } catch (err) {
      toast(err.message);
    }
  });
}

// ------------------------------------------------------------------ customers

/** The customer's photo (signed links load from this server), or their initials. */
function photo(u) {
  const at = u.avatarUrl?.indexOf("/v1/avatars/") ?? -1;
  if (at >= 0) return `<img class="avatar" src="${esc(u.avatarUrl.slice(at))}" alt="" loading="lazy" />`;
  const initials = (u.fullName ?? "?").split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  return `<span class="avatar">${esc(initials)}</span>`;
}

async function loadCustomers() {
  const q = $("#customer-search").value.trim();
  const rows = await api(`/admin/customers?limit=100${q ? `&q=${encodeURIComponent(q)}` : ""}`);
  $("#customers-table").innerHTML = `<tr><th>Name</th><th>Mobile</th><th>Email</th><th>Bookings</th><th>Joined</th><th></th></tr>${rows
    .map(
      (u) => `<tr><td><span class="cust">${photo(u)}<b>${esc(u.fullName ?? "—")}</b></span>${u.blocked ? ' <span class="pill cancelled">suspended</span>' : ""}</td>
      <td>${esc(u.phone ?? "—")}</td><td>${esc(u.email ?? "—")}</td><td>${u.bookings}</td><td>${when(u.createdAt)}</td>
      <td><button class="btn ${u.blocked ? "outline" : "danger"} small" data-block="${u.id}" data-blocked="${u.blocked}">${u.blocked ? "Restore" : "Suspend"}</button></td></tr>`,
    )
    .join("") || '<tr><td colspan="6" class="muted">No customers found.</td></tr>'}`;
}
let customerTimer = null;
$("#customer-search").addEventListener("input", () => {
  clearTimeout(customerTimer);
  customerTimer = setTimeout(() => loadCustomers().catch((e) => toast(e.message)), 300);
});
$("#customers-table").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-block]");
  if (!btn) return;
  const blocked = btn.dataset.blocked !== "true";
  const ok = await confirmBox(
    blocked
      ? { title: "Suspend this customer?", message: "They are signed out and can't book until restored.", confirm: "Suspend", danger: true }
      : { title: "Restore this customer?", message: "They can sign in and book again.", confirm: "Restore" },
  );
  if (!ok) return;
  api(`/admin/users/${btn.dataset.block}/block`, { body: { blocked } })
    .then(() => (toast(blocked ? "Customer suspended" : "Customer restored"), loadCustomers()))
    .catch((err) => toast(err.message));
});

// ------------------------------------------------------------------ admin & IT

const ACTION_LABEL = {
  "staff.created": "added staff member",
  "staff.updated": "edited staff member",
  "staff.deactivated": "deactivated staff member",
  "staff.activated": "re-activated staff member",
  "staff.exported": "downloaded the staff list",
  "admin.added": "gave admin access",
  "admin.removed": "removed admin access",
  "settings.company_updated": "changed company contacts",
  "user.blocked": "suspended a customer",
  "user.unblocked": "restored a customer",
};
function logLine(l) {
  const who = l.actor ? esc(l.actor.name ?? l.actor.phone) : "System";
  const fields = l.details && typeof l.details === "object" ? Object.entries(l.details).filter(([, d]) => d && typeof d === "object" && "to" in d) : [];
  const name = l.details?.name ? ` <b>${esc(l.details.name)}</b>` : "";
  return `<div class="log"><span><b>${who}</b> ${ACTION_LABEL[l.action] ?? esc(l.action)}${name}</span>
    ${fields.length ? `<span>${fields.map(([k, d]) => `<code>${esc(k)}</code> ${esc(d.from ?? "—")} → ${esc(d.to ?? "—")}`).join("<br>")}</span>` : ""}
    <small>${when(l.at)}</small></div>`;
}

async function loadDeploy() {
  const d = await api("/admin/deploy");
  $("#deploy-now").disabled = !d.configured;
  $("#deploy-status").innerHTML = !d.configured
    ? "Not set up yet: on Render open the service, <b>Settings → Deploy Hook</b>, copy the URL and add it as <code>RENDER_DEPLOY_HOOK_URL</code> in Environment."
    : d.last
      ? `Last deploy requested ${when(d.last.at)} by ${esc(d.last.actor?.name ?? "an admin")}.`
      : "Ready. No deploy requested from here yet.";
}

$("#deploy-now").addEventListener("click", async () => {
  try {
    await sure({ title: "Deploy the latest version?", message: "Render rebuilds and restarts the server with the newest code. It takes 2–5 minutes and runs any database updates.", confirm: "Deploy now", danger: true });
    await api("/admin/deploy", { body: {} });
    toast("Deploy started. The new version is live in a few minutes.");
    await loadDeploy();
  } catch (e) {
    toast(e.message);
  }
});

async function loadAdminTab() {
  loadDeploy().catch((e) => toast(e.message));
  const [admins, company, system, audit] = await Promise.all([api("/admin/admins"), api("/admin/settings/company"), api("/admin/system"), api("/admin/audit?limit=80")]);
  $("#admins-table").innerHTML = `<tr><th>Name</th><th>Mobile</th><th>Since</th><th></th></tr>${admins
    .map(
      (a) => `<tr><td><b>${esc(a.fullName ?? "—")}</b>${a.id === session.user.id ? ' <span class="pill confirmed">you</span>' : ""}</td><td>${esc(a.phone ?? "")}</td><td>${when(a.createdAt)}</td>
      <td>${a.id === session.user.id ? "" : `<button class="btn danger small" data-revoke="${a.id}">Remove</button>`}</td></tr>`,
    )
    .join("")}`;

  const fields = [
    ["phoneDisplay", "Mobile / WhatsApp (as shown)"],
    ["phone", "Mobile (international, e.g. +971501234567)"],
    ["landlineDisplay", "Landline (as shown)"],
    ["landline", "Landline (international)"],
    ["whatsapp", "WhatsApp link (https://wa.me/…)"],
    ["email", "Email"],
    ["website", "Website"],
    ["addressLine1", "Office address"],
    ["tagline", "Tagline"],
    ["facebook", "Facebook page"],
    ["instagram", "Instagram page"],
  ];
  $("#company-form").innerHTML =
    fields.map(([k, label]) => `<label class="${k === "tagline" || k === "addressLine1" ? "full" : ""}">${label}<input name="${k}" value="${esc(company[k])}" required /></label>`).join("") +
    '<div class="full modal-actions"><button class="btn primary">Save contacts</button></div>';

  const st = (ok) => (ok === true ? '<span class="state ok">Connected</span>' : ok === false ? '<span class="state no">Not set up</span>' : '<span class="state no">Optional</span>');
  const health = (h) => (h.ok === true ? `<span class="state ok">OK · ${h.ms} ms</span>` : h.ok === false ? `<span class="state bad">Down</span>` : '<span class="state no">Not used</span>');
  $("#system").innerHTML = `
    <div class="svc"><b>Database</b>${health(system.health.database)}</div>
    <div class="svc"><b>Redis (live tracking across servers)</b>${health(system.health.redis)}</div>
    ${system.integrations.map((i) => `<div class="svc"><b>${esc(i.name)}</b><small class="muted">${esc(i.provider)}${i.mode ? ` · ${esc(i.mode)}` : ""}</small>${st(i.connected)}</div>`).join("")}
    <div class="svc"><b>App Store / Play reviewer sign-in</b>${st(system.reviewerLogin.configured)}</div>
    <p class="muted">Environment ${esc(system.environment)} · version ${esc(system.version)} · up ${Math.round(system.uptimeSeconds / 3600)} h. Keys are set on the server (see docs/GO_LIVE.md); they are never shown here.</p>`;

  $("#audit").innerHTML = audit.map(logLine).join("") || '<p class="muted">No changes yet.</p>';
}

$("#admins-table").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-revoke]");
  if (!btn || !(await confirmBox({ title: "Remove dashboard access?", message: "They are signed out immediately.", confirm: "Remove access", danger: true }))) return;
  api(`/admin/admins/${btn.dataset.revoke}`, { method: "DELETE" })
    .then(() => (toast("Admin access removed"), loadAdminTab()))
    .catch((err) => toast(err.message));
});
$("#add-admin").addEventListener("click", () => {
  $("#modal").classList.remove("wide");
  modal(
    `<h2>Add admin</h2>
     <p class="muted">For office managers and IT staff. They sign in to this dashboard with a code sent to this number.</p>
     <label>Full name<input name="fullName" required minlength="2" /></label>
     <label>Mobile number<input name="phone" required placeholder="050 123 4567" /></label>
     <div class="modal-actions"><button class="btn outline" value="cancel" formnovalidate>Close</button><button class="btn primary">Give access</button></div>`,
    async (form) => {
      await sure({ title: "Give dashboard access?", message: `${form.get("fullName")} will be able to see bookings, payments and customers, and change settings.`, confirm: "Give access" });
      await api("/admin/admins", { body: { fullName: form.get("fullName"), phone: form.get("phone") } });
      toast("Admin access granted");
      await loadAdminTab();
    },
  );
});
$("#company-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await sure({ title: "Update company details?", message: "Customers see the new contacts in the app within minutes.", confirm: "Save" });
    await api("/admin/settings/company", { method: "PUT", body: Object.fromEntries(new FormData(e.target)) });
    toast("Company contacts updated");
    await loadAdminTab();
  } catch (err) {
    toast(err.message);
  }
});
$("#refresh-system").addEventListener("click", () => loadAdminTab().catch((err) => toast(err.message)));

// ------------------------------------------------------------------ payments

function renderPayments() {
  $("#payments-table").innerHTML = `<tr><th>When</th><th>Booking</th><th>Method</th><th>Amount</th><th>Refunded</th><th>Status</th></tr>${state.payments
    .map(
      (p) => `<tr><td>${when(p.createdAt)}</td><td>${esc(p.bookingReference)}</td><td>${esc(p.method)}${p.instalments ? ` · ${p.instalments}x` : ""}</td>
      <td>${aed(p.amountAed)}</td><td>${p.refundedAed ? aed(p.refundedAed) : "—"}</td><td><span class="pill ${p.status}">${esc(p.status.replace("_", " "))}</span></td></tr>`,
    )
    .join("")}`;
}

// ------------------------------------------------------------------ subscriptions

const SUB_LABEL = { pending_payment: "Awaiting payment", active: "Active", expired: "Expired", cancelled: "Cancelled" };
const subState = { plans: [], subs: [], services: [] };
const day = (iso) => (iso ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dubai" }).format(new Date(iso)) : "—");

async function loadSubscriptions() {
  const status = $("#sub-filter").value;
  const [plans, subs, services] = await Promise.all([
    api("/admin/subscription-plans"),
    api(`/admin/subscriptions?limit=200${status ? `&status=${status}` : ""}`),
    subState.services.length ? subState.services : api("/catalog/services").then((r) => r.services),
  ]);
  Object.assign(subState, { plans, subs, services });
  renderSubscriptions();
}

function renderSubscriptions() {
  $("#plans-table").innerHTML = subState.plans.length
    ? `<tr><th>Plan</th><th>Service</th><th>Visits / month</th><th>Monthly</th><th>Yearly</th><th>Status</th><th></th></tr>${subState.plans
        .map(
          (p) => `<tr><td><b>${esc(p.name)}</b>${p.description ? `<div class="meta">${esc(p.description)}</div>` : ""}</td><td>${esc(p.service.name)}</td><td>${p.visitsPerMonth}</td>
          <td>${p.priceMonthlyAed ? aed(p.priceMonthlyAed) : "—"}</td><td>${p.priceYearlyAed ? aed(p.priceYearlyAed) : "—"}</td>
          <td><span class="pill ${p.active ? "completed" : "cancelled"}">${p.active ? "On sale" : "Hidden"}</span></td>
          <td><button class="btn outline small" data-plan="${p.id}">Edit</button></td></tr>`,
        )
        .join("")}`
    : `<tr><td class="empty">No plans yet. Create one with <b>+ New plan</b>; it appears in the app straight away.</td></tr>`;
  $("#subs-table").innerHTML = subState.subs.length
    ? `<tr><th>Reference</th><th>Customer</th><th>Plan</th><th>Price</th><th>Period</th><th>Visits</th><th>Status</th><th></th></tr>${subState.subs
        .map(
          (s) => `<tr><td><b>${esc(s.reference)}</b></td><td>${esc(s.customer?.fullName ?? "Customer")}<div class="meta"><a href="tel:${esc(s.customer?.phone)}">${esc(s.customer?.phone ?? "")}</a> · ${esc(s.address.area)}</div></td>
          <td>${esc(s.planName)}<div class="meta">${esc(s.service.name)} · ${esc(s.interval)}</div></td><td>${aed(s.priceAed)}</td>
          <td>${s.currentPeriodStart ? `${day(s.currentPeriodStart)} → ${day(s.currentPeriodEnd)}` : "—"}</td>
          <td>${s.visitsUsed} / ${s.visitsPerPeriod}</td><td><span class="pill sub-${s.status}">${SUB_LABEL[s.status]}</span></td>
          <td class="actions-cell">${s.canBookVisit ? `<button class="btn gold small" data-sub-visit="${s.id}">Book visit</button>` : ""}${s.canCancel ? `<button class="btn danger small" data-sub-cancel="${s.id}">Cancel</button>` : ""}</td></tr>`,
        )
        .join("")}`
    : `<tr><td class="empty">No subscribers in this list yet.</td></tr>`;
}

function planForm(plan) {
  const services = subState.services.map((s) => `<option value="${esc(s.key)}" ${plan?.service.key === s.key ? "selected" : ""}>${esc(s.name)}</option>`).join("");
  modal(
    `<h2>${plan ? "Edit plan" : "New subscription plan"}</h2>
     <p class="muted">Plans are for regular cleaning. Leave a price empty if the plan is not sold that way. Prices include VAT.</p>
     <div class="form-grid">
       <label class="full">Plan name<input name="name" required minlength="2" maxlength="80" value="${esc(plan?.name ?? "")}" placeholder="e.g. Home care weekly" /></label>
       <label class="full">Description (shown to customers)<input name="description" maxlength="500" value="${esc(plan?.description ?? "")}" placeholder="e.g. A regular clean every week by the same team" /></label>
       <label>Service<input value="Regular cleaning" disabled /><input type="hidden" name="serviceKey" value="regular" /></label>
       <label>Visits per month<input name="visitsPerMonth" type="number" min="1" max="31" required value="${plan?.visitsPerMonth ?? 4}" /></label>
       <label>Monthly price (AED)<input name="priceMonthlyAed" type="number" min="1" value="${plan?.priceMonthlyAed ?? ""}" /></label>
       <label>Yearly price (AED)<input name="priceYearlyAed" type="number" min="1" value="${plan?.priceYearlyAed ?? ""}" /></label>
       <label>Order in the app<input name="sortOrder" type="number" min="0" max="999" value="${plan?.sortOrder ?? 0}" /></label>
       <label>Status<select name="active"><option value="true" ${plan?.active !== false ? "selected" : ""}>On sale</option><option value="false" ${plan?.active === false ? "selected" : ""}>Hidden</option></select></label>
     </div>
     <div class="modal-actions"><button class="btn outline" value="cancel" formnovalidate>Close</button><button class="btn primary">${plan ? "Save plan" : "Create plan"}</button></div>`,
    async (form) => {
      const num = (k) => (form.get(k) ? Number(form.get(k)) : null);
      const body = {
        name: String(form.get("name")).trim(),
        description: String(form.get("description") || "").trim() || null,
        serviceKey: form.get("serviceKey"),
        visitsPerMonth: Number(form.get("visitsPerMonth")),
        priceMonthlyAed: num("priceMonthlyAed"),
        priceYearlyAed: num("priceYearlyAed"),
        sortOrder: Number(form.get("sortOrder") || 0),
        active: form.get("active") === "true",
      };
      await api(plan ? `/admin/subscription-plans/${plan.id}` : "/admin/subscription-plans", { method: plan ? "PATCH" : "POST", body });
      toast(plan ? "Plan saved" : "Plan created and on sale in the app");
      await loadSubscriptions();
    },
  );
}

function bookSubVisit(sub) {
  modal(
    `<h2>Book included visit · ${esc(sub.reference)}</h2>
     <p class="muted">${esc(sub.customer?.fullName ?? "Customer")} · ${esc(sub.planName)} · ${sub.visitsLeft} visit(s) left until ${day(sub.currentPeriodEnd)}</p>
     <label>Date and time<input name="at" type="datetime-local" required /></label>
     <label>Notes for the team (optional)<input name="notes" maxlength="1000" /></label>
     <div class="modal-actions"><button class="btn outline" value="cancel" formnovalidate>Close</button><button class="btn primary">Book visit</button></div>`,
    async (form) => {
      const notes = String(form.get("notes") || "").trim();
      await api(`/admin/subscriptions/${sub.id}/visits`, { body: { scheduledAt: new Date(String(form.get("at"))).toISOString(), ...(notes ? { notes } : {}) } });
      toast("Visit booked. It appears on the dispatch board.");
      await loadSubscriptions();
    },
  );
}

function cancelSub(sub) {
  modal(
    `<h2>Cancel ${esc(sub.reference)}?</h2>
     <p class="muted">The customer is notified. Paid periods are not refunded automatically: refund the period's payment from its booking if needed.</p>
     <label>Reason<input name="reason" maxlength="300" placeholder="e.g. customer moved" /></label>
     <div class="modal-actions"><button class="btn outline" value="cancel" formnovalidate>Keep</button><button class="btn danger">Cancel subscription</button></div>`,
    async (form) => {
      const reason = String(form.get("reason") || "").trim();
      await api(`/admin/subscriptions/${sub.id}/cancel`, { body: reason ? { reason } : {} });
      toast("Subscription cancelled");
      await loadSubscriptions();
    },
  );
}

$("#add-plan").addEventListener("click", () => planForm(null));
$("#sub-filter").addEventListener("change", () => loadSubscriptions().catch((e) => toast(e.message)));
$("#tab-subscriptions").addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t) return;
  if (t.dataset.plan) planForm(subState.plans.find((p) => p.id === t.dataset.plan));
  if (t.dataset.subVisit) bookSubVisit(subState.subs.find((s) => s.id === t.dataset.subVisit));
  if (t.dataset.subCancel) cancelSub(subState.subs.find((s) => s.id === t.dataset.subCancel));
});

// ------------------------------------------------------------------ messages (Chat with us)

const chat = { threads: [], open: null, timer: null };
const SENDER = { customer: "Customer", bot: "Automatic answer", staff: "Xtreme team" };
const clock = (iso) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai" }).format(new Date(iso));

async function loadThreads() {
  chat.threads = await api("/admin/support/threads");
  const unread = chat.threads.reduce((n, t) => n + t.unread, 0);
  $("#msg-badge").textContent = unread;
  $("#msg-badge").classList.toggle("hidden", !unread);
  $("#chat-list").innerHTML = chat.threads.length
    ? chat.threads
        .map(
          (t) => `<button class="chat-item ${chat.open === t.customerId ? "active" : ""}" data-thread="${t.customerId}">
            <div class="row"><b>${esc(t.customer.fullName ?? t.customer.phone ?? "Customer")}</b>${t.unread ? `<em class="badge">${t.unread}</em>` : `<small class="muted">${clock(t.lastAt)}</small>`}</div>
            <div class="meta">${t.lastSender === "customer" ? "" : "You: "}${esc(t.lastMessage.slice(0, 80))}</div></button>`,
        )
        .join("")
    : `<p class="muted" style="padding:16px">No messages yet. When customers use “Chat with us” in the app, conversations appear here. Common questions get an automatic answer straight away.</p>`;
}

async function openThread(customerId) {
  chat.open = customerId;
  const t = await api(`/admin/support/threads/${customerId}`);
  $("#chat-head").innerHTML = `<b>${esc(t.customer?.fullName ?? "Customer")}</b> <a href="tel:${esc(t.customer?.phone)}">${esc(t.customer?.phone ?? "")}</a> ${t.customer?.email ? `<span class="muted">· ${esc(t.customer.email)}</span>` : ""}`;
  $("#chat-log").innerHTML = t.messages
    .map((m) => `<div class="bubble ${m.sender}"><small>${SENDER[m.sender]} · ${clock(m.createdAt)}</small><div>${esc(m.body).replace(/\n/g, "<br/>")}</div></div>`)
    .join("");
  $("#chat-log").scrollTop = $("#chat-log").scrollHeight;
  $("#chat-form").classList.remove("hidden");
  await loadThreads();
}

$("#chat-list").addEventListener("click", (e) => {
  const b = e.target.closest("[data-thread]");
  if (b) openThread(b.dataset.thread).catch((err) => toast(err.message));
});
$("#chat-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const body = $("#chat-input").value.trim();
  if (!body || !chat.open) return;
  act(async () => {
    await api(`/admin/support/threads/${chat.open}`, { body: { body } });
    $("#chat-input").value = "";
    await openThread(chat.open);
  });
});

// ------------------------------------------------------------------ promotions

const promoState = { list: [] };

async function loadPromotions() {
  const [list, services] = await Promise.all([
    api("/admin/promotions"),
    subState.services.length ? subState.services : api("/catalog/services").then((r) => r.services),
  ]);
  promoState.list = list;
  subState.services = services;
  renderPromotions();
}

function promoValue(p) {
  return p.kind === "percent" ? `${p.value}% off${p.maxDiscountAed ? ` (up to ${aed(p.maxDiscountAed)})` : ""}` : `${aed(p.value)} off`;
}

function promoStatus(p) {
  const now = Date.now();
  if (!p.active) return ["Paused", "cancelled"];
  if (p.endsAt && new Date(p.endsAt).getTime() <= now) return ["Ended", "cancelled"];
  if (p.startsAt && new Date(p.startsAt).getTime() > now) return ["Scheduled", "assigned"];
  if (p.usageLimit != null && p.usedCount >= p.usageLimit) return ["Used up", "cancelled"];
  return ["Live", "completed"];
}

function renderPromotions() {
  const name = (k) => subState.services.find((s) => s.key === k)?.name ?? k;
  $("#promos-table").innerHTML = promoState.list.length
    ? `<tr><th>Promotion</th><th>How it applies</th><th>Discount</th><th>Rules</th><th>Dates</th><th>Used</th><th>Status</th><th></th></tr>${promoState.list
        .map((p) => {
          const [label, cls] = promoStatus(p);
          const rules = [p.firstBookingOnly ? "First booking only" : null, p.minOrderAed ? `Min ${aed(p.minOrderAed)}` : null, p.serviceKeys?.length ? p.serviceKeys.map(name).join(", ") : "All services"].filter(Boolean);
          return `<tr><td><b>${esc(p.name)}</b></td>
            <td>${p.autoApply ? '<span class="pill confirmed">Automatic</span>' : ""}${p.code ? ` <code class="code">${esc(p.code)}</code>` : ""}</td>
            <td>${esc(promoValue(p))}</td><td class="meta">${esc(rules.join(" · "))}</td>
            <td class="meta">${p.startsAt || p.endsAt ? `${day(p.startsAt)} → ${p.endsAt ? day(p.endsAt) : "no end"}` : "Always"}</td>
            <td>${p.usedCount}${p.usageLimit ? ` / ${p.usageLimit}` : ""}</td>
            <td><span class="pill ${cls}">${label}</span></td>
            <td class="actions-cell"><button class="btn outline small" data-promo="${p.id}">Edit</button><button class="btn ${p.active ? "danger" : "gold"} small" data-promo-toggle="${p.id}">${p.active ? "Pause" : "Resume"}</button></td></tr>`;
        })
        .join("")}`
    : `<tr><td class="empty">No promotions yet. Start with <b>+ First-booking offer</b>: it applies automatically to every new customer's first payment.</td></tr>`;
}

const dateInput = (iso) => (iso ? new Date(new Date(iso).getTime() + 4 * 3_600_000).toISOString().slice(0, 16) : "");
const fromDateInput = (v) => (v ? new Date(`${v}:00+04:00`).toISOString() : null);

function promoForm(p, preset = {}) {
  const v = { name: "", code: "", kind: "percent", value: 10, autoApply: false, firstBookingOnly: false, active: true, serviceKeys: [], ...preset, ...(p ?? {}) };
  const services = subState.services
    .map((s) => `<label class="check"><input type="checkbox" name="svc" value="${esc(s.key)}" ${v.serviceKeys?.includes(s.key) ? "checked" : ""}/> ${esc(s.name)}</label>`)
    .join("");
  modal(
    `<h2>${p ? "Edit promotion" : "New promotion"}</h2>
     <p class="muted">Each booking gets the single best discount it qualifies for. Discounts come off the online payment and show on the tax invoice.</p>
     <div class="form-grid">
       <label class="full">Name (shown to customers)<input name="name" required minlength="2" maxlength="80" value="${esc(v.name)}" placeholder="e.g. 20% off your first booking" /></label>
       <label>Type<select name="kind"><option value="percent" ${v.kind === "percent" ? "selected" : ""}>Percentage off</option><option value="fixed" ${v.kind === "fixed" ? "selected" : ""}>Fixed AED off</option></select></label>
       <label>Value (% or AED)<input name="value" type="number" min="1" max="100000" required value="${v.value}" /></label>
       <label>Applies<select name="autoApply"><option value="true" ${v.autoApply ? "selected" : ""}>Automatically</option><option value="false" ${!v.autoApply ? "selected" : ""}>Only with the code</option></select></label>
       <label>Promo code (optional for automatic)<input name="code" maxlength="24" pattern="[A-Za-z0-9_\-]{3,24}" value="${esc(v.code ?? "")}" placeholder="e.g. WELCOME20" /></label>
       <label>Who<select name="firstBookingOnly"><option value="true" ${v.firstBookingOnly ? "selected" : ""}>First booking only</option><option value="false" ${!v.firstBookingOnly ? "selected" : ""}>Any booking</option></select></label>
       <label>Max discount AED (optional)<input name="maxDiscountAed" type="number" min="1" value="${v.maxDiscountAed ?? ""}" /></label>
       <label>Min order AED (optional)<input name="minOrderAed" type="number" min="1" value="${v.minOrderAed ?? ""}" /></label>
       <label>Total uses (optional)<input name="usageLimit" type="number" min="1" value="${v.usageLimit ?? ""}" /></label>
       <label>Starts (optional)<input name="startsAt" type="datetime-local" value="${dateInput(v.startsAt)}" /></label>
       <label>Ends (optional)<input name="endsAt" type="datetime-local" value="${dateInput(v.endsAt)}" /></label>
       <label>Status<select name="active"><option value="true" ${v.active ? "selected" : ""}>Live</option><option value="false" ${!v.active ? "selected" : ""}>Paused</option></select></label>
       <fieldset class="full services"><legend>Services (none ticked = all services)</legend>${services}</fieldset>
     </div>
     <div class="modal-actions"><button class="btn outline" value="cancel" formnovalidate>Close</button><button class="btn primary">${p ? "Save" : "Create promotion"}</button></div>`,
    async (form) => {
      const num = (k) => (form.get(k) ? Number(form.get(k)) : null);
      const body = {
        name: String(form.get("name")).trim(),
        code: String(form.get("code") || "").trim() || null,
        kind: form.get("kind"),
        value: Number(form.get("value")),
        autoApply: form.get("autoApply") === "true",
        firstBookingOnly: form.get("firstBookingOnly") === "true",
        maxDiscountAed: num("maxDiscountAed"),
        minOrderAed: num("minOrderAed"),
        usageLimit: num("usageLimit"),
        startsAt: fromDateInput(form.get("startsAt")),
        endsAt: fromDateInput(form.get("endsAt")),
        serviceKeys: form.getAll("svc"),
        active: form.get("active") === "true",
      };
      if (body.active) await sure({ title: p ? "Save this promotion?" : "Start this promotion?", message: "It applies to customers' checkouts straight away.", confirm: p ? "Save" : "Start" });
      await api(p ? `/admin/promotions/${p.id}` : "/admin/promotions", { method: p ? "PATCH" : "POST", body });
      toast(p ? "Promotion saved" : "Promotion created. It applies in the app straight away.");
      await loadPromotions();
    },
  );
}

$("#add-promo").addEventListener("click", () => promoForm(null));
$("#add-first-promo").addEventListener("click", () =>
  promoForm(null, { name: "Welcome: 15% off your first booking", kind: "percent", value: 15, autoApply: true, firstBookingOnly: true, maxDiscountAed: 150 }),
);
$("#tab-promotions").addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t) return;
  if (t.dataset.promo) promoForm(promoState.list.find((p) => p.id === t.dataset.promo));
  if (t.dataset.promoToggle) {
    const p = promoState.list.find((x) => x.id === t.dataset.promoToggle);
    act(async () => {
      await sure(p.active ? { title: "Pause this promotion?", message: "Customers can no longer use it until you resume it.", confirm: "Pause" } : { title: "Resume this promotion?", message: "It applies to checkouts straight away.", confirm: "Resume" });
      await api(`/admin/promotions/${p.id}`, { method: "PATCH", body: { active: !p.active } });
      await loadPromotions();
    }, p.active ? "Promotion paused" : "Promotion live again");
  }
});

// ------------------------------------------------------------------ map

let map = null;
const markers = new Map();
function renderMap() {
  if (!map || $("#tab-map").classList.contains("hidden")) return;
  const seen = new Set();
  for (const s of state.staff) {
    if (!s.location || s.status === "off_duty") continue;
    seen.add(s.id);
    placeStaff(s.id, s.displayName, s.status, s.location.lat, s.location.lng);
  }
  for (const [id, m] of markers) if (id.startsWith("s:") && !seen.has(id.slice(2))) (map.removeLayer(m), markers.delete(id));
  for (const b of state.bookings.filter((x) => ["assigned", "en_route", "arrived", "in_progress"].includes(x.status))) {
    const key = `b:${b.id}`;
    if (!markers.has(key)) markers.set(key, L.marker([b.address.lat, b.address.lng], { title: b.reference }).addTo(map).bindPopup(`<b>${esc(b.reference)}</b><br>${esc(b.service.name)}<br>${LABEL[b.status]}`));
  }
  $("#map-list").innerHTML = state.staff
    .filter((s) => s.status !== "off_duty")
    .map((s) => `<div class="card"><div class="row"><b>${esc(s.displayName)}</b><span class="pill" style="background:${STAFF_COLOR[s.status]}22;color:${STAFF_COLOR[s.status]}">${STAFF_LABEL[s.status]}</span></div><div class="meta">${s.currentBooking ? `On ${esc(s.currentBooking.reference)}` : esc(s.teamName ?? "")}${s.location ? ` · seen ${when(s.location.at)}` : " · no location yet"}</div></div>`)
    .join("") || '<p class="muted">No staff on duty.</p>';
}
function placeStaff(id, name, status, lat, lng) {
  const key = `s:${id}`;
  const initials = name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  const icon = L.divIcon({ className: "", html: `<div class="staff-pin" style="background:${STAFF_COLOR[status] ?? "#16130E"}">${esc(initials)}</div>`, iconSize: [30, 30] });
  const m = markers.get(key);
  if (m) m.setLatLng([lat, lng]).setIcon(icon);
  else markers.set(key, L.marker([lat, lng], { icon, title: name }).addTo(map).bindPopup(`<b>${esc(name)}</b><br>${STAFF_LABEL[status] ?? status}`));
}

// ------------------------------------------------------------------ prices

const TYPE_LABEL = { apartment: "Apartment", villa: "Villa", office: "Office", restaurant: "Restaurant" };
let pricingData = null;

async function loadPricing() {
  pricingData = await api("/admin/pricing");
  $("#tamara-fee").value = pricingData.tamaraFeePercent;
  $("#card-fee").value = pricingData.cardFeePercent ?? 0;
  $("#service-fee").value = pricingData.serviceFeeAed ?? 0;
  $("#weekly-discount").value = pricingData.frequencyDiscountPercent?.weekly ?? 0;
  $("#biweekly-discount").value = pricingData.frequencyDiscountPercent?.biweekly ?? 0;
  $("#pricing-services").innerHTML = pricingData.services
    .map((svc) => {
      const fixed = Object.values(pricingData.rates[svc.key] ?? {}).reduce((n, bySize) => n + Object.keys(bySize).length, 0);
      const rows = svc.propertyTypes
        .flatMap((type) =>
          (pricingData.sizes[type] ?? []).map((size) => {
            const r = pricingData.rates[svc.key]?.[type]?.[size.key];
            const f = (name, val, ph) => `<input type="number" min="0" data-svc="${svc.key}" data-type="${type}" data-size="${size.key}" data-f="${name}" value="${val ?? ""}" placeholder="${ph}" />`;
            return `<tr><td>${TYPE_LABEL[type] ?? type}</td><td>${esc(size.label)}</td>
              <td>${f("priceAed", r?.priceAed, "On quote")}</td><td>${f("minutes", r?.minutes, "e.g. 90")}</td><td>${f("cleaners", r?.cleaners, "e.g. 2")}</td></tr>`;
          }),
        )
        .join("");
      return `<details class="price-svc" ${fixed ? "open" : ""}><summary><b>${esc(svc.name)}</b><span class="muted">${fixed ? `${fixed} fixed price${fixed > 1 ? "s" : ""}` : "All on quote (free site visit)"}</span></summary>
        <table class="table price-table"><tr><th>Property</th><th>Size</th><th>Price (AED, incl. VAT)</th><th>Time on site (min)</th><th>Cleaners</th></tr>${rows}</table></details>`;
    })
    .join("");
}

$("#save-pricing").addEventListener("click", async () => {
  const rates = {};
  const cells = {};
  document.querySelectorAll("#pricing-services input").forEach((i) => {
    const k = `${i.dataset.svc}|${i.dataset.type}|${i.dataset.size}`;
    (cells[k] ??= {})[i.dataset.f] = i.value.trim();
  });
  for (const [k, v] of Object.entries(cells)) {
    if (!v.priceAed) continue; // blank price: quoted on site
    const [svc, type, size] = k.split("|");
    if (!v.minutes || !v.cleaners) return toast(`Add the time on site and number of cleaners for every fixed price (${svc}, ${type} ${size})`);
    ((rates[svc] ??= {})[type] ??= {})[size] = { priceAed: Number(v.priceAed), minutes: Number(v.minutes), cleaners: Number(v.cleaners) };
  }
  const n = (sel) => Number($(sel).value || 0);
  const body = {
    rates,
    tamaraFeePercent: n("#tamara-fee"),
    cardFeePercent: n("#card-fee"),
    serviceFeeAed: n("#service-fee"),
    frequencyDiscountPercent: { weekly: n("#weekly-discount"), biweekly: n("#biweekly-discount") },
  };
  try {
    await sure({ title: "Save the new prices?", message: "New bookings and payments use them straight away. Bookings already made keep their price.", confirm: "Save prices" });
    await api("/admin/pricing", { method: "PUT", body });
    toast("Prices saved. New bookings use them now.");
    await loadPricing();
  } catch (e) {
    toast(e.message);
  }
});

// ------------------------------------------------------------------ tabs, realtime, start

const PAGE_SUB = {
  board: "Live jobs, teams and payments",
  map: "Where every team is right now",
  subscriptions: "Monthly and yearly cleaning contracts",
  pricing: "Fixed prices, site-visit quotes and the Tamara fee",
  promotions: "First-booking offers and promo codes",
  messages: "Customer chats: automatic answers and your replies",
  staff: "Team members, sign-in and alerts",
  customers: "Customer accounts",
  payments: "Card and Tamara payments and refunds",
  admin: "Access, company details and connected services",
};

document.querySelectorAll(".tab").forEach((t) =>
  t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === t));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("hidden", p.id !== `tab-${t.dataset.tab}`));
    $("#page-title").textContent = t.querySelector("span").nextSibling.textContent.trim();
    $("#page-sub").textContent = PAGE_SUB[t.dataset.tab] ?? "";
    $("#kpis").classList.toggle("hidden", t.dataset.tab !== "board");
    if (t.dataset.tab === "customers") loadCustomers().catch((e) => toast(e.message));
    if (t.dataset.tab === "subscriptions") loadSubscriptions().catch((e) => toast(e.message));
    if (t.dataset.tab === "pricing") loadPricing().catch((e) => toast(e.message));
    if (t.dataset.tab === "promotions") loadPromotions().catch((e) => toast(e.message));
    if (t.dataset.tab === "messages") loadThreads().catch((e) => toast(e.message));
    if (t.dataset.tab === "admin") loadAdminTab().catch((e) => toast(e.message));
    if (t.dataset.tab === "map") {
      if (!map) {
        map = L.map("map").setView([24.4539, 54.3773], 11);
        L.tileLayer("/v1/tiles/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap contributors" }).addTo(map);
      }
      setTimeout(() => (map.invalidateSize(), renderMap()), 50);
    }
  }),
);
$("#search").addEventListener("input", renderBoard);
$("#day").addEventListener("change", loadAll);

function connectRealtime() {
  if (!window.io) return;
  const socket = io({ path: "/realtime", transports: ["websocket"], auth: (cb) => cb({ token: session?.accessToken }) });
  let pending = null;
  const reloadSoon = () => {
    clearTimeout(pending);
    pending = setTimeout(() => loadAll().catch(() => {}), 600);
  };
  socket.on("connect", () => $("#live-dot").classList.add("on"));
  socket.on("disconnect", () => $("#live-dot").classList.remove("on"));
  socket.on("connect_error", async () => {
    await refresh().catch(() => {});
  });
  socket.on("booking:created", () => {
    toast("New booking received");
    reloadSoon();
  });
  socket.on("booking:status", reloadSoon);
  socket.on("support:message", (p) => {
    toast("New customer message");
    loadThreads().catch(() => {});
    if (chat.open && p?.customerId === chat.open) openThread(chat.open).catch(() => {});
  });
  socket.on("staff:status", reloadSoon);
  socket.on("staff:location", (p) => {
    const s = state.staff.find((x) => x.id === p.staffId);
    if (s) s.location = { lat: p.lat, lng: p.lng, at: p.at };
    if (map) placeStaff(p.staffId, s?.displayName ?? "Staff", p.status ?? s?.status, p.lat, p.lng);
  });
}

async function start() {
  $("#login").classList.add("hidden");
  $("#app").classList.remove("hidden");
  $("#me-name").textContent = session.user.fullName ?? session.user.phone;
  await loadAll().catch((e) => toast(e.message));
  connectRealtime();
  loadThreads().catch(() => {});
  setInterval(() => loadAll().catch(() => {}), 60_000);
}

if (session) start();
else $("#login").classList.remove("hidden");
