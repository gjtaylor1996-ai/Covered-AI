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

interface TrustBreakdown {
  trustScore: number | null;
  trustTier: string;
  feedbackCount: number;
}

interface FeedbackItem {
  id: string;
  paidOnTime: boolean;
  breaksGiven: boolean;
  matchedDescription: boolean;
  comment: string | null;
  submittedAt: string;
}

const DAY_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function VenueAnalyticsPage() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [trust, setTrust] = useState<TrustBreakdown | null>(null);
  const [recentFeedback, setRecentFeedback] = useState<FeedbackItem[] | null>(null);
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
    fetch("/api/venues/me/trust-score")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((body) => {
        setTrust(body.breakdown);
        setRecentFeedback(body.recentFeedback);
      })
      .catch(() => {});
  }, []);

  const insights: string[] = [];
  if (analytics?.fillRate !== null && analytics?.fillRate !== undefined) {
    const pct = Math.round(analytics.fillRate * 100);
    insights.push(
      pct >= 80
        ? `${pct}% of your posted shifts get filled — a strong fill rate.`
        : `${pct}% of your posted shifts get filled so far.`
    );
  }
  const lastActiveWeek = analytics?.noShowTrend.filter((w) => w.shiftCount > 0).slice(-1)[0];
  if (lastActiveWeek && lastActiveWeek.noShowRate !== null) {
    insights.push(
      `Your most recent active week (${lastActiveWeek.weekStart}) had a ${Math.round(lastActiveWeek.noShowRate * 100)}% no-show rate across ${lastActiveWeek.shiftCount} shift${lastActiveWeek.shiftCount === 1 ? "" : "s"}.`
    );
  }
  if (analytics?.rateBenchmark.length) {
    const biggestGap = [...analytics.rateBenchmark].sort(
      (a, b) => Math.abs(b.venueAvgRate - b.platformAvgRate) - Math.abs(a.venueAvgRate - a.platformAvgRate)
    )[0];
    const diff = biggestGap ? biggestGap.venueAvgRate - biggestGap.platformAvgRate : 0;
    if (biggestGap && Math.abs(diff) >= 0.5) {
      insights.push(
        `You pay ${WORKER_ROLE_LABELS[biggestGap.role]} £${Math.abs(diff).toFixed(2)}/hr ${diff > 0 ? "above" : "below"} the platform average.`
      );
    }
  }
  if (trust && trust.feedbackCount > 0) {
    insights.push(
      `Workers rate you ${trust.trustTier} (${trust.trustScore}), based on ${trust.feedbackCount} shift rating${trust.feedbackCount === 1 ? "" : "s"}.`
    );
  }

  const maxPredicted = forecast
    ? Math.max(1, ...forecast.forecast.map((f) => f.predictedShifts))
    : 1;

  const trustBreakdown =
    recentFeedback && recentFeedback.length > 0
      ? {
          paidOnTime: Math.round((recentFeedback.filter((f) => f.paidOnTime).length / recentFeedback.length) * 100),
          breaksGiven: Math.round((recentFeedback.filter((f) => f.breaksGiven).length / recentFeedback.length) * 100),
          matchedDescription: Math.round(
            (recentFeedback.filter((f) => f.matchedDescription).length / recentFeedback.length) * 100
          ),
        }
      : null;

  return (
    <div className="page">
      <AppHeader links={[{ href: "/venue/shifts", label: "Your shifts" }]} />
      <div className="content">
        <h1 style={{ fontSize: "22px", marginBottom: "18px" }}>Analytics</h1>
        {error && <p className="mono text-error" style={{ fontSize: "12.5px" }}>{error}</p>}

        {insights.length > 0 && (
          <div className="insights-card">
            <div className="section-title" style={{ marginTop: 0 }}>Insights for you</div>
            {insights.map((text, i) => (
              <div className="insight-row" key={i}>
                <span className="insight-icon">💡</span>
                <span>{text}</span>
              </div>
            ))}
          </div>
        )}

        {forecast && (
          <>
            <div className="section-title" style={{ marginTop: 0 }}>Demand forecast — next 7 days</div>
            <p className="text-muted" style={{ fontSize: "12.5px", marginTop: 0, marginBottom: "10px" }}>{forecast.basis}</p>
            <div className="forecast-strip">
              {forecast.forecast.map((f) => {
                const spike = f.predictedShifts >= maxPredicted * 0.8 && f.predictedShifts > 0;
                const d = new Date(f.date + "T00:00:00Z");
                return (
                  <div key={f.date} className={`forecast-day ${spike ? "spike" : ""}`}>
                    <div className="fd-day">{DAY_LABEL[d.getUTCDay()]}</div>
                    <div className="fd-date">{d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</div>
                    <div className="fd-bar-track">
                      <div className="fd-bar-fill" style={{ height: `${Math.max(4, (f.predictedShifts / maxPredicted) * 100)}%` }} />
                    </div>
                    <div className="fd-count">{f.predictedShifts}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {trust && trust.feedbackCount > 0 && (
          <>
            <div className="section-title">Your worker trust score</div>
            <p className="text-muted" style={{ fontSize: "12.5px", marginTop: 0 }}>
              What candidates see about your venue before accepting a shift — workers answer three quick yes/no
              questions after each shift; you never see who said what, only the aggregate.
            </p>
            <div className="card-dark score-hero">
              <div className="score-stamp">
                <div className="num">{trust.trustScore ?? "—"}</div>
                <div className="tag">{trust.trustTier}</div>
              </div>
              <div className="score-copy">
                <div className="lbl">Trust score, from worker feedback</div>
                <p>Based on {trust.feedbackCount} rated shift{trust.feedbackCount === 1 ? "" : "s"}.</p>
              </div>
            </div>

            {trustBreakdown && (
              <div className="stat-grid">
                <div className="stat-tile">
                  <div className="stat-label">Paid on time</div>
                  <div className="stat-value">{trustBreakdown.paidOnTime}%</div>
                </div>
                <div className="stat-tile">
                  <div className="stat-label">Breaks given</div>
                  <div className="stat-value">{trustBreakdown.breaksGiven}%</div>
                </div>
                <div className="stat-tile">
                  <div className="stat-label">Matched description</div>
                  <div className="stat-value">{trustBreakdown.matchedDescription}%</div>
                </div>
              </div>
            )}

            {recentFeedback && recentFeedback.some((f) => f.comment) && (
              <>
                <div className="section-title">Recent worker feedback</div>
                <div className="card">
                  {recentFeedback
                    .filter((f) => f.comment)
                    .map((f) => (
                      <div className="comment-row" key={f.id}>
                        <div className="comment-flags">
                          <span className={`comment-flag ${f.paidOnTime ? "yes" : "no"}`}>
                            {f.paidOnTime ? "Paid on time" : "Not paid on time"}
                          </span>
                          <span className={`comment-flag ${f.breaksGiven ? "yes" : "no"}`}>
                            {f.breaksGiven ? "Breaks given" : "Breaks missed"}
                          </span>
                          <span className={`comment-flag ${f.matchedDescription ? "yes" : "no"}`}>
                            {f.matchedDescription ? "As described" : "Didn't match"}
                          </span>
                        </div>
                        <div className="comment-text">{f.comment}</div>
                        <div className="comment-date">{new Date(f.submittedAt).toLocaleDateString("en-GB")}</div>
                      </div>
                    ))}
                </div>
              </>
            )}
          </>
        )}

        {analytics && (
          <>
            <div className="section-title">Fill rate</div>
            <div className="stat-tile" style={{ marginBottom: "20px" }}>
              <div className="stat-label">Of posted shifts filled</div>
              <div
                className="stat-value"
                style={
                  analytics.fillRate !== null
                    ? { color: analytics.fillRate >= 0.8 ? "var(--green)" : "var(--amber-deep)" }
                    : undefined
                }
              >
                {analytics.fillRate === null ? "—" : `${Math.round(analytics.fillRate * 100)}%`}
              </div>
            </div>

            <div className="section-title">No-show trend (last 8 weeks)</div>
            <div className="trend-strip">
              {analytics.noShowTrend.map((w) => {
                const hasData = w.shiftCount > 0;
                const pct = w.noShowRate === null ? null : Math.round(w.noShowRate * 100);
                const severity = pct === null ? "" : pct >= 20 ? "bad" : pct >= 10 ? "warn" : "";
                const weekDate = new Date(w.weekStart + "T00:00:00Z");
                return (
                  <div key={w.weekStart} className="trend-week">
                    <div className="trend-week-label">
                      {weekDate.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </div>
                    <div className="trend-bar-track">
                      {hasData && (
                        <div
                          className={`trend-bar-fill ${severity}`}
                          style={{ height: `${Math.max(4, pct ?? 0)}%` }}
                        />
                      )}
                    </div>
                    <div className="trend-pct">{pct === null ? "—" : `${pct}%`}</div>
                    <div className="trend-count">{w.shiftCount} shift{w.shiftCount === 1 ? "" : "s"}</div>
                  </div>
                );
              })}
            </div>

            <div className="section-title">Rate benchmark</div>
            {analytics.rateBenchmark.length === 0 ? (
              <p className="text-muted">Post a shift to see how your rates compare.</p>
            ) : (
              <div className="card">
                {analytics.rateBenchmark.map((r) => {
                  const max = Math.max(r.venueAvgRate, r.platformAvgRate, 1);
                  return (
                    <div className="benchmark-row" key={r.role}>
                      <div className="benchmark-role">{WORKER_ROLE_LABELS[r.role]}</div>
                      <div className="benchmark-bars">
                        <div className="benchmark-bar-line">
                          <span className="benchmark-bar-label">You</span>
                          <div className="benchmark-bar-track">
                            <div
                              className="benchmark-bar-fill venue"
                              style={{ width: `${(r.venueAvgRate / max) * 100}%` }}
                            />
                          </div>
                          <span className="benchmark-bar-value">£{r.venueAvgRate}/hr</span>
                        </div>
                        <div className="benchmark-bar-line">
                          <span className="benchmark-bar-label">Platform</span>
                          <div className="benchmark-bar-track">
                            <div
                              className="benchmark-bar-fill platform"
                              style={{ width: `${(r.platformAvgRate / max) * 100}%` }}
                            />
                          </div>
                          <span className="benchmark-bar-value">£{r.platformAvgRate}/hr</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
