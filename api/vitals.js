export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse body from stream (Vercel Node.js default runtime)
    const buffers = [];
    for await (const chunk of req) {
      buffers.push(chunk);
    }
    const body = Buffer.concat(buffers).toString('utf8');
    const metric = JSON.parse(body);

    const gameMetric = typeof metric?.name === 'string' && metric.name.startsWith('game_');
    const webVitals = new Set(['CLS', 'INP', 'LCP', 'FCP', 'TTFB']);
    const allowedGameMetrics = new Set([
      'game_run_start',
      'game_run_end',
      'game_party_size',
      'game_checkpoint',
      'game_max_floor',
      'game_deaths',
      'game_reconnect_failure',
    ]);
    const allowedMetric = allowedGameMetrics.has(metric?.name) || webVitals.has(metric?.name);
    if (
      !metric ||
      typeof metric.value !== 'number' ||
      !Number.isFinite(metric.value) ||
      !allowedMetric ||
      metric.page !== '/'
    ) {
      return res.status(400).json({ error: 'Invalid metric payload' });
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      name: metric.name,
      value: metric.value,
      rating: gameMetric ? undefined : metric.rating,
      delta: gameMetric ? undefined : metric.delta,
      id: gameMetric ? undefined : metric.id,
      page: metric.page,
      userAgent: gameMetric ? undefined : req.headers['user-agent'] || 'unknown',
    };

    console.log('[VITALS]', JSON.stringify(logEntry));

    // A função só encerra depois do envio: promessa solta pode perder a métrica
    // quando a plataforma congela o contexto logo após responder ao beacon.
    const sheetsUrl = process.env.VITALS_SHEETS_URL;
    if (sheetsUrl) {
      try {
        const sheetsResponse = await fetch(sheetsUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            timestamp: logEntry.timestamp,
            name: metric.name,
            value: metric.value,
            rating: metric.rating,
            delta: metric.delta,
            id: metric.id,
            page: metric.page,
            userAgent: logEntry.userAgent,
          }),
        });
        if (!sheetsResponse.ok) {
          console.error('[VITALS] Sheets forward rejected:', sheetsResponse.status);
        }
      } catch (err) {
        console.error('[VITALS] Sheets forward failed:', err);
      }
    }

    res.setHeader('Content-Type', 'application/json');
    res.status(200).json({ ok: true, received: logEntry });
  } catch (e) {
    console.error('[VITALS] Error:', e);
    res.status(500).json({ error: 'Internal server error', detail: String(e) });
  }
}
