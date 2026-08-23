"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { WORKER_ROLE_LABELS, type WorkerRoleKey } from "@/lib/types";

interface Analytics {
  fillRate: number | null;
  noShowTrend: { weekStart: string; noShowRate: number | null; shiftCount: number }[];
  rateBenchmark: { role: WorkerRoleKey; venueAvgRate: number; platformAvgRate: number }[];
}

interface Forecast {
  forecast: { date: string; predictedShifts: number }[];
  basis: string;
}

export default function VenueAnalyticsPage() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/venues/me/analytics")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setAnalytics)
      .catch(() => setError("Could not load analytics — are you logged in as a venue?"));
    fetch("/api/venues/me/demand-forecast")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setForecast)
      .catch(() => {});
  }, []);

  return (
    <main style={{ maxWidth: 720, margin: "3rem auto", padding: "0 1rem" }}>
      <p>
        <Link href="/venue/shifts">&larr; Your shifts</Link>
      </p>
      <h1>Analytics</h1>
      {error && <p style={{ color: "crimson" }}>{error}</p>}

      {analytics && (
        <>
          <section style={{ marginBottom: "1.5rem" }}>
            <h2>Fill rate</h2>
            <p>
              {analytics.fillRate === null
                ? "No shifts posted yet."
                : `${Math.round(analytics.fillRate * 100)}% of posted shifts got filled.`}
            </p>
          </section>

          <section style={{ marginBottom: "1.5rem" }}>
            <h2>No-show trend (last 8 weeks)</h2>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left" }}>
                  <th>Week of</th>
                  <th>No-show rate</th>
                  <th>Shifts</th>
                </tr>
              </thead>
              <tbody>
                {analytics.noShowTrend.map((w) => (
                  <tr key={w.weekStart}>
                    <td>{w.weekStart}</td>
                    <td>{w.noShowRate === null ? "—" : `${Math.round(w.noShowRate * 100)}%`}</td>
                    <td>{w.shiftCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section style={{ marginBottom: "1.5rem" }}>
            <h2>Rate benchmark</h2>
            {analytics.rateBenchmark.length === 0 ? (
              <p>Post a shift to see how your rates compare.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left" }}>
                    <th>Role</th>
                    <th>Your avg rate</th>
                    <th>Platform avg rate</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.rateBenchmark.map((r) => (
                    <tr key={r.role}>
                      <td>{WORKER_ROLE_LABELS[r.role]}</td>
                      <td>£{r.venueAvgRate}/hr</td>
                      <td>£{r.platformAvgRate}/hr</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}

      {forecast && (
        <section>
          <h2>Demand forecast — next 7 days</h2>
          <p style={{ color: "#555" }}>{forecast.basis}</p>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left" }}>
                <th>Date</th>
                <th>Predicted shifts</th>
              </tr>
            </thead>
            <tbody>
              {forecast.forecast.map((f) => (
                <tr key={f.date}>
                  <td>{f.date}</td>
                  <td>{f.predictedShifts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
