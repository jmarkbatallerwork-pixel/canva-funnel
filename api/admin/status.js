function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  const auth = req.headers["x-admin-auth"] || "";
  if (auth !== (process.env.ADMIN_PASSWORD || "")) return json(res, 401, { error: "Unauthorized" });

  const body = await new Promise((resolve) => {
    let s = "";
    req.on("data", (c) => (s += c));
    req.on("end", () => resolve(s));
  });

  let data = {};
  try { data = JSON.parse(body || "{}"); } catch {}

  const order_id = (data.order_id || "").trim();
  const status = (data.status || "").trim();
  if (!order_id || !status) return json(res, 400, { error: "order_id and status required" });

  const allowed = [
    "Pending",
    "Processing",
    "Verified (Already Sent on your email)",
    "Rejected"
  ];
  if (!allowed.includes(status)) return json(res, 400, { error: "Invalid status" });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const url = `${SUPABASE_URL}/rest/v1/orders?order_id=eq.${encodeURIComponent(order_id)}`;
  const r = await fetch(url, {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${SERVICE_KEY}`,
      "apikey": SERVICE_KEY,
      "Content-Type": "application/json",
      "Prefer": "return=representation"
    },
    body: JSON.stringify({ status })
  });

  if (!r.ok) return json(res, 500, { error: "Update failed" });

  const rows = await r.json();
  return json(res, 200, { ok: true, order: rows[0] });
}
