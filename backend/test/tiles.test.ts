import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestApp, type TestContext } from "./helpers.js";
import { tileAllowed } from "../src/modules/maps/tiles.routes.js";

let t: TestContext;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => {
  vi.unstubAllGlobals();
  return t.app.close();
});

describe("map tiles", () => {
  it("serves UAE tiles from the provider once, then from cache, and refuses tiles elsewhere", async () => {
    const png = Buffer.from("89504e470d0a1a0a", "hex");
    const fetchMock = vi.fn(async () => new Response(png, { headers: { "content-type": "image/png" } }));
    vi.stubGlobal("fetch", fetchMock);

    // Abu Dhabi at zoom 14.
    const first = await t.app.inject({ method: "GET", url: "/v1/tiles/14/10650/7085.png" });
    expect(first.statusCode).toBe(200);
    expect(first.headers["content-type"]).toBe("image/png");
    expect(first.headers["cache-control"]).toContain("max-age");
    expect(first.rawPayload.equals(png)).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://tile.openstreetmap.org/14/10650/7085.png");
    expect((init.headers as Record<string, string>)["User-Agent"]).toMatch(/^XtremeCleaningPartner\//);

    expect((await t.app.inject({ method: "GET", url: "/v1/tiles/14/10650/7085.png" })).statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // London is outside the served area.
    expect((await t.app.inject({ method: "GET", url: "/v1/tiles/14/8186/5448.png" })).statusCode).toBe(404);
    expect(tileAllowed(19, 0, 0)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports a provider failure without caching it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("blocked", { status: 403 })));
    const res = await t.app.inject({ method: "GET", url: "/v1/tiles/13/5325/3542.png" });
    expect(res.statusCode).toBe(502);
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});
