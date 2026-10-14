// Xtreme Dispatch: office dashboard for the Xtreme-Home Partner API.
// Plain ES modules, no build step. Every action goes through the admin API, which
// enforces the admin role on the server.

const $ = (sel) => document.querySelector(sel);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const aed = (n) => (n == null ? "Survey" : `AED ${Number(n).toLocaleString("en-US")}`);
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
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("show"), 2600);
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
    [`${d.awaitingConfirmation}`, "Waiting for confirmation", d.awaitingConfirmation > 0],
    [`${today}`, "Jobs scheduled today"],
    [`${(d.today.en_route ?? 0) + (d.today.arrived ?? 0) + (d.today.in_progress ?? 0)}`, "Jobs live now"],
    [`${d.staff.available} / ${d.staff.onDuty}`, "Teams available / on duty"],
    [aed(d.collectedTodayAed), "Collected today"],
  ]
    .map(([v, l, alert]) => `<div class="kpi ${alert ? "alert" : ""}"><b>${esc(v)}</b><span>${esc(l)}</span></div>`)
    .join("");
}

const COLUMNS = [
  ["New requests", ["requested"]],
  ["Confirmed · needs team", ["confirmed"]],
  ["Team assigned", ["assigned"]],
  ["Live now", ["en_route", "arrived", "in_progress"]],
  ["Completed", ["completed"]],
];

function renderBoard() {
  const term = $("#search").value.trim().toLowerCase();
  const match = (b) =>
    !term || [b.reference, b.customer?.fullName, b.customer?.phone, b.address.area, b.service.name].join(" ").toLowerCase().includes(term);
  $("#board").innerHTML = COLUMNS.map(([title, statuses]) => {
    const items = state.bookings.filter((b) => statuses.includes(b.status) && match(b));
    return `<div class="col"><h3>${esc(title)} <em>${items.length}</em></h3>${items.map(card).join("") || '<p class="muted" style="margin:6px">Nothing here</p>'}</div>`;
  }).join("");
}

function card(b) {
  const team = b.team.map((m) => esc(m.displayName) + (m.isLead ? " ★" : "")).join(", ");
  const actions = [];
  if (b.status === "requested") actions.push(`<button class="btn primary small" data-act="confirm" data-id="${b.id}">Confirm</button>`);
  if (["requested", "confirmed", "assigned"].includes(b.status)) actions.push(`<button class="btn gold small" data-act="assign" data-id="${b.id}">${b.team.length ? "Reassign" : "Assign team"}</button>`);
  if (b.pricing === "inspection" && b.paymentStatus === "unpaid" && b.status !== "completed") actions.push(`<button class="btn outline small" data-act="price" data-id="${b.id}">Set price</button>`);
  if (b.status !== "completed") actions.push(`<button class="btn danger small" data-act="cancel" data-id="${b.id}">Cancel</button>`);
  if (b.paymentStatus === "paid" || b.paymentStatus === "partially_refunded") actions.push(`<button class="btn outline small" data-act="refund" data-id="${b.id}">Refund</button>`);
  return `<div class="card">
    <div class="row"><span class="title">${esc(b.service.name)}</span><span class="pill ${b.status}">${LABEL[b.status]}</span></div>
    <div class="meta">${esc(b.reference)} · ${when(b.scheduledAt)}</div>
    <div class="meta">👤 ${esc(b.customer?.fullName ?? "Customer")} · <a href="tel:${esc(b.customer?.phone)}">${esc(b.customer?.phone ?? "")}</a></div>
    <div class="meta">📍 ${esc([b.address.unit, b.address.building, b.address.area].filter(Boolean).join(", "))}</div>
    <div class="row"><span class="meta">${esc(b.property.type)} · ${esc(b.property.size)}</span><b>${aed(b.priceAed)}</b></div>
    <div class="row"><span class="pill ${b.paymentStatus}">${esc(b.paymentStatus.replace("_", " "))} · ${esc(b.paymentMethod.replace("_", " "))}</span></div>
    ${team ? `<div class="meta">🧑‍🔧 ${team}</div>` : ""}
    ${b.notes ? `<div class="meta">📝 ${esc(b.notes)}</div>` : ""}
    <div class="actions">${actions.join("")}</div>
  </div>`;
}

$("#board").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const b = state.bookings.find((x) => x.id === btn.dataset.id);
  ({ confirm: confirmBooking, assign: assignTeam, price: setPrice, cancel: cancelBooking, refund: refundBooking })[btn.dataset.act](b);
});

const confirmBooking = (b) => act(() => api(`/admin/bookings/${b.id}/confirm`, { body: {} }), `${b.reference} confirmed`);

function modal(html, onSubmit) {
  const dlg = $("#modal");
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
    `<h2>Set price · ${esc(b.reference)}</h2>
     <p class="muted">${esc(b.service.name)} after survey. The customer is notified and can pay in the app.</p>
     <label>Price (AED, VAT included)<input name="price" type="number" min="1" required /></label>
     <div class="modal-actions"><button class="btn outline" value="cancel" formnovalidate>Close</button><button class="btn primary">Save price</button></div>`,
    async (form) => {
      await api(`/admin/bookings/${b.id}/price`, { body: { priceAed: Number(form.get("price")) } });
      toast("Price sent to customer");
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
      await api(`/admin/payments/${p.id}/refund`, { body: { amountAed: Number(form.get("amount")), reason: form.get("reason") } });
      toast("Refund issued");
    },
  );
}

// ------------------------------------------------------------------ staff

function renderStaff() {
  $("#staff-table").innerHTML = `<tr><th>Name</th><th>Code</th><th>Phone</th><th>Team</th><th>Status</th><th>Current job</th><th>Last seen</th><th></th></tr>${state.staff
    .map(
      (s) => `<tr>
      <td><b>${esc(s.displayName)}</b></td><td>${esc(s.employeeCode)}</td><td>${esc(s.phone ?? "")}</td><td>${esc(s.teamName ?? "")}</td>
      <td><span class="pill" style="background:${STAFF_COLOR[s.status]}22;color:${STAFF_COLOR[s.status]}">${STAFF_LABEL[s.status]}</span>${s.active ? "" : ' <span class="pill cancelled">inactive</span>'}</td>
      <td>${s.currentBooking ? esc(s.currentBooking.reference) : "—"}</td>
      <td>${s.location ? when(s.location.at) : "—"}</td>
      <td><button class="btn outline small" data-staff="${s.id}" data-active="${s.active}">${s.active ? "Deactivate" : "Activate"}</button></td></tr>`,
    )
    .join("")}`;
}
$("#staff-table").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-staff]");
  if (!btn) return;
  const active = btn.dataset.active !== "true";
  act(() => api(`/admin/staff/${btn.dataset.staff}`, { method: "PATCH", body: { active } }), active ? "Staff activated" : "Staff deactivated");
});
$("#add-staff").addEventListener("click", () =>
  modal(
    `<h2>Add staff member</h2>
     <p class="muted">They sign in to the Xtreme-Home Partner app with this mobile number and see the staff screens.</p>
     <label>Full name<input name="name" required minlength="2" /></label>
     <label>Mobile number<input name="phone" required placeholder="050 123 4567" /></label>
     <label>Employee code<input name="code" required /></label>
     <label>Team<input name="team" placeholder="e.g. Gold Team" /></label>
     <label>Skills (service keys, comma-separated; empty = all)<input name="skills" placeholder="regular, deep, move" /></label>
     <div class="modal-actions"><button class="btn outline" value="cancel" formnovalidate>Close</button><button class="btn primary">Add</button></div>`,
    async (form) => {
      await api("/admin/staff", {
        body: {
          displayName: form.get("name"),
          phone: form.get("phone"),
          employeeCode: form.get("code"),
          teamName: form.get("team") || undefined,
          skills: String(form.get("skills") || "").split(",").map((x) => x.trim()).filter(Boolean),
        },
      });
      toast("Staff member added");
    },
  ),
);

// ------------------------------------------------------------------ payments

function renderPayments() {
  $("#payments-table").innerHTML = `<tr><th>When</th><th>Booking</th><th>Method</th><th>Amount</th><th>Refunded</th><th>Status</th></tr>${state.payments
    .map(
      (p) => `<tr><td>${when(p.createdAt)}</td><td>${esc(p.bookingReference)}</td><td>${esc(p.method)}${p.instalments ? ` · ${p.instalments}x` : ""}</td>
      <td>${aed(p.amountAed)}</td><td>${p.refundedAed ? aed(p.refundedAed) : "—"}</td><td><span class="pill ${p.status}">${esc(p.status.replace("_", " "))}</span></td></tr>`,
    )
    .join("")}`;
}

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

// ------------------------------------------------------------------ tabs, realtime, start

document.querySelectorAll(".tab").forEach((t) =>
  t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === t));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("hidden", p.id !== `tab-${t.dataset.tab}`));
    if (t.dataset.tab === "map") {
      if (!map) {
        map = L.map("map").setView([24.4539, 54.3773], 11);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(map);
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
  setInterval(() => loadAll().catch(() => {}), 60_000);
}

if (session) start();
else $("#login").classList.remove("hidden");
