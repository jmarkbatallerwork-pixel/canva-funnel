module.exports = async function handler(req, res) {
  // Always return JSON
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");

  // CORS (safe for your setup; remove if you don’t need it)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-auth");
  res.setHeader("Access-Control-Allow-Methods", "POST, PATCH, OPTIONS");

  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    return res.end(JSON.stringify({ ok: true }));
  }

  // You can allow POST only to keep it simple
  if (req.method !== "POST" && req.method !== "PATCH") {
    res.statusCode = 405;
    return res.end(JSON.stringify({ ok: false, error: "Method not allowed" }));
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SERVICE_KEY) {
    res.statusCode = 500;
    return res.end(JSON.stringify({ ok: false, error: "Missing SUPABASE env vars" }));
  }

  // Admin auth
  const auth = req.headers["x-admin-auth"] || "";
  if (auth !== "Canvasphere@0625") {
    res.statusCode = 401;
    return res.end(JSON.stringify({ ok: false, error: "Unauthorized" }));
  }

  // Parse body safely (string OR object)
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body && typeof body === "object" ? body : {};

  const order_id = (body.order_id || "").toString().trim();
  const status = (body.status || "").toString().trim();

  if (!order_id || !status) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ ok: false, error: "Missing order_id/status" }));
  }

  try {
    // Patch row in Supabase via PostgREST
    const url =
      `${SUPABASE_URL}/rest/v1/orders?order_id=eq.${encodeURIComponent(order_id)}`;

    const r = await fetch(url, {
      method: "PATCH",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify({
        status,
        status_updated_at: new Date().toISOString()
      })
    });

    const text = await r.text();
    if (!r.ok) {
      res.statusCode = 500;
      return res.end(JSON.stringify({
        ok: false,
        error: "Supabase update failed",
        details: text
      }));
    }

    // If no rows updated, Supabase returns [] (depending on config)
    // Not strict, but helpful
    let updated = null;
    try { updated = JSON.parse(text); } catch {}

    return res.end(JSON.stringify({
      ok: true,
      updated: Array.isArray(updated) ? updated[0] : updated
    }));

  } catch (e) {
    res.statusCode = 500;
    return res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }));
  }
};
