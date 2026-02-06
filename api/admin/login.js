function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  const body = await new Promise((resolve) => {
    let s = "";
    req.on("data", (c) => (s += c));
    req.on("end", () => resolve(s));
  });

  let data = {};
  try { data = JSON.parse(body || "{}"); } catch {}

  const u = (data.username || "").trim();
  const p = (data.password || "");
  if (u === process.env.ADMIN_USERNAME && p === process.env.ADMIN_PASSWORD) {
    return json(res, 200, { ok: true });
  }
  return json(res, 401, { ok: false, error: "Invalid login" });
}
