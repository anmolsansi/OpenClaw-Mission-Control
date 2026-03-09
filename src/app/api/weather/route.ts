/**
 * Weather API - Live location when coordinates are provided
 * GET /api/weather?lat=..&lon=..&city=..
 * Uses Open-Meteo (free, no API key)
 */
import { NextRequest, NextResponse } from 'next/server';

type CacheVal = { data: unknown; ts: number };
const cache = new Map<string, CacheVal>();
const CACHE_DURATION = 10 * 60 * 1000;

const WMO_CODES: Record<number, { label: string; emoji: string }> = {
  0: { label: "Clear sky", emoji: "☀️" },
  1: { label: "Mainly clear", emoji: "🌤️" },
  2: { label: "Partly cloudy", emoji: "⛅" },
  3: { label: "Overcast", emoji: "☁️" },
  45: { label: "Foggy", emoji: "🌫️" },
  48: { label: "Icy fog", emoji: "🌫️" },
  51: { label: "Light drizzle", emoji: "🌦️" },
  53: { label: "Drizzle", emoji: "🌦️" },
  55: { label: "Heavy drizzle", emoji: "🌧️" },
  61: { label: "Light rain", emoji: "🌧️" },
  63: { label: "Rain", emoji: "🌧️" },
  65: { label: "Heavy rain", emoji: "🌧️" },
  71: { label: "Light snow", emoji: "🌨️" },
  73: { label: "Snow", emoji: "❄️" },
  75: { label: "Heavy snow", emoji: "❄️" },
  80: { label: "Light showers", emoji: "🌦️" },
  81: { label: "Showers", emoji: "🌧️" },
  82: { label: "Heavy showers", emoji: "⛈️" },
  95: { label: "Thunderstorm", emoji: "⛈️" },
  96: { label: "Thunderstorm with hail", emoji: "⛈️" },
  99: { label: "Thunderstorm with heavy hail", emoji: "⛈️" },
};

function num(v: string | null, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const lat = num(searchParams.get('lat'), 41.8781); // default Chicago
  const lon = num(searchParams.get('lon'), -87.6298);
  const cityFromClient = searchParams.get('city')?.trim() || null;
  const tzFromClient = searchParams.get('tz')?.trim() || 'auto';

  const cacheKey = `${lat.toFixed(3)},${lon.toFixed(3)}|${tzFromClient}|${cityFromClient || ''}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.ts < CACHE_DURATION) {
    return NextResponse.json(hit.data);
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(String(lat))}&longitude=${encodeURIComponent(String(lon))}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,precipitation&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=${encodeURIComponent(tzFromClient)}&forecast_days=3`;

    const res = await fetch(url, { next: { revalidate: 600 } });
    const json = await res.json();

    const current = json.current;
    const daily = json.daily;

    const wmo = WMO_CODES[current.weather_code] || { label: "Unknown", emoji: "🌡️" };

    let city = cityFromClient || 'Your location';
    if (!cityFromClient) {
      try {
        const rev = await fetch(`https://geocoding-api.open-meteo.com/v1/reverse?latitude=${encodeURIComponent(String(lat))}&longitude=${encodeURIComponent(String(lon))}&count=1&language=en`);
        const revJson = await rev.json();
        const r = revJson?.results?.[0];
        if (r?.name) city = r.name;
      } catch {}
    }

    const data = {
      city,
      temp: Math.round(current.temperature_2m),
      feels_like: Math.round(current.apparent_temperature),
      humidity: current.relative_humidity_2m,
      wind: Math.round(current.wind_speed_10m),
      precipitation: current.precipitation,
      condition: wmo.label,
      emoji: wmo.emoji,
      forecast: daily.time.slice(0, 3).map((day: string, i: number) => ({
        day,
        max: Math.round(daily.temperature_2m_max[i]),
        min: Math.round(daily.temperature_2m_min[i]),
        emoji: (WMO_CODES[daily.weather_code[i]] || { emoji: "🌡️" }).emoji,
      })),
      updated: new Date().toISOString(),
      location: { lat, lon },
    };

    cache.set(cacheKey, { data, ts: Date.now() });
    return NextResponse.json(data);
  } catch (error) {
    console.error('[weather] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch weather' }, { status: 500 });
  }
}
