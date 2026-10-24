import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { inServiceZone } from "../src/config/service-zone.js";
import { ADDRESS, createTestApp, resetDb, signInPhone, slot, type TestContext } from "./helpers.js";

const INSIDE: [string, number, number][] = [
  ["Al Reem Island", 24.4958, 54.4035],
  ["Al Maryah Island", 24.5005, 54.3895],
  ["Corniche", 24.4672, 54.3328],
  ["Al Bateen", 24.452, 54.333],
  ["Hudayriat Island", 24.437, 54.307],
  ["Al Mushrif", 24.437, 54.391],
  ["Saadiyat Island", 24.542, 54.433],
  ["Al Jubail Island", 24.53, 54.48],
  ["Yas Island", 24.4968, 54.6046],
  ["Al Raha Beach", 24.4497, 54.6036],
  ["Khalifa City", 24.4196, 54.5763],
  ["Masdar City", 24.4269, 54.6176],
  ["Al Reef", 24.459, 54.6773],
  ["Al Shamkha", 24.386, 54.712],
  ["Shakhbout City", 24.365, 54.628],
  ["Mohammed Bin Zayed City", 24.3364, 54.5418],
  ["Mussafah", 24.354, 54.495],
  ["Baniyas", 24.302, 54.637],
];
const OUTSIDE: [string, number, number][] = [
  ["Al Ain", 24.2075, 55.7447],
  ["Dubai Marina", 25.08, 55.14],
  ["Ghantoot", 24.86, 54.83],
  ["Al Ghadeer", 24.83, 55.03],
  ["Ruwais", 24.11, 52.73],
  ["Al Wathba camel track", 24.17, 54.73],
];

describe("service zone", () => {
  it.each(INSIDE)("serves %s", (_name, lat, lng) => expect(inServiceZone({ lat, lng })).toBe(true));
  it.each(OUTSIDE)("does not serve %s", (_name, lat, lng) => expect(inServiceZone({ lat, lng })).toBe(false));
});

describe("service zone in the API", () => {
  let t: TestContext;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.app.close());
  beforeEach(() => resetDb());

  const alAin = { ...ADDRESS, area: "Al Ain", lat: 24.2075, lng: 55.7447 };

  it("refuses to save or move an address outside the zone", async () => {
    const { auth } = await signInPhone(t);
    const bad = await t.app.inject({ method: "POST", url: "/v1/me/addresses", headers: auth, payload: alAin });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe("outside_service_area");
    expect(bad.json().error.message).toContain("Abu Dhabi");

    const ok = await t.app.inject({ method: "POST", url: "/v1/me/addresses", headers: auth, payload: ADDRESS });
    expect(ok.statusCode).toBe(201);
    const moved = await t.app.inject({ method: "PATCH", url: `/v1/me/addresses/${ok.json().id}`, headers: auth, payload: { lng: 55.7447 } });
    expect(moved.json().error.code).toBe("outside_service_area");
    const renamed = await t.app.inject({ method: "PATCH", url: `/v1/me/addresses/${ok.json().id}`, headers: auth, payload: { label: "Flat" } });
    expect(renamed.statusCode).toBe(200);
  });

  it("refuses bookings outside the zone", async () => {
    const { auth } = await signInPhone(t);
    const res = await t.app.inject({
      method: "POST",
      url: "/v1/bookings",
      headers: auth,
      payload: { serviceKey: "deep", propertyType: "apartment", propertySize: "2bhk", scheduledAt: slot(), address: alAin },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("outside_service_area");
  });

  it("publishes the zone in the company details", async () => {
    const res = await t.app.inject({ method: "GET", url: "/v1/company" });
    expect(res.json().serviceZone.polygon.length).toBeGreaterThan(3);
    expect(res.json().serviceAreas).not.toContain("Al Ain");
  });
});
