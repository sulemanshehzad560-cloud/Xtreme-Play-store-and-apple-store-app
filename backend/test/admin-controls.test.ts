import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, nextPhone, resetDb, signInAs, signInPhone, type TestContext } from "./helpers.js";

let t: TestContext;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.app.close());
beforeEach(resetDb);

const req = (method: string, url: string, auth: Record<string, string>, payload?: unknown) =>
  t.app.inject({ method: method as "GET", url, headers: auth, ...(payload !== undefined ? { payload: payload as object } : {}) });

describe("staff records", () => {
  it("stores full HR details, edits them and keeps an audit trail", async () => {
    const admin = await signInAs(t, "admin");
    const created = await req("POST", "/v1/admin/staff", admin.auth, {
      phone: "050 222 3344",
      displayName: "Fatima Noor",
      employeeCode: "X-201",
      teamName: "Silver Team",
      jobTitle: "Senior cleaner",
      email: "fatima@xtreme-fm.com",
      emergencyContactName: "Omar Noor",
      emergencyContactPhone: "050 999 8877",
      joinedOn: "2025-03-01",
      notes: "Prefers morning shifts",
      skills: ["deep", "move"],
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      displayName: "Fatima Noor",
      phone: "+971502223344",
      jobTitle: "Senior cleaner",
      emergencyContactPhone: "+971509998877",
      joinedOn: "2025-03-01",
      skills: ["deep", "move"],
    });
    const id = created.json().id;

    const dupe = await req("POST", "/v1/admin/staff", admin.auth, { phone: nextPhone(), displayName: "Someone", employeeCode: "X-201" });
    expect(dupe.json().error.code).toBe("employee_code_in_use");

    const edited = await req("PATCH", `/v1/admin/staff/${id}`, admin.auth, { teamName: "Gold Team", notes: null });
    expect(edited.json()).toMatchObject({ teamName: "Gold Team", notes: null });

    const log = (await req("GET", `/v1/admin/audit?targetType=staff&targetId=${id}`, admin.auth)).json();
    expect(log.map((l: { action: string }) => l.action)).toEqual(["staff.updated", "staff.created"]);
    expect(log[0].details.teamName).toEqual({ from: "Silver Team", to: "Gold Team" });
    expect(log[0].actor.id).toBe(admin.user.id);
  });

  it("changes a staff member's sign-in number and ends their old sessions", async () => {
    const admin = await signInAs(t, "admin");
    const staff = await signInAs(t, "staff", "Ahmed");
    const newPhone = nextPhone();
    const res = await req("PATCH", `/v1/admin/staff/${staff.user.id}`, admin.auth, { phone: newPhone });
    expect(res.json(), res.body).toMatchObject({ phone: newPhone });
    expect((await req("POST", "/v1/auth/refresh", {}, { refreshToken: staff.refreshToken })).statusCode).toBe(401);
    // The new number signs in to the same staff account.
    const again = await signInPhone(t, newPhone);
    expect(again.user).toMatchObject({ id: staff.user.id, role: "staff" });
  });

  it("exports the staff directory as CSV, safe for Excel", async () => {
    const admin = await signInAs(t, "admin");
    await req("POST", "/v1/admin/staff", admin.auth, { phone: nextPhone(), displayName: "=HYPERLINK(1)", employeeCode: "X-9", skills: [] });
    const csv = await req("GET", "/v1/admin/staff.csv", admin.auth);
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.body).toContain('"\'=HYPERLINK(1)"');
  });
});

describe("admin access", () => {
  it("adds and removes admins with guards", async () => {
    const admin = await signInAs(t, "admin", "IT Manager");
    const phone = nextPhone();
    const added = await req("POST", "/v1/admin/admins", admin.auth, { phone, fullName: "Office Lead" });
    expect(added.statusCode).toBe(201);
    expect((await req("GET", "/v1/admin/admins", admin.auth)).json()).toHaveLength(2);

    const second = await signInPhone(t, phone);
    expect(second.user.role).toBe("admin");

    expect((await req("DELETE", `/v1/admin/admins/${admin.user.id}`, admin.auth)).json().error.code).toBe("cannot_remove_self");
    expect((await req("DELETE", `/v1/admin/admins/${second.user.id}`, admin.auth)).statusCode).toBe(204);
    // Their dashboard session ends immediately.
    expect((await req("GET", "/v1/admin/dashboard", second.auth)).statusCode).toBe(403);
    expect((await req("DELETE", `/v1/admin/admins/${admin.user.id}`, admin.auth)).statusCode).toBe(400);
  });

  it("keeps everyone else out of admin controls", async () => {
    const customer = await signInPhone(t);
    const staff = await signInAs(t, "staff");
    for (const who of [customer, staff]) {
      expect((await req("GET", "/v1/admin/system", who.auth)).statusCode).toBe(403);
      expect((await req("POST", "/v1/admin/admins", who.auth, { phone: nextPhone(), fullName: "Hacker" })).statusCode).toBe(403);
    }
  });
});

describe("company settings and system status", () => {
  it("lets admins change the contacts the app shows", async () => {
    const admin = await signInAs(t, "admin");
    expect((await t.app.inject({ method: "GET", url: "/v1/company" })).json().email).toBe("sales@xtreme-fm.com");
    const bad = await req("PUT", "/v1/admin/settings/company", admin.auth, { whatsapp: "https://evil.example" });
    expect(bad.statusCode).toBe(400);
    await req("PUT", "/v1/admin/settings/company", admin.auth, { email: "hello@xtreme-fm.com", phoneDisplay: "+971 50 000 0000" });
    const company = (await t.app.inject({ method: "GET", url: "/v1/company" })).json();
    expect(company).toMatchObject({ email: "hello@xtreme-fm.com", phoneDisplay: "+971 50 000 0000", name: "Xtreme Facilities Management" });
    const log = (await req("GET", "/v1/admin/audit?targetType=settings", admin.auth)).json();
    expect(log[0].details.email).toEqual({ from: "sales@xtreme-fm.com", to: "hello@xtreme-fm.com" });
  });

  it("reports connected services and health", async () => {
    const admin = await signInAs(t, "admin");
    const sys = (await req("GET", "/v1/admin/system", admin.auth)).json();
    expect(sys.health.database.ok).toBe(true);
    expect(sys.integrations.find((i: { key: string }) => i.key === "sms")).toMatchObject({ connected: false });
  });

  it("finds customers by name or phone", async () => {
    const admin = await signInAs(t, "admin");
    const c1 = await signInPhone(t, nextPhone(), "Layla Hassan");
    await signInPhone(t, nextPhone(), "Someone Else");
    const found = (await req("GET", "/v1/admin/customers?q=layla", admin.auth)).json();
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ id: c1.user.id, bookings: 0 });
  });
});

describe("audit noise", () => {
  it("does not log a skills change when only the order differs", async () => {
    const admin = await signInAs(t, "admin");
    const staff = await signInAs(t, "staff");
    await req("PATCH", `/v1/admin/staff/${staff.user.id}`, admin.auth, { skills: ["deep", "regular"] });
    await req("PATCH", `/v1/admin/staff/${staff.user.id}`, admin.auth, { skills: ["regular", "deep"] });
    const log = (await req("GET", `/v1/admin/audit?targetType=staff&targetId=${staff.user.id}`, admin.auth)).json();
    expect(log.filter((l: { action: string }) => l.action === "staff.updated")).toHaveLength(1);
  });
});
