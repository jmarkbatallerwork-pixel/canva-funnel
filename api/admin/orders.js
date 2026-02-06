module.exports = async function handler(req, res) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");

  // Basic env validation
  if (!SUPABASE_URL || !SERVICE_KEY) {
    res.statusCode = 500;
    return res.end(JSON.stringify({
      ok: false,
      error: "Server misconfigured: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    }));
  }

  // Admin auth
  const auth = String(req.headers["x-admin-auth"] || "");
  if (auth !== "Canvasphere@0625") {
    res.statusCode = 401;
    return res.end(JSON.stringify({ ok: false, error: "Unauthorized" }));
  }

  // Optional: order_id for single order fetch
  const order_id = (req.query?.order_id || "").toString().trim();

  try {
    // -------------------------
    // A) LIST MODE (Admin table)
    // -------------------------
    if (!order_id) {
      // Return latest orders for dashboard
      // NOTE: add/remove columns to match your table
      const url =
        `${SUPABASE_URL}/rest/v1/orders` +
        `?select=order_id,name,email,qty,total,status,created_at,receipt_path,gcash_ref,status_updated_at` +
        `&order=created_at.desc` +
        `&limit=200`;

      const r = await fetch(url, {
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`
        }
      });

      const data = await r.json().catch(() => null);
      if (!r.ok) {
        throw new Error(typeof data === "string" ? data : JSON.stringify(data));
      }

      // data is an array
      return res.end(JSON.stringify({ ok: true, orders: Array.isArray(data) ? data : [] }));
    }

    // -------------------------
    // B) SINGLE ORDER MODE
    // -------------------------
    const url =
      `${SUPABASE_URL}/rest/v1/orders` +
      `?order_id=eq.${encodeURIComponent(order_id)}` +
      `&select=*` +
      `&limit=1`;

    const r = await fetch(url, {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`
      }
    });

    const data = await r.json().catch(() => null);
    if (!r.ok) {
      throw new Error(typeof data === "string" ? data : JSON.stringify(data));
    }

    if (!Array.isArray(data) || data.length === 0) {
      res.statusCode = 404;
      return res.end(JSON.stringify({ ok: false, error: "Not found" }));
    }

    const order = data[0];
    let receipt_url = null;

    // Create signed URL for receipt (if exists)
    if (order.receipt_path) {
      // If receipt_path already includes "ORDERID/filename", do NOT duplicate folder name
      // Your bucket is "receipts"
      const signUrl = `${SUPABASE_URL}/storage/v1/object/sign/receipts/${order.receipt_path}`;

      const signRes = await fetch(signUrl, {
        method: "POST",
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ expiresIn: 3600 })
      });

      const signed = await signRes.json().catch(() => null);

      if (signRes.ok && signed?.signedURL) {
        receipt_url = `${SUPABASE_URL}/storage/v1${signed.signedURL}`;
      }
    }

    return res.end(JSON.stringify({ ok: true, order, receipt_url }));
  } catch (e) {
    res.statusCode = 500;
    return res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }));
  }
};
