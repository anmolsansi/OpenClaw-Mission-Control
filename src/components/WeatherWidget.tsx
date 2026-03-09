"use client";

import { useEffect, useState } from "react";
import { format, formatDistanceToNow, isValid } from "date-fns";
import { Wind, Droplets, Thermometer, RefreshCcw } from "lucide-react";

interface Forecast {
  day: string;
  max: number;
  min: number;
  emoji: string;
}

interface WeatherData {
  city: string;
  temp: number;
  feels_like: number;
  humidity: number;
  wind: number;
  precipitation: number;
  condition: string;
  emoji: string;
  forecast: Forecast[];
  updated: string;
  error?: string;
}

export function WeatherWidget() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const [error, setError] = useState<string | null>(null);

  const loadWeather = async () => {
    try {
      setLoading(true);
      setError(null);
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "auto";

      const fetchBy = async (lat?: number, lon?: number, city?: string) => {
        const qs = new URLSearchParams();
        qs.set("tz", tz);
        if (typeof lat === "number" && typeof lon === "number") {
          qs.set("lat", String(lat));
          qs.set("lon", String(lon));
        }
        if (city) qs.set("city", city);
        const r = await fetch(`/api/weather?${qs.toString()}`);
        if (!r.ok) throw new Error("Weather request failed");
        return r.json();
      };

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            const d = await fetchBy(pos.coords.latitude, pos.coords.longitude);
            if (d?.error) throw new Error(d.error);
            setWeather(d);
            setLoading(false);
          },
          async () => {
            const d = await fetchBy();
            if (d?.error) throw new Error(d.error);
            setWeather(d);
            setLoading(false);
          },
          { enableHighAccuracy: false, timeout: 4000, maximumAge: 300000 }
        );
      } else {
        const d = await fetchBy();
        if (d?.error) throw new Error(d.error);
        setWeather(d);
        setLoading(false);
      }
    } catch {
      setError("Weather unavailable");
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWeather();
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (loading) {
    return (
      <div style={{
        padding: "1.25rem",
        backgroundColor: "var(--card)",
        borderRadius: "0.75rem",
        border: "1px solid var(--border)",
        minHeight: "120px",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>Loading weather...</span>
      </div>
    );
  }

  if (error || !weather) {
    return (
      <div
        style={{
          padding: "1.25rem",
          backgroundColor: "var(--card)",
          borderRadius: "0.75rem",
          border: "1px solid var(--border)",
          minHeight: "120px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: "0.6rem",
        }}
      >
        <div style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>{error || "Weather unavailable"}</div>
        <button
          onClick={loadWeather}
          style={{
            width: "fit-content",
            fontSize: "0.75rem",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.35rem",
            color: "var(--accent)",
          }}
        >
          <RefreshCcw className="w-3.5 h-3.5" /> Retry
        </button>
      </div>
    );
  }

  const updatedDate = new Date(weather.updated);

  return (
    <div style={{
      padding: "1.25rem",
      backgroundColor: "var(--card)",
      borderRadius: "0.75rem",
      border: "1px solid var(--border)",
      background: "linear-gradient(135deg, var(--card) 0%, color-mix(in srgb, var(--accent) 5%, var(--card)) 100%)",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "0.75rem" }}>
        <div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.125rem" }}>
            📍 {weather.city}
          </div>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--text-primary)", lineHeight: 1, letterSpacing: "-1px" }}>
            {format(now, "HH:mm")}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.125rem" }}>
            {format(now, "EEEE, d MMM")}
          </div>
          {isValid(updatedDate) && (
            <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginTop: "0.125rem" }}>
              updated {formatDistanceToNow(updatedDate, { addSuffix: true })}
            </div>
          )}
        </div>

        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "2.5rem", lineHeight: 1 }}>{weather.emoji}</div>
          <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--text-primary)", lineHeight: 1.1 }}>
            {weather.temp}°C
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.125rem" }}>
            {weather.condition}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: "1rem", marginBottom: "0.875rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
          <Thermometer className="w-3.5 h-3.5" style={{ color: "var(--accent)" }} />
          Feels {weather.feels_like}°C
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
          <Droplets className="w-3.5 h-3.5" style={{ color: "#60a5fa" }} />
          {weather.humidity}%
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
          <Wind className="w-3.5 h-3.5" style={{ color: "#94a3b8" }} />
          {weather.wind} km/h
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.5rem" }}>
        {weather.forecast.map((day, i) => {
          const dayName = i === 0 ? "Today" : i === 1 ? "Tmrw" : format(new Date(day.day), "EEE");
          return (
            <div
              key={day.day}
              style={{
                flex: 1, textAlign: "center", padding: "0.5rem 0.375rem",
                backgroundColor: i === 0 ? "rgba(255,59,48,0.08)" : "var(--card-elevated)",
                borderRadius: "0.5rem",
                border: i === 0 ? "1px solid rgba(255,59,48,0.2)" : "1px solid var(--border)",
              }}
            >
              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>{dayName}</div>
              <div style={{ fontSize: "1.25rem", lineHeight: 1, marginBottom: "0.25rem" }}>{day.emoji}</div>
              <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-primary)" }}>{day.max}°</div>
              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{day.min}°</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
