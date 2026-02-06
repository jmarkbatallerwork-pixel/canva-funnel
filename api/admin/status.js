// api/admin/status.js
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    // Simple header auth
    const auth = req.headers["x-admin-auth"];
    if (!auth || auth !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const { order_id, status } = req.body || {};
    if (!order_id || !status) {
      return res.status(400).json({ ok: false, error: "Missing order_id or status" });
    }

    // Supabase (SERVICE ROLE KEY recommended in serverless)
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Update status + timestamp
    const { data, error } = await supabase
      .from("orders") // <-- change if your table name differs
      .update({
        status,
        status_updated_at: new Date().toISOString(),
      })
      .eq("order_id", order_id)
      .select("*")
      .single();

    if (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
    if (!data) {
      return res.status(404).json({ ok: false, error: "Order not found" });
    }

    return res.status(200).json({ ok: true, order: data });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "Server error" });
  }
}
