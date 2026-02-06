module.exports = async function handler(req, res) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const auth = req.headers["x-admin-auth"] || "";
  if (auth !== "Canvasphere@0625") {
    res.statusCode = 401;
    return res.end(JSON.stringify({ ok:false, error:"Unauthorized" }));
  }

  try{
    // delete all rows
    const url = `${SUPABASE_URL}/rest/v1/orders?id=neq.00000000-0000-0000-0000-000000000000`;
    const r = await fetch(url, {
      method:"DELETE",
      headers:{
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`
      }
    });

    const text = await r.text();
    if(!r.ok) throw new Error(text);

    res.setHeader("Content-Type","application/json");
    res.setHeader("Cache-Control","no-store");
    return res.end(JSON.stringify({ ok:true }));

  }catch(e){
    res.statusCode = 500;
    return res.end(JSON.stringify({ ok:false, error: String(e?.message || e) }));
  }
};
