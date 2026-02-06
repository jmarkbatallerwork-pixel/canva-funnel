import formidable from "formidable";
import fs from "fs";

export const config = {
  api: { bodyParser: false }, // IMPORTANT: allow multipart/form-data
};

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

function makeId() {
  return (
    "CANDO-" +
    Date.now().toString(36).toUpperCase() +
    "-" +
    Math.random().toString(36).slice(2, 7).toUpperCase()
  );
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json(res, 500, { ok: false, error: "Missing Supabase env vars" });
  }

  const form = formidable({
    multiples: false,
    maxFileSize: 4 * 1024 * 1024, // 4MB (adjust if needed)
    keepExtensions: true,
  });

  try {
    const { fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve({ fields, files });
      });
    });

    const name = String(fields.name || "").trim();
    const email = String(fields.email || "").trim();
    const ref = String(fields.ref || "").trim();
    const qty = Number(fields.qty || 0);
    const total = Number(fields.total || 0);

    const receipt = files.receipt; // must match fd.append("receipt", file)

    if (!name || !email || !ref || !qty || !total) {
      return json(res, 400, { ok: false, error: "Missing fields" });
    }
    if (!receipt) {
      return json(res, 400, { ok: false, error: "Receipt file missing" });
    }

    const order_id = makeId();

    // ---- 1) Upload receipt to Supabase Storage bucket: "receipts"
    // Make sure you created bucket "receipts" in Supabase Storage
    const filePath = receipt.filepath || receipt.path; // formidable v2/v3 compatibility
    const fileBuffer = fs.readFileSync(filePath);

    const ext = (receipt.originalFilename || "receipt").split(".").pop();
    const storagePath = `${order_id}/receipt.${ext || "bin"}`;

    const uploadResp = await fetch(`${SUPABASE_URL}/storage/v1/object/receipts/${storagePath}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
        "Content-Type": receipt.mimetype || "application/octet-stream",
      },
      body: fileBuffer,
    });

    if (!uploadResp.ok) {
      const t = await uploadResp.text();
      return json(res, 500, { ok: false, error: "Storage upload failed: " + t });
    }

    // ---- 2) Insert order row in Supabase Database table: "orders"
    // Ensure table "orders" exists with columns like:
    // order_id, name, email, reference_no, qty, total, status, receipt_path
    const insert = {
      order_id,
      name,
      email,
      reference_no: ref,
      qty,
      total,
      status: "Pending",
      receipt_path: storagePath,
    };

    const dbResp = await fetch(`${SUPABASE_URL}/rest/v1/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(insert),
    });

    if (!dbResp.ok) {
      const t = await dbResp.text();
      return json(res, 500, { ok: false, error: "DB insert failed: " + t });
    }

    return json(res, 200, { ok: true, order_id });
  } catch (err) {
    // formidable throws for too large file etc.
    return json(res, 500, { ok: false, error: String(err?.message || err) });
  }
}
