"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { WORKER_ROLE_LABELS, type WorkerRoleKey } from "@/lib/types";
import { AppHeader } from "@/components/AppHeader";

interface ChargeRow {
  id: string;
  shiftId: string;
  role: WorkerRoleKey;
  date: string;
  totalAmountCents: number;
  commissionAmountCents: number;
  status: string;
  venueChargeFailed: boolean;
  venueChargeFailureReason: string | null;
}

interface Billing {
  paymentMethodConnected: boolean;
  commissionRate: number;
  isNegotiatedRate: boolean;
  charges: ChargeRow[];
}

export default function VenueBillingPage() {
  const [billing, setBilling] = useState<Billing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  async function load() {
    const res = await fetch("/api/venues/me/billing");
    if (!res.ok) {
      setError("Could not load billing — are you logged in as a venue?");
      return;
    }
    setBilling(await res.json());
  }

  useEffect(() => {
    load();
  }, []);

  async function connectPaymentMethod() {
    setConnecting(true);
    setError(null);
    const res = await fetch("/api/venues/me/stripe/setup-checkout", { method: "POST" });
    setConnecting(false);
    if (!res.ok) {
      setError("Could not start payment method setup.");
      return;
    }
    const body = await res.json();
    window.location.href = body.url;
  }

  return (
    <div className="page">
      <AppHeader
        links={[
          { href: "/venue/shifts", label: "Your shifts" },
          { href: "/venue/analytics", label: "Analytics" },
          { href: "/venue/disputes", label: "Disputes" },
        ]}
      />
      <div className="content">
        <h1 style={{ fontSize: "22px", marginBottom: "18px" }}>Billing</h1>
        {error && <p className="mono text-error" style={{ fontSize: "12.5px" }}>{error}</p>}

        {billing && (
          <>
            {!billing.paymentMethodConnected && (
              <div className="connect-nudge">
                <div className="connect-nudge-icon">💳</div>
                <div className="connect-nudge-copy">
                  <div className="title">Add a payment method</div>
                  <p>Shifts won&apos;t be charged until a card is on file with Stripe.</p>
                </div>
                <button className="btn primary" disabled={connecting} onClick={connectPaymentMethod}>
                  {connecting ? "Redirecting…" : "Add payment method"}
                </button>
              </div>
            )}

            <div className="stat-grid" style={{ marginBottom: billing.paymentMethodConnected ? "10px" : "20px" }}>
              <div className="stat-tile">
                <div className="stat-label">Payment method</div>
                <div
                  className="stat-value"
                  style={{ fontSize: "16px", color: billing.paymentMethodConnected ? "var(--green)" : "var(--amber-deep)" }}
                >
                  {billing.paymentMethodConnected ? "On file" : "Not connected"}
                </div>
              </div>
              <div className="stat-tile">
                <div className="stat-label">Commission rate</div>
                <div className="stat-value">{Math.round(billing.commissionRate * 100)}%</div>
                {billing.isNegotiatedRate && (
                  <div className="text-muted" style={{ fontSize: "10.5px", marginTop: "4px" }}>Negotiated rate</div>
                )}
              </div>
            </div>

            {billing.paymentMethodConnected && (
              <button
                className="btn ghost"
                disabled={connecting}
                onClick={connectPaymentMethod}
                style={{ marginBottom: "20px" }}
              >
                {connecting ? "Redirecting…" : "Replace payment method"}
              </button>
            )}

            <div className="section-title" style={{ marginTop: 0 }}>Charge history</div>
            {billing.charges.length === 0 ? (
              <p className="text-muted">No charges yet.</p>
            ) : (
              <div className="card" style={{ overflowX: "auto" }}>
                <table>
                  <thead>
                    <tr>
                      <th>Shift</th>
                      <th>Date</th>
                      <th>Total</th>
                      <th>Commission</th>
                      <th>Card charge</th>
                    </tr>
                  </thead>
                  <tbody>
                    {billing.charges.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <Link href={`/venue/shifts/${c.shiftId}`}>{WORKER_ROLE_LABELS[c.role]}</Link>
                        </td>
                        <td>{new Date(c.date).toLocaleDateString("en-GB")}</td>
                        <td>£{(c.totalAmountCents / 100).toFixed(2)}</td>
                        <td>£{(c.commissionAmountCents / 100).toFixed(2)}</td>
                        <td>
                          <span className={`badge ${c.venueChargeFailed ? "rejected" : "confirmed"}`}>
                            {c.venueChargeFailed ? "failed" : "succeeded"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
