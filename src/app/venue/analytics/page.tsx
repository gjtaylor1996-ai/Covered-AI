"use client";

import { useEffect, useState } from "react";
import { WORKER_ROLE_LABELS, type WorkerRoleKey } from "@/lib/types";
import { AppHeader } from "@/components/AppHeader";

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
    <div className="page">
      <AppHeader links={[{ href: "/venue/shifts", label: "Your shifts" }]} />
      <div className="content">
        <h1 style={{ fontSize: "22px", marginBottom: "18px" }}>Analytics</h1>
        {error && <p className="mono text-error" style={{ fontSize: "12.5px" }}>{error}</p>}

        {analytics && (
          <>
            <div className="section-title" style={{ marginTop: 0 }}>Fill rate</div>
            <div className="stat-tile" style={{ marginBottom: "10px" }}>
              <div className="stat-value" style={{ fontSize: "16px" }}>
                {analytics.fillRate === null
                  ? "No shifts posted yet."
                  : `${Math.round(analytics.fillRate * 100)}% of posted shifts got filled.`}
              </div>
            </div>

            <div className="section-title">No-show trend (last 8 weeks)</div>
            <div className="card" style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
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
            </div>

            <div className="section-title">Rate benchmark</div>
            {analytics.rateBenchmark.length === 0 ? (
              <p className="text-muted">Post a shift to see how your rates compare.</p>
            ) : (
              <div className="card" style={{ overflowX: "auto" }}>
                <table>
                  <thead>
                    <tr>
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
              </div>
            )}
          </>
        )}

        {forecast && (
          <>
            <div className="section-title">Demand forecast — next 7 days</div>
            <p className="text-muted" style={{ fontSize: "12.5px", marginTop: 0 }}>{forecast.basis}</p>
            <div className="card" style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
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
            </div>
          </>
        )}
      </div>
    </div>
  );
}
