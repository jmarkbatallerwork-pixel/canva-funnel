// /api/admin/orders.js
module.exports = async function handler(req, res) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SERVICE_KEY) {
    res.statusCode = 500;
    return res.end(JSON.stringify({ ok: false, error: "Missing Supabase env vars" }));
  }

  // OPTIONAL: very light protection (same admin pass). Better later with real auth.
  const auth = req.headers["x-admin-auth"] || "";
  if (auth !== "Canvasphere@0625") {
    res.statusCode = 401;
    return res.end(JSON.stringify({ ok: false, error: "Unauthorized" }));
  }

  try {
    // Fetch latest orders
    const url =
      `${SUPABASE_URL}/rest/v1/orders` +
      `?select=*&order=created_at.desc`;

    const r = await fetch(url, {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
    });

    const text = await r.text();
    if (!r.ok) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ ok: false, error: "Supabase fetch failed: " + text }));
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    return res.end(JSON.stringify({ ok: true, orders: JSON.parse(text) }));
  } catch (e) {
    res.statusCode = 500;
    return res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }));
  }
};
