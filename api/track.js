function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });

  const id = (req.query.order_id || "").trim();
  if (!id) return json(res, 400, { error: "order_id required" });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) return json(res, 500, { error: "Server env not set" });

  const url = `${SUPABASE_URL}/rest/v1/orders?order_id=eq.${encodeURIComponent(id)}&select=order_id,status,email,created_at,status_updated_at`;
  const r = await fetch(url, {
    headers: { "Authorization": `Bearer ${SERVICE_KEY}`, "apikey": SERVICE_KEY }
  });

  if (!r.ok) return json(res, 500, { error: "Query failed" });

  const rows = await r.json();
  if (!rows.length) return json(res, 404, { error: "Order not found" });

  return json(res, 200, { ok: true, order: rows[0] });
}
