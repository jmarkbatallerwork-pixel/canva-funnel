// /api/submit.js (Safe CommonJS for Vercel — avoids top-level crashes)

module.exports.config = {
  api: { bodyParser: false }, // REQUIRED for multipart/form-data
};

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
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

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  // ✅ Safe requires INSIDE handler so missing modules won't crash invocation
  let fs;
  let formidablePkg;
  try {
    fs = require("fs");
    formidablePkg = require("formidable");
  } catch (e) {
    console.error("MODULE LOAD ERROR:", e);
    return json(res, 500, {
      ok: false,
      error:
        "Server missing dependency. Run: npm i formidable, commit package.json/package-lock.json, then redeploy. " +
        String(e?.message || e),
    });
  }

  const formidable =
    typeof formidablePkg === "function"
      ? formidablePkg
      : formidablePkg.formidable || formidablePkg.default;

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json(res, 500, {
      ok: false,
      error: "Missing env vars: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (set in Vercel Project Settings → Environment Variables)",
    });
  }

  const form = formidable({
    multiples: false,
    keepExtensions: true,
    maxFileSize: 4 * 1024 * 1024, // 4MB
  });

  try {
    const { fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) return reject(err);
        resolve({ fields, files });
      });
    });

    const name = String(fields.name || "").trim();
    const email = String(fields.email || "").trim();
    const ref = String(fields.ref || "").trim();
    const qty = Number(fields.qty || 0);
    const total = Number(fields.total || 0);

    // ✅ Fix: formidable sometimes returns files as array
    const receiptRaw = files.receipt;
    const receipt = Array.isArray(receiptRaw) ? receiptRaw[0] : receiptRaw;

    if (!name || !email || !ref || !qty || !total) {
      return json(res, 400, { ok: false, error: "Missing fields (name/email/ref/qty/total)" });
    }
    if (!receipt) {
      return json(res, 400, { ok: false, error: "Receipt file missing (field must be 'receipt')" });
    }

    const filePath = receipt.filepath || receipt.path;
    if (!filePath) {
      return json(res, 500, { ok: false, error: "Receipt file path missing (formidable parsing issue)" });
    }

    const fileBuffer = fs.readFileSync(filePath);

    const order_id = makeId();

    // ---- Upload to Supabase Storage bucket: "receipts"
    const originalName = receipt.originalFilename || receipt.name || "receipt";
    const extGuess = originalName.includes(".") ? originalName.split(".").pop() : "";
    const ext = String(extGuess || "").toLowerCase();

    const storagePath = `${order_id}/receipt.${ext || "bin"}`;
    const contentType = receipt.mimetype || receipt.type || "application/octet-stream";

    const uploadUrl = `${SUPABASE_URL}/storage/v1/object/receipts/${encodeURIComponent(storagePath)}`;

    const uploadResp = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
        "Content-Type": contentType,
        "x-upsert": "true",
      },
      body: fileBuffer,
    });

    if (!uploadResp.ok) {
      const t = await uploadResp.text();
      return json(res, 500, { ok: false, error: "Storage upload failed: " + t });
    }

    // ---- Insert into Supabase table: "orders"
const insert = {
  order_id,
  name,
  email,
  qty,
  total,
  gcash_ref: ref,          // ✅ REQUIRED by your table (NOT NULL)
  receipt_path: storagePath,
  status: "Pending",
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
    console.error("SUBMIT ERROR:", err);
    return json(res, 500, { ok: false, error: String(err?.message || err) });
  }
};
