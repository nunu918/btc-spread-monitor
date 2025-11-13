// BTC 套利监控（Lighter × Paradex）Worker 版
// 只做一件事：
//   GET /        -> 返回网页
//   GET /api/data -> 返回两个交易所 BTC 合约盘口和价差

const LIGHTER_BASE = 'https://mainnet.zklighter.elliot.ai';
const LIGHTER_BTC_MARKET_ID = 1;          // BTC 合约的 market_id

const PARADEX_BASE = 'https://api.prod.paradex.trade';
const PARADEX_BTC_MARKET = 'BTC-USD-PERP'; // Paradex BTC 永续

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);

  if (url.pathname === '/api/data') {
    return handleApiData();
  }

  // 其它路径都返回网页
  return new Response(renderHtml(), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

// ------------ API 部分 ------------

async function handleApiData() {
  try {
    const [lighter, paradex] = await Promise.all([
      fetchLighterBtc(),
      fetchParadexBtc(),
    ]);

    const result = {
      lighter,
      paradex,
      timestamp: Date.now(),
    };

    if (lighter && paradex && lighter.mid && paradex.mid) {
      result.spread_mid = paradex.mid - lighter.mid;
      const lighterLast = lighter.last ?? lighter.mid;
      const paradexLast = paradex.last ?? paradex.mid;
      result.spread_last = paradexLast - lighterLast;
    }

    return jsonResponse(result);
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
}

// Lighter：从 orderBookDetails 里拿 BTC 合约盘口
async function fetchLighterBtc() {
  const url = `${LIGHTER_BASE}/api/v1/orderBookDetails?market_id=${LIGHTER_BTC_MARKET_ID}`;
  const res = await fetch(url, {
    headers: { accept: 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`Lighter HTTP ${res.status}`);
  }

  const data = await res.json();

  // 正常结构：{ order_book_details: [ { ... } ] }
  const detailsArray = data.order_book_details || data.orderBookDetails || [];
  const details = detailsArray[0] || data;

  const bids = details.bids || [];
  const asks = details.asks || [];

  let bestBid = details.bestBid;
  let bestAsk = details.bestAsk;

  if (!bestBid && bids.length > 0) bestBid = bids[0][0];
  if (!bestAsk && asks.length > 0) bestAsk = asks[0][0];

  if (!bestBid || !bestAsk) {
    throw new Error('Lighter: no orderbook for BTC');
  }

  const bid = Number(bestBid);
  const ask = Number(bestAsk);
  const mid = (bid + ask) / 2;

  const lastRaw =
    details.last_trade_price ||
    details.lastTradePrice ||
    details.last_price ||
    null;
  const last = lastRaw != null ? Number(lastRaw) : null;

  return { bid, ask, mid, last };
}

// Paradex：用官方 bbo 接口拿 BTC-USD-PERP 盘口
async function fetchParadexBtc() {
  const url = `${PARADEX_BASE}/v1/bbo/${encodeURIComponent(
    PARADEX_BTC_MARKET,
  )}`;
  const res = await fetch(url, {
    headers: { accept: 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`Paradex HTTP ${res.status}`);
  }

  const data = await res.json();

  const bid = data.bid ? Number(data.bid) : NaN;
  const ask = data.ask ? Number(data.ask) : NaN;

  if (!isFinite(bid) || !isFinite(ask)) {
    throw new Error('Paradex: invalid bbo');
  }

  const mid = (bid + ask) / 2;

  // 这个接口没有 last，可以先留空
  return { bid, ask, mid, last: null };
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

// ------------ 网页部分 ------------

function renderHtml() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>BTC 套利监控（Lighter × Paradex）</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
      padding: 16px;
      background: #0b1020;
      color: #f5f5f5;
    }
    h1 {
      font-size: 20px;
      margin-bottom: 8px;
    }
    .subtitle {
      font-size: 12px;
      color: #9ca3af;
      margin-bottom: 12px;
    }
    .card {
      background: #111827;
      border-radius: 12px;
      padding: 12px;
      margin-bottom: 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    }
    .card h2 {
      font-size: 16px;
      margin: 0 0 8px;
    }
    .row {
      display: flex;
      justify-content: space-between;
      font-size: 14px;
      margin: 2px 0;
    }
    .label { color: #9ca3af; }
    .value { font-weight: 600; }
    .up { color: #22c55e; }
    .down { color: #ef4444; }
    .neutral { color: #e5e7eb; }
    #status {
      font-size: 12px;
      color: #9ca3af;
      margin-bottom: 8px;
    }
    button {
      padding: 6px 10px;
      border-radius: 8px;
      border: none;
      background: #2563eb;
      color: white;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <h1>BTC 套利监控（Lighter × Paradex）</h1>
  <div class="subtitle">每 3 秒自动刷新一次，仅查看 BTC 合约盘口价差。</div>
  <div id="status">正在加载...</div>

  <div class="card">
    <h2>Lighter BTC 合约</h2>
    <div class="row"><span class="label">Bid</span><span class="value" id="lighter-bid">-</span></div>
    <div class="row"><span class="label">Ask</span><span class="value" id="lighter-ask">-</span></div>
    <div class="row"><span class="label">Mid</span><span class="value" id="lighter-mid">-</span></div>
    <div class="row"><span class="label">Last</span><span class="value" id="lighter-last">-</span></div>
  </div>

  <div class="card">
    <h2>Paradex BTC-USD-PERP</h2>
    <div class="row"><span class="label">Bid</span><span class="value" id="para-bid">-</span></div>
    <div class="row"><span class="label">Ask</span><span class="value" id="para-ask">-</span></div>
    <div class="row"><span class="label">Mid</span><span class="value" id="para-mid">-</span></div>
  </div>

  <div class="card">
    <h2>价差</h2>
    <div class="row">
      <span class="label">Mid 价差 (Paradex - Lighter)</span>
      <span class="value" id="spread-mid">-</span>
    </div>
    <div class="row">
      <span class="label">Last 价差</span>
      <span class="value" id="spread-last">-</span>
    </div>
    <div class="row">
      <span class="label">最后更新时间</span>
      <span class="value" id="updated-at">-</span>
    </div>
  </div>

  <button id="refresh-btn">立即刷新</button>

  <script>
    async function fetchData() {
      const statusEl = document.getElementById('status');
      try {
        const res = await fetch('/api/data?' + Date.now());
        const data = await res.json();

        if (data.error) {
          statusEl.textContent = '加载失败：' + data.error;
          return;
        }

        const l = data.lighter || {};
        const p = data.paradex || {};

        const ff = v => (v == null || Number.isNaN(v) ? '-' : Number(v).toFixed(2));

        document.getElementById('lighter-bid').textContent = ff(l.bid);
        document.getElementById('lighter-ask').textContent = ff(l.ask);
        document.getElementById('lighter-mid').textContent = ff(l.mid);
        document.getElementById('lighter-last').textContent = l.last == null ? '-' : ff(l.last);

        document.getElementById('para-bid').textContent = ff(p.bid);
        document.getElementById('para-ask').textContent = ff(p.ask);
        document.getElementById('para-mid').textContent = ff(p.mid);

        const sm = data.spread_mid;
        const sl = data.spread_last;

        const spreadMidEl = document.getElementById('spread-mid');
        const spreadLastEl = document.getElementById('spread-last');

        function setSpread(el, val) {
          el.className = 'value';
          if (val == null || Number.isNaN(val)) {
            el.textContent = '-';
            el.classList.add('neutral');
          } else {
            const n = Number(val);
            el.textContent = n.toFixed(2);
            if (n > 0) el.classList.add('up');
            else if (n < 0) el.classList.add('down');
            else el.classList.add('neutral');
          }
        }

        setSpread(spreadMidEl, sm);
        setSpread(spreadLastEl, sl);

        const ts = data.timestamp ? new Date(data.timestamp) : null;
        document.getElementById('updated-at').textContent = ts ? ts.toLocaleTimeString() : '-';

        statusEl.textContent = '已更新';
      } catch (e) {
        statusEl.textContent = '加载失败：' + e;
      }
    }

    document.getElementById('refresh-btn').addEventListener('click', fetchData);
    fetchData();
    setInterval(fetchData, 3000);
  </script>
</body>
</html>`;
}
