module.exports = async function handler(req, res) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const auth = req.headers["x-admin-auth"] || "";
  if (auth !== "Canvasphere@0625") {
    res.statusCode = 401;
    return res.end(JSON.stringify({ ok:false, error:"Unauthorized" }));
  }

  let body = {};
  try{ body = JSON.parse(req.body || "{}"); } catch {}

  const order_id = (body.order_id || "").toString().trim();
  const status = (body.status || "").toString().trim();

  if(!order_id || !status){
    res.statusCode = 400;
    return res.end(JSON.stringify({ ok:false, error:"Missing order_id/status" }));
  }

  try{
    const url = `${SUPABASE_URL}/rest/v1/orders?order_id=eq.${encodeURIComponent(order_id)}`;
    const r = await fetch(url, {
      method:"PATCH",
      headers:{
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type":"application/json",
        Prefer:"return=representation"
      },
      body: JSON.stringify({
        status,
        status_updated_at: new Date().toISOString()
      })
    });

    const data = await r.text();
    if(!r.ok) throw new Error(data);

    res.setHeader("Content-Type","application/json");
    res.setHeader("Cache-Control","no-store");
    return res.end(JSON.stringify({ ok:true }));

  }catch(e){
    res.statusCode = 500;
    return res.end(JSON.stringify({ ok:false, error: String(e?.message || e) }));
  }
};
