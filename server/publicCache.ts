import type { RequestHandler, Response } from "express";
// Only attach to explicitly public, read-only JSON routes. Never owner/session routes.
export function publicJsonCache(ttlMs = 10000): RequestHandler {
  const entries = new Map<
    string,
    { body: any; expires: number; waiting: Response[]; loading: boolean }
  >();
  return (q, r, next) => {
    const key = q.originalUrl;
    let entry = entries.get(key);
    if (entry && !entry.loading && entry.expires > Date.now()) {
      r.json(entry.body);
      return;
    }
    if (entry?.loading) {
      entry.waiting.push(r);
      return;
    }
    if (entries.size > 200)
      for (const [k, e] of entries)
        if (!e.loading && e.expires < Date.now()) entries.delete(k);
    entry = { body: null, expires: 0, waiting: [], loading: true };
    entries.set(key, entry);
    const item = entry;
    const json = r.json.bind(r);
    r.json = ((body: any) => {
      if (r.statusCode === 200) {
        item.body = body;
        item.expires = Date.now() + ttlMs;
      } else entries.delete(key);
      item.loading = false;
      for (const waiter of item.waiting)
        if (!waiter.destroyed) waiter.status(r.statusCode).json(body);
      item.waiting = [];
      return json(body);
    }) as typeof r.json;
    r.once("finish", () => {
      if (item.loading) {
        entries.delete(key);
        item.loading = false;
        for (const waiter of item.waiting)
          if (!waiter.destroyed)
            waiter
              .status(502)
              .json({ error: "Data refresh unavailable; retry shortly." });
      }
    });
    next();
  };
}
