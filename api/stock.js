// Vercel Serverless Function — gecikmeli hisse fiyatlarını sunucu tarafında çeker.
// Tarayıcıdan doğrudan çağrılamayan kaynakları burada çağırıyoruz (CORS engelini aşmak için).
//
// Kullanım:  /api/stock?symbols=THYAO.IS,ASELS.IS,AAPL
// Dönen veri: { "THYAO.IS": { price: 312.5, change: 2.1, currency: "TRY" }, ... }
//
// NOT: Veriler gecikmelidir (genellikle 15 dakika). Gerçek zamanlı BIST verisi
// için Borsa İstanbul'dan resmi lisans gerekir.

export default async function handler(req, res) {
  // Tarayıcının bu fonksiyonu çağırabilmesi için izin başlıkları
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');

  const symbolsParam = (req.query.symbols || '').trim();
  if (!symbolsParam) {
    return res.status(400).json({ error: 'symbols parametresi gerekli' });
  }

  const symbols = symbolsParam.split(',').map(s => s.trim()).filter(Boolean).slice(0, 60);
  const result = {};

  // Sembolleri paralel olarak çek, biri hata verirse diğerleri etkilenmesin
  await Promise.all(symbols.map(async (symbol) => {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
      const r = await fetch(url, {
        headers: {
          // Bazı kaynaklar tarayıcı benzeri bir istek bekliyor
          'User-Agent': 'Mozilla/5.0 (compatible; MercekApp/1.0)',
          'Accept': 'application/json',
        },
      });

      if (!r.ok) {
        result[symbol] = { error: `HTTP ${r.status}` };
        return;
      }

      const data = await r.json();
      const meta = data?.chart?.result?.[0]?.meta;

      if (!meta || typeof meta.regularMarketPrice !== 'number') {
        result[symbol] = { error: 'veri bulunamadı' };
        return;
      }

      const price = meta.regularMarketPrice;
      const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? price;
      const changePct = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;

      result[symbol] = {
        price: Number(price.toFixed(2)),
        change: Number(changePct.toFixed(2)),
        currency: meta.currency || null,
        marketState: meta.marketState || null,
      };
    } catch (err) {
      result[symbol] = { error: 'istek başarısız' };
    }
  }));

  return res.status(200).json({
    delayed: true,
    note: 'Veriler gecikmelidir (yaklaşık 15 dakika). Yatırım tavsiyesi değildir.',
    fetchedAt: new Date().toISOString(),
    quotes: result,
  });
}
