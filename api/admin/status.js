// /api/admin/status.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // IMPORTANT: service role (server only)
);

const ADMIN_SECRET = process.env.ADMIN_SECRET; // same as your ADMIN.password

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

    // simple admin auth
    const token = req.headers["x-admin-auth"];
    if (!ADMIN_SECRET || token !== ADMIN_SECRET) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const { order_id, status } = req.body || {};
    if (!order_id || !status) {
      return res.status(400).json({ ok: false, error: "Missing order_id or status" });
    }

    const { data, error } = await supabase
      .from("orders")
      .update({
        status,
        status_updated_at: new Date().toISOString(),
      })
      .eq("order_id", order_id)
      .select("*")
      .single();

    if (error) throw error;

    return res.status(200).json({ ok: true, order: data });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || "Server error" });
  }
}
