export default {
  async fetch(req) {

    // --- 写死 lighter 的 BTC 合约 marketIndex ---
    const LIGHTER_MARKET_INDEX = 1; // 关键修复点！

    try {
      // === 1. 获取 Lighter orderbook ===
      const lighterUrl = `https://mainnet.zklighter.elliot.ai/api/v1/orderBooks?market_index=${LIGHTER_MARKET_INDEX}&depth=1`;

      const lighterRes = await fetch(lighterUrl);
      const lighterJson = await lighterRes.json();

      let lighter = null;

      if (lighterJson && lighterJson.data && lighterJson.data.bids && lighterJson.data.asks) {
        lighter = {
          bid: parseFloat(lighterJson.data.bids[0]?.price || 0),
          ask: parseFloat(lighterJson.data.asks[0]?.price || 0),
        };
      }

      // === 2. 获取 Paradex BTC 订单簿 ===
      const paradexRes = await fetch("https://api.paradex.trade/v1/orderbook?symbol=BTC-USD");
      const paradexJson = await paradexRes.json();

      let paradex = null;

      if (paradexJson && paradexJson.data) {
        paradex = {
          bid: parseFloat(paradexJson.data.bids?.[0]?.price || 0),
          ask: parseFloat(paradexJson.data.asks?.[0]?.price || 0)
        };
      }

      // === 3.最基本的检查：lighter/paradex 不能为 null ===
      if (!lighter || !paradex) {
        return new Response(JSON.stringify({
          error: "Orderbook fetch failed",
          lighter,
          paradex
        }), { status: 500 });
      }

      // === 4. Spread 价差计算 ===
      const spreadLongA_ShortB = lighter.ask - paradex.bid;  // A做多 B做空
      const spreadLongB_ShortA = paradex.ask - lighter.bid;  // B做多 A做空

      return new Response(JSON.stringify({
        lighter,
        paradex,
        spread: {
          longA_shortB: spreadLongA_ShortB,
          longB_shortA: spreadLongB_ShortA
        }
      }), {
        headers: { "Content-Type": "application/json" }
      });

    } catch (e) {
      return new Response(JSON.stringify({ error: e.toString() }));
    }
  }
};
