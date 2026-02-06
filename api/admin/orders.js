function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });

  const auth = req.headers["x-admin-auth"] || "";
  if (auth !== (process.env.ADMIN_PASSWORD || "")) return json(res, 401, { error: "Unauthorized" });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const url = `${SUPABASE_URL}/rest/v1/orders?select=order_id,name,email,qty,total,gcash_ref,receipt_path,status,created_at,status_updated_at&order=created_at.desc`;
  const r = await fetch(url, { headers: { "Authorization": `Bearer ${SERVICE_KEY}`, "apikey": SERVICE_KEY } });
  if (!r.ok) return json(res, 500, { error: "Query failed" });

  const rows = await r.json();
  return json(res, 200, { ok: true, orders: rows });
}
