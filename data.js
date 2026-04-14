// ============================================================
// VN PULSE — Vercel Serverless API  /api/data
// Tổng hợp: Crypto, Forex, Commodities, Weather, Fear&Greed,
//           Stock Indices, VN Macro, Gold VN
// ============================================================

export const config = { maxDuration: 25 };

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 's-maxage=60, stale-while-revalidate=30',
};

// ── helpers ──────────────────────────────────────────────────
async function safeFetch(url, opts = {}) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeout || 8000);
    const res = await fetch(url, { signal: ctrl.signal, ...opts });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function safeText(url, opts = {}) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeout || 8000);
    const res = await fetch(url, { signal: ctrl.signal, ...opts });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}

// ── 1. CRYPTO — CoinGecko free API ───────────────────────────
async function getCrypto() {
  const ids = [
    'bitcoin','ethereum','solana','binancecoin','ripple',
    'cardano','avalanche-2','polkadot','chainlink','dogecoin',
    'tron','litecoin','shiba-inu','uniswap','stellar'
  ].join(',');
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`;
  const d = await safeFetch(url);
  if (!d) return null;

  // Also get global stats
  const global = await safeFetch('https://api.coingecko.com/api/v3/global');
  
  return {
    coins: d,
    totalMarketCap: global?.data?.total_market_cap?.usd || null,
    totalVolume: global?.data?.total_volume?.usd || null,
    btcDominance: global?.data?.market_cap_percentage?.btc || null,
    activeCryptos: global?.data?.active_cryptocurrencies || null,
  };
}

// ── 2. FOREX — ExchangeRate-API (free) ───────────────────────
async function getForex() {
  const d = await safeFetch('https://api.exchangerate-api.com/v4/latest/USD');
  if (!d?.rates) return null;
  const r = d.rates;
  return {
    base: 'USD',
    timestamp: d.time_last_updated || Date.now()/1000,
    rates: {
      VND: r.VND, EUR: r.EUR, GBP: r.GBP, JPY: r.JPY,
      CNY: r.CNY, SGD: r.SGD, KRW: r.KRW, THB: r.THB,
      MYR: r.MYR, AUD: r.AUD, CHF: r.CHF, CAD: r.CAD,
      HKD: r.HKD, INR: r.INR, TWD: r.TWD, IDR: r.IDR,
      PHP: r.PHP, NZD: r.NZD, SAR: r.SAR, AED: r.AED,
    }
  };
}

// ── 3. FEAR & GREED ───────────────────────────────────────────
async function getFearGreed() {
  const d = await safeFetch('https://api.alternative.me/fng/?limit=7');
  if (!d?.data) return null;
  return {
    current: {
      value: parseInt(d.data[0].value),
      label: d.data[0].value_classification,
      timestamp: d.data[0].timestamp,
    },
    history: d.data.map(x => ({
      value: parseInt(x.value),
      label: x.value_classification,
      timestamp: x.timestamp,
    }))
  };
}

// ── 4. COMMODITIES — Yahoo Finance via proxy ──────────────────
async function getYahooQuote(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`;
  const d = await safeFetch(url, { timeout: 9000 });
  try {
    const meta = d?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const price = meta.regularMarketPrice || meta.previousClose || 0;
    const prev = meta.chartPreviousClose || meta.previousClose || price;
    const change = prev ? ((price - prev) / prev * 100) : 0;
    return {
      price,
      change,
      prev,
      high: meta.regularMarketDayHigh || price,
      low: meta.regularMarketDayLow || price,
      volume: meta.regularMarketVolume || 0,
      currency: meta.currency || 'USD',
      marketState: meta.marketState || 'CLOSED',
    };
  } catch { return null; }
}

async function getCommodities() {
  const symbols = {
    gold:     'GC=F',
    silver:   'SI=F',
    platinum: 'PL=F',
    copper:   'HG=F',
    brent:    'BZ=F',
    wti:      'CL=F',
    natgas:   'NG=F',
    wheat:    'ZW=F',
    corn:     'ZC=F',
    coffee:   'KC=F',
    sugar:    'SB=F',
    cotton:   'CT=F',
  };
  const entries = await Promise.all(
    Object.entries(symbols).map(async ([key, sym]) => {
      const q = await getYahooQuote(sym);
      return [key, q];
    })
  );
  return Object.fromEntries(entries.filter(([, v]) => v !== null));
}

// ── 5. STOCK INDICES ──────────────────────────────────────────
async function getStockIndices() {
  const indices = {
    'sp500':   '%5EGSPC',
    'nasdaq':  '%5EIXIC',
    'dow':     '%5EDJI',
    'vix':     '%5EVIX',
    'dax':     '%5EGDAXI',
    'ftse':    '%5EFTSE',
    'cac40':   '%5EFCHI',
    'nikkei':  '%5EN225',
    'shanghai':'000001.SS',
    'hangseng':'%5EHSI',
    'nifty':   '%5ENSEI',
    'kospi':   '%5EKS11',
    'sti':     '%5ESTI',
    'asx200':  '%5EAXJO',
  };
  const entries = await Promise.all(
    Object.entries(indices).map(async ([key, sym]) => {
      const q = await getYahooQuote(decodeURIComponent(sym));
      return [key, q];
    })
  );
  return Object.fromEntries(entries.filter(([, v]) => v !== null));
}

// ── 6. WEATHER — Open-Meteo (free, no key) ───────────────────
async function getWeather(lat = 10.7769, lon = 106.7009) {
  const url = `https://api.open-meteo.com/v1/forecast?` +
    `latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,` +
    `precipitation,weather_code,wind_speed_10m,wind_direction_10m,uv_index` +
    `&hourly=temperature_2m,weather_code,precipitation_probability,apparent_temperature` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,` +
    `uv_index_max,precipitation_sum,wind_speed_10m_max,sunrise,sunset` +
    `&timezone=auto&forecast_days=7`;
  return await safeFetch(url);
}

// ── 7. GOLD VN — sjc.com.vn ──────────────────────────────────
async function getGoldVN() {
  try {
    // SJC public API
    const d = await safeFetch('https://sjc.com.vn/giavang/textContent.php', { timeout: 6000 });
    if (d) return d;
    
    // Fallback: DOJI API
    const d2 = await safeFetch('https://giavang.doji.vn/api/giavang/', { timeout: 6000 });
    if (d2) return { source: 'doji', data: d2 };
    
    return null;
  } catch { return null; }
}

// ── 8. VN MACRO (Static + semi-dynamic) ──────────────────────
function getVNMacro() {
  // These are latest available figures (updated manually when released)
  return {
    sbvRate: 4.5,          // % - SBV refinancing rate
    inflationYoY: 3.17,    // % - CPI YoY Feb 2025
    gdpGrowth: 7.09,       // % - 2024 GDP growth
    tradeBalance: 8.1,     // USD billions 2024
    fdiApproved: 38.23,    // USD billions 2024
    forex_reserves: 88.0,  // USD billions (est.)
    unemployment: 2.24,    // % Q4 2024
    pmiFeb: 49.2,          // S&P Global PMI Feb 2025
    cpiMar: 3.17,          // % YoY
    updatedAt: '2025-04',
    sources: {
      sbvRate: 'SBV',
      inflation: 'GSO Vietnam',
      gdp: 'GSO Vietnam 2024',
      fdi: 'MPI Vietnam 2024',
    }
  };
}

// ── 9. NEWS — RSS feeds (VN + international) ─────────────────
async function getNews() {
  const feeds = [
    { url: 'https://vnexpress.net/rss/kinh-doanh.rss',         tag: 'te', label: 'VnExpress' },
    { url: 'https://vnexpress.net/rss/the-gioi.rss',           tag: 'tg', label: 'VnExpress' },
    { url: 'https://www.cafef.vn/rss/tai-chinh-ngan-hang.rss', tag: 'tt', label: 'CafeF' },
    { url: 'https://cafebiz.vn/rss/bat-dong-san.rss',          tag: 'tm', label: 'CafeBiz' },
    { url: 'https://feeds.bbci.co.uk/news/business/rss.xml',   tag: 'tg', label: 'BBC Business' },
  ];
  
  const results = await Promise.allSettled(
    feeds.map(f => safeText(f.url, { timeout: 7000 }).then(xml => ({ xml, tag: f.tag, label: f.label })))
  );

  const items = [];
  for (const r of results) {
    if (r.status !== 'fulfilled' || !r.value?.xml) continue;
    const { xml, tag, label } = r.value;
    const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
    for (const match of itemMatches) {
      const chunk = match[1];
      const title = (chunk.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || 
                     chunk.match(/<title>(.*?)<\/title>/))?.[1]?.trim() || '';
      const link  = (chunk.match(/<link>(.*?)<\/link>/) || 
                     chunk.match(/<guid>(.*?)<\/guid>/))?.[1]?.trim() || '';
      const pubDate = chunk.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]?.trim() || '';
      const desc  = (chunk.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) ||
                     chunk.match(/<description>(.*?)<\/description>/))?.[1]
                     ?.replace(/<[^>]+>/g, '')?.slice(0, 120)?.trim() || '';
      if (title && link) items.push({ title, link, pubDate, desc, tag, label });
      if (items.length >= 60) break;
    }
  }
  
  return items.slice(0, 50);
}

// ── 10. BLOCKCHAIN STATS ──────────────────────────────────────
async function getBlockchain() {
  const [btcHash, ethGas] = await Promise.all([
    safeFetch('https://blockchain.info/q/hashrate', { timeout: 6000 }),
    safeFetch('https://api.etherscan.io/api?module=gastracker&action=gasoracle&apikey=YourApiKeyToken', { timeout: 5000 }),
  ]);
  
  return {
    btcHashrate: typeof btcHash === 'number' ? (btcHash / 1e18).toFixed(2) : null,
    ethGasPrice: ethGas?.result?.SafeGasPrice || null,
  };
}

// ── MAIN HANDLER ─────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(200, HEADERS);
    res.end();
    return;
  }

  const { type } = req.query;

  // Route specific endpoints for faster partial loads
  try {
    if (type === 'crypto') {
      const data = await getCrypto();
      res.writeHead(200, HEADERS);
      res.end(JSON.stringify({ ok: true, data }));
      return;
    }
    if (type === 'forex') {
      const data = await getForex();
      res.writeHead(200, HEADERS);
      res.end(JSON.stringify({ ok: true, data }));
      return;
    }
    if (type === 'commodities') {
      const data = await getCommodities();
      res.writeHead(200, HEADERS);
      res.end(JSON.stringify({ ok: true, data }));
      return;
    }
    if (type === 'indices') {
      const data = await getStockIndices();
      res.writeHead(200, HEADERS);
      res.end(JSON.stringify({ ok: true, data }));
      return;
    }
    if (type === 'weather') {
      const lat = parseFloat(req.query.lat) || 10.7769;
      const lon = parseFloat(req.query.lon) || 106.7009;
      const data = await getWeather(lat, lon);
      res.writeHead(200, HEADERS);
      res.end(JSON.stringify({ ok: true, data }));
      return;
    }
    if (type === 'news') {
      const data = await getNews();
      res.writeHead(200, HEADERS);
      res.end(JSON.stringify({ ok: true, data }));
      return;
    }
    if (type === 'feargreed') {
      const data = await getFearGreed();
      res.writeHead(200, HEADERS);
      res.end(JSON.stringify({ ok: true, data }));
      return;
    }
    if (type === 'goldvn') {
      const data = await getGoldVN();
      res.writeHead(200, HEADERS);
      res.end(JSON.stringify({ ok: true, data }));
      return;
    }
    if (type === 'macro') {
      const data = getVNMacro();
      res.writeHead(200, HEADERS);
      res.end(JSON.stringify({ ok: true, data }));
      return;
    }

    // Default: fetch critical data in parallel
    const [crypto, forex, feargreed, commodities] = await Promise.all([
      getCrypto(),
      getForex(),
      getFearGreed(),
      getCommodities(),
    ]);

    res.writeHead(200, HEADERS);
    res.end(JSON.stringify({
      ok: true,
      ts: Date.now(),
      data: { crypto, forex, feargreed, commodities, macro: getVNMacro() }
    }));
  } catch (err) {
    res.writeHead(500, HEADERS);
    res.end(JSON.stringify({ ok: false, error: err.message }));
  }
}
