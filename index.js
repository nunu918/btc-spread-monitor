export default {
  async fetch() {
    try {

      // ==== 1. Paradex BTC 盘口（加入 UA 伪装绕过风控） ====
      const paraRes = await fetch(
        "https://api.prod.paradex.trade/v1/bbo/BTC-USD-PERP",
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            "Accept": "application/json",
            "Origin": "https://111.shiyiwei6.workers.dev",
            "Referer": "https://111.shiyiwei6.workers.dev"
          }
        }
      );

      const paraData = await paraRes.json();
      const paraBid = paraData?.best_bid;
      const paraAsk = paraData?.best_ask;

      if (!paraBid || !paraAsk) throw new Error("Paradex 数据异常（被风控）");

      // ==== 2. Lighter BTC 盘口 ====
      const lightRes = await fetch("https://mainnet.zklighter.elliot.ai/api/v1/orderBookDetails?market_id=1");
      const lightData = await lightRes.json();

      const lightBid = lightData?.bids?.[0]?.price;
      const lightAsk = lightData?.asks?.[0]?.price;

      if (!lightBid || !lightAsk) throw new Error("Lighter 数据异常");

      // ==== 3. 计算价差 ====
      const spread_long = lightAsk - paraBid;  // Lighter 多 - Paradex 空
      const spread_short = paraAsk - lightBid; // Paradex 多 - Lighter 空

      // ==== 4. 输出网页 ====
      return new Response(
        `
        <html>
        <head>
          <meta charset="utf-8"/>
          <title>BTC 套利监控</title>
          <style>
            body { font-family: Arial; padding: 20px; background: #fafafa; }
            .box { background:#fff; padding:15px; border-radius:8px; margin: 15px 0; border:1px solid #eee; }
            .title { font-size:22px; font-weight:bold; }
            .val { font-size:26px; color:#333; font-weight:bold; }
          </style>
        </head>
        <body>

          <div class="title">BTC 套利监控（Paradex × Lighter）</div>
          <br>

          <div class="box">
            <div class="title">Paradex</div>
            Bid：<span class="val">${paraBid}</span><br>
            Ask：<span class="val">${paraAsk}</span>
          </div>

          <div class="box">
            <div class="title">Lighter</div>
            Bid：<span class="val">${lightBid}</span><br>
            Ask：<span class="val">${lightAsk}</span>
          </div>

          <div class="box">
            <div class="title">价差</div>
            Lighter 多 - Paradex 空 = <span class="val">${spread_long.toFixed(2)}</span><br>
            Paradex 多 - Lighter 空 = <span class="val">${spread_short.toFixed(2)}</span>
          </div>

          <script>
            setTimeout(() => location.reload(), 3000);
          </script>

        </body>
        </html>
        `,
        { headers: { "Content-Type": "text/html;charset=UTF-8" } }
      );

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        headers: { "Content-Type": "application/json" }
      });
    }
  }
};
