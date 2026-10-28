import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Env } from "../../config/env.js";

// Tiles are served only around the UAE, so this cannot be used as an open map proxy.
const BOUNDS = { north: 26.5, south: 22.5, west: 51, east: 56.5 };
const MIN_ZOOM = 3;
const MAX_ZOOM = 18;
const CACHE_LIMIT = 1500; // ~30 MB of PNGs
const USER_AGENT = "XtremeCleaningPartner/1.0 (+https://www.xtreme-fmgroup.com; sales@xtreme-fmgroup.com)";

type Tile = { body: Buffer; type: string };
const cache = new Map<string, Tile>();
const inflight = new Map<string, Promise<Tile | null>>();

const tileX = (lng: number, z: number) => Math.floor(((lng + 180) / 360) * 2 ** z);
const tileY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

export function tileAllowed(z: number, x: number, y: number) {
  if (z < MIN_ZOOM || z > MAX_ZOOM) return false;
  return x >= tileX(BOUNDS.west, z) && x <= tileX(BOUNDS.east, z) && y >= tileY(BOUNDS.north, z) && y <= tileY(BOUNDS.south, z);
}

async function fetchTile(env: Env, key: string, url: string): Promise<Tile | null> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Referer: env.PUBLIC_URL }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return null;
  const tile = { body: Buffer.from(await res.arrayBuffer()), type: res.headers.get("content-type") ?? "image/png" };
  cache.set(key, tile);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  return tile;
}

/** Map tiles for the app's OpenStreetMap view, fetched once from the provider and cached. */
export async function tileRoutes(app: FastifyInstance, env: Env) {
  app.get(
    "/tiles/:z/:x/:y.png",
    {
      config: { rateLimit: { max: 1500, timeWindow: "1 minute" } },
      schema: { params: z.object({ z: z.coerce.number().int(), x: z.coerce.number().int(), y: z.coerce.number().int() }) },
    },
    async (req, reply) => {
      const { z: zoom, x, y } = req.params as { z: number; x: number; y: number };
      if (!tileAllowed(zoom, x, y)) return reply.status(404).send();
      const key = `${zoom}/${x}/${y}`;
      let tile = cache.get(key);
      if (tile) {
        // Recently used tiles move to the back of the eviction queue.
        cache.delete(key);
        cache.set(key, tile);
      } else {
        const url = env.MAP_TILE_URL.replace("{z}", String(zoom)).replace("{x}", String(x)).replace("{y}", String(y));
        let pending = inflight.get(key);
        if (!pending) {
          pending = fetchTile(env, key, url).catch(() => null).finally(() => inflight.delete(key));
          inflight.set(key, pending);
        }
        tile = (await pending) ?? undefined;
      }
      if (!tile) return reply.status(502).header("cache-control", "no-store").send();
      return reply.header("content-type", tile.type).header("cache-control", "public, max-age=604800").send(tile.body);
    },
  );
}
