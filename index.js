export default {
  async fetch(request) {
    const url = new URL(request.url);

    // ------------------------------
    // 1. API 路由：/api/spread
    // ------------------------------
    if (url.pathname === "/api/spread") {
      try {
        // --- Lighter BTC API（你填入你现在成功返回数据的 endpoint）---
        const lighterURL = "https://mainnet.zklighter.elliot.ai/orderbook?symbol=BTC";
        const lighterRes = await fetch(lighterURL);
        const lighterJson = await lighterRes.json();

        // 标准化 lighter 数据
        const lighterBid = lighterJson?.data?.bid ?? null;
        const lighterAsk = lighterJson?.data?.ask ?? null;

        if (!lighterBid || !lighterAsk) {
          return new Response(
            JSON.stringify({ error: "Lighter: No BTC bid/ask data", raw: lighterJson }),
            { status: 500 }
          );
        }

        // --- Paradex BTC API ---
        const paradexURL = "https://api.paradex.trade/v1/markets/orderbook?symbol=BTC";
        const paradexRes = await fetch(paradexURL);
        const paradexJson = await paradexRes.json();

        // 标准化 paradex 数据
        const paradexBid = paradexJson?.data?.bids?.[0]?.price ?? null;
        const paradexAsk = paradexJson?.data?.asks?.[0]?.price ?? null;

        if (!paradexBid || !paradexAsk) {
          return new Response(
            JSON.stringify({ error: "Paradex: No BTC bid/ask data", raw: paradexJson }),
            { status: 500 }
          );
        }

        // --- 计算价差 ---
        const spreadBid = Number(lighterBid) - Number(paradexBid);
        const spreadAsk = Number(lighterAsk) - Number(paradexAsk);

        return new Response(
          JSON.stringify(
            {
              ok: true,
              lighter: { bid: lighterBid, ask: lighterAsk },
              paradex: { bid: paradexBid, ask: paradexAsk },
              spread: { bid: spreadBid, ask: spreadAsk }
            },
            null,
            2
          ),
          { headers: { "Content-Type": "application/json" } }
        );
      } catch (e) {
        return new Response(
          JSON.stringify({ error: "Worker error", message: e.message }),
          { status: 500 }
        );
      }
    }

    // ------------------------------
    // 2. 前端网页 UI
    // ------------------------------
    return new Response(
      `
<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8" />
  <title>BTC 套利监控（Lighter × Paradex）</title>
  <style>
    body { font-family: Arial; padding: 20px; }
    h1 { font-size: 24px; margin-bottom: 20px; }
    .box { background: #f2f2f2; padding: 15px; border-radius: 8px; }
  </style>
</head>
<body>
  <h1>BTC 套利监控（Lighter × Paradex）</h1>

  <div id="result" class="box">
    加载中...
  </div>

  <script>
    async function load() {
      try {
        const r = await fetch("/api/spread");
        const j = await r.json();

        if (j.error) {
          document.getElementById("result").innerHTML =
            "<b>错误：</b> " + j.error + "<br><pre>" + JSON.stringify(j.raw, null, 2) + "</pre>";
          return;
        }

        document.getElementById("result").innerHTML = \`
          <b>Lighter</b><br>
          Bid：\${j.lighter.bid}<br>
          Ask：\${j.lighter.ask}<br><br>
          <b>Paradex</b><br>
          Bid：\${j.paradex.bid}<br>
          Ask：\${j.paradex.ask}<br><br>

          <b>价差（Lighter - Paradex）</b><br>
          Bid Spread：<span style="color: red;">\${j.spread.bid}</span><br>
          Ask Spread：<span style="color: red;">\${j.spread.ask}</span>
        \`;
      } catch (err) {
        document.getElementById("result").innerHTML = "加载失败：" + err.message;
      }
    }

    load();
    setInterval(load, 3000);
  </script>
</body>
</html>
`,
      { headers: { "Content-Type": "text/html" } }
    );
  }
};
