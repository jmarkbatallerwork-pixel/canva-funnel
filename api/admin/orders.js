module.exports = async function handler(req, res) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const auth = req.headers["x-admin-auth"] || "";
  if (auth !== "Canvasphere@0625") {
    res.statusCode = 401;
    return res.end(JSON.stringify({ ok:false, error:"Unauthorized" }));
  }

  const order_id = (req.query.order_id || "").toString().trim();
  if(!order_id){
    res.statusCode = 400;
    return res.end(JSON.stringify({ ok:false, error:"Missing order_id" }));
  }

  try{
    // fetch order
    const url = `${SUPABASE_URL}/rest/v1/orders?order_id=eq.${encodeURIComponent(order_id)}&select=*`;
    const r = await fetch(url, {
      headers:{
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`
      }
    });

    const data = await r.json();
    if(!r.ok) throw new Error(JSON.stringify(data));
    if(!data?.length) {
      res.statusCode = 404;
      return res.end(JSON.stringify({ ok:false, error:"Not found" }));
    }

    const order = data[0];
    let receipt_url = null;

    // Create signed URL (Storage) via Supabase REST
    if(order.receipt_path){
      const signUrl = `${SUPABASE_URL}/storage/v1/object/sign/receipts/${order.receipt_path}`;
      const signRes = await fetch(signUrl, {
        method:"POST",
        headers:{
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Type":"application/json"
        },
        body: JSON.stringify({ expiresIn: 3600 })
      });
      const signed = await signRes.json();
      if(signRes.ok && signed?.signedURL){
        receipt_url = `${SUPABASE_URL}/storage/v1${signed.signedURL}`;
      }
    }

    res.setHeader("Content-Type","application/json");
    res.setHeader("Cache-Control","no-store");
    return res.end(JSON.stringify({ ok:true, order, receipt_url }));

  }catch(e){
    res.statusCode = 500;
    return res.end(JSON.stringify({ ok:false, error: String(e?.message || e) }));
  }
};
