const LIGHTER_BASE = "https://mainnet.zklighter.elliot.ai";
const PARA_BASE = "https://api.prod.paradex.trade";
const PARA_MARKET = "BTC-USD-PERP";

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "accept": "application/json" } });
  if (!res.ok) throw new Error("HTTP " + res.status + " for " + url);
  return res.json();
}

function parsePrice(row) {
  if (Array.isArray(row)) return parseFloat(row[0]);
  if (typeof row === "object") return parseFloat(row.price ?? row.p);
  return parseFloat(row);
}

async function getLighterIndex() {
  const data = await fetchJson(LIGHTER_BASE + "/api/v1/exchangeStats");
  const arr = data.data || [];
  for (const m of arr) {
    if (String(m.symbol).includes("BTC")) {
      return m.market_index ?? m.marketIndex;
    }
  }
  throw new Error("no BTC index");
}

async function getLighterOB() {
  const idx = await getLighterIndex();
  const ob = await fetchJson(LIGHTER_BASE + "/api/v1/orderBooks?market_index=" + idx + "&depth=1");

  const bid = parsePrice(ob.bids[0]);
  const ask = parsePrice(ob.asks[0]);
  return { bid, ask, mid: (bid + ask)/2 };
}

async function getParadexOB() {
  const ob = await fetchJson(PARA_BASE + "/v1/orderbook/" + PARA_MARKET + "?depth=1");
  const bid = parsePrice(ob.bids[0]);
  const ask = parsePrice(ob.asks[0]);
  return { bid, ask, mid: (bid + ask)/2 };
}

async function calc() {
  const [L, P] = await Promise.all([getLighterOB(), getParadexOB()]);

  return {
    lighter: L,
    paradex: P,
    spread: {
      long_short: L.ask - P.bid,
      short_long: L.bid - P.ask,
      mid: L.mid - P.mid
    },
    ts: Date.now()
  };
}

export default {
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/api/spread") {
      try {
        const data = await calc();
        return new Response(JSON.stringify(data), {
          headers: { "content-type": "application/json" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
      }
    }

    // 默认返回网页
    return new Response(FRONTEND_HTML, {
      headers: { "content-type": "text/html" }
    });
  }
};

const FRONTEND_HTML = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>BTC 套利监控</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body{font-family:sans-serif;padding:15px;}
.card{background:#f2f2f2;padding:10px;margin-bottom:10px;border-radius:8px;}
.big{font-size:20px;font-weight:700;}
.green{color:green;font-weight:bold;}
.red{color:red;font-weight:bold;}
</style>
</head>
<body>
<h2>BTC 套利监控（Lighter × Paradex）</h2>

<div class="card">
  <div id="ts"></div>
  <div id="lighter"></div>
  <div id="paradex"></div>
  <div class="big" id="ls"></div>
  <div class="big" id="sl"></div>
  <div class="big" id="mid"></div>
</div>

<script>
async function load(){
  try{
    const r=await fetch('/api/spread');
    const d=await r.json();

    document.getElementById("ts").innerText =
      "更新时间: " + new Date(d.ts).toLocaleTimeString();

    document.getElementById("lighter").innerText =
      "Lighter =>  Bid: "+d.lighter.bid+"  Ask: "+d.lighter.ask;

    document.getElementById("paradex").innerText =
      "Paradex =>  Bid: "+d.paradex.bid+"  Ask: "+d.paradex.ask;

    let ls = d.spread.long_short;
    let sl = d.spread.short_long;
    let mid = d.spread.mid;

    document.getElementById("ls").innerHTML =
      "L 多 - P 空: <span class='"+(ls>=0?"green":"red")+"'>"+ls.toFixed(2)+"</span>";

    document.getElementById("sl").innerHTML =
      "L 空 - P 多: <span class='"+(sl>=0?"green":"red")+"'>"+sl.toFixed(2)+"</span>";

    document.getElementById("mid").innerHTML =
      "Mid差价: <span class='"+(mid>=0?"green":"red")+"'>"+mid.toFixed(2)+"</span>";
  }catch(e){
    document.getElementById("ts").innerText="加载失败:"+e;
  }
}
load();
setInterval(load,3000);
</script>
</body></html>`;
