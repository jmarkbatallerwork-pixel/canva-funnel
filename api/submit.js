export const config = {
  api: { bodyParser: false }
};

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

// Very small multipart parser (works for single file + text fields)
async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

function parseMultipart(buffer, boundary) {
  const result = { fields: {}, file: null };
  const boundaryBuf = Buffer.from("--" + boundary);
  const parts = buffer.split(boundaryBuf).slice(1, -1);

  for (let part of parts) {
    if (part.slice(0, 2).toString() === "\r\n") part = part.slice(2);
    const idx = part.indexOf(Buffer.from("\r\n\r\n"));
    if (idx === -1) continue;

    const head = part.slice(0, idx).toString("utf8");
    let body = part.slice(idx + 4);
    if (body.slice(-2).toString() === "\r\n") body = body.slice(0, -2);

    const nameMatch = head.match(/name="([^"]+)"/);
    if (!nameMatch) continue;
    const name = nameMatch[1];

    const fileMatch = head.match(/filename="([^"]*)"/);
    if (fileMatch && fileMatch[1]) {
      const typeMatch = head.match(/Content-Type:\s*([^\r\n]+)/i);
      result.file = {
        field: name,
        filename: fileMatch[1],
        contentType: typeMatch ? typeMatch[1].trim() : "application/octet-stream",
        data: body
      };
    } else {
      result.fields[name] = body.toString("utf8");
    }
  }
  return result;
}

function makeOrderId() {
  return "CANDO-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2,7).toUpperCase();
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  const ct = req.headers["content-type"] || "";
  const boundaryMatch = ct.match(/boundary=([^;]+)/i);
  if (!boundaryMatch) return json(res, 400, { error: "Missing multipart boundary" });
  const boundary = boundaryMatch[1];

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) return json(res, 500, { error: "Server env not set" });

  const raw = await readBody(req);
  // Buffer.split helper
  Buffer.prototype.split = function (sep) {
    const out = [];
    let start = 0;
    let idx;
    while ((idx = this.indexOf(sep, start)) !== -1) {
      out.push(this.slice(start, idx));
      start = idx + sep.length;
    }
    out.push(this.slice(start));
    return out;
  };

  const { fields, file } = parseMultipart(raw, boundary);

  const name = (fields.name || "").trim();
  const email = (fields.email || "").trim();
  const gcash_ref = (fields.ref || "").trim();
  const qty = parseInt((fields.qty || "0").trim(), 10);
  const total = parseInt((fields.total || "0").trim(), 10);

  if (!name || !email || !gcash_ref || !qty || !total) {
    return json(res, 400, { error: "Missing required fields" });
  }
  if (!file) return json(res, 400, { error: "Receipt file required" });

  const order_id = makeOrderId();
  const ext = (file.filename.split(".").pop() || "bin").toLowerCase();
  const receiptPath = `${order_id}/${Date.now()}.${ext}`;

  // 1) Upload to Storage (receipts bucket)
  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/receipts/${encodeURIComponent(receiptPath)}`;
  const up = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${SERVICE_KEY}`,
      "apikey": SERVICE_KEY,
      "Content-Type": file.contentType,
      "x-upsert": "true"
    },
    body: file.data
  });

  if (!up.ok) {
    const t = await up.text();
    return json(res, 500, { error: "Upload failed", details: t });
  }

  // 2) Insert order row
  const insertUrl = `${SUPABASE_URL}/rest/v1/orders`;
  const ins = await fetch(insertUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${SERVICE_KEY}`,
      "apikey": SERVICE_KEY,
      "Content-Type": "application/json",
      "Prefer": "return=representation"
    },
    body: JSON.stringify([{
      order_id,
      name,
      email,
      qty,
      total,
      gcash_ref,
      receipt_path: receiptPath,
      status: "Pending"
    }])
  });

  if (!ins.ok) {
    const t = await ins.text();
    return json(res, 500, { error: "DB insert failed", details: t });
  }

  return json(res, 200, { ok: true, order_id });
}

