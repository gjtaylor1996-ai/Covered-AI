"use client";

import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { WORKER_ROLE_LABELS, type WorkerRoleKey } from "@/lib/types";

interface WorkerRow {
  id: string;
  name: string;
  email: string;
  role: WorkerRoleKey | null;
  createdAt: string;
  onboarded: boolean;
  verified: boolean;
  payoutConnected: boolean;
}

interface VenueRow {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  onboarded: boolean;
  paymentConnected: boolean;
}

interface Signups {
  workers: WorkerRow[];
  venues: VenueRow[];
}

type SortDir = "asc" | "desc";

function compare(a: unknown, b: unknown): number {
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return String(a).localeCompare(String(b));
}

function statusBadge(ok: boolean) {
  return <span className={`badge ${ok ? "confirmed" : "pending"}`} style={{ marginTop: 0 }}>{ok ? "yes" : "no"}</span>;
}

function sortArrow(active: boolean, dir: SortDir) {
  if (!active) return null;
  return <span style={{ marginLeft: "4px" }}>{dir === "asc" ? "▲" : "▼"}</span>;
}

function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminSignupsPage() {
  const [data, setData] = useState<Signups | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [workerSortKey, setWorkerSortKey] = useState<keyof WorkerRow>("createdAt");
  const [workerSortDir, setWorkerSortDir] = useState<SortDir>("desc");
  const [venueSortKey, setVenueSortKey] = useState<keyof VenueRow>("createdAt");
  const [venueSortDir, setVenueSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    fetch("/api/admin/signups")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError("Could not load signups — are you logged in as an admin?"));
  }, []);

  function toggleWorkerSort(key: keyof WorkerRow) {
    if (key === workerSortKey) setWorkerSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setWorkerSortKey(key);
      setWorkerSortDir("desc");
    }
  }

  function toggleVenueSort(key: keyof VenueRow) {
    if (key === venueSortKey) setVenueSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setVenueSortKey(key);
      setVenueSortDir("desc");
    }
  }

  const sortedWorkers = useMemo(() => {
    if (!data) return [];
    const rows = [...data.workers];
    rows.sort((a, b) => compare(a[workerSortKey], b[workerSortKey]) * (workerSortDir === "asc" ? 1 : -1));
    return rows;
  }, [data, workerSortKey, workerSortDir]);

  const sortedVenues = useMemo(() => {
    if (!data) return [];
    const rows = [...data.venues];
    rows.sort((a, b) => compare(a[venueSortKey], b[venueSortKey]) * (venueSortDir === "asc" ? 1 : -1));
    return rows;
  }, [data, venueSortKey, venueSortDir]);

  return (
    <div className="page">
      <AppHeader
        links={[
          { href: "/admin", label: "Admin" },
          { href: "/admin/verification", label: "Verification" },
          { href: "/admin/disputes", label: "Disputes" },
          { href: "/admin/dashboard", label: "Dashboard" },
        ]}
      />
      <div className="content">
        <h1 style={{ fontSize: "22px", marginBottom: "8px" }}>Signups</h1>
        <p className="text-muted why-box" style={{ marginTop: 0 }}>
          Every worker and venue signup, current as of this page load. Click a column header to sort.
          Admin-only — never shown to workers or venues.
        </p>
        {error && <p className="mono text-error" style={{ fontSize: "12.5px" }}>{error}</p>}

        {data && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "26px" }}>
              <div className="section-title" style={{ margin: 0 }}>Workers ({data.workers.length})</div>
              <button
                className="btn ghost"
                onClick={() =>
                  downloadCsv(
                    "worker-signups.csv",
                    ["Name", "Email", "Role", "Signed up", "Onboarded", "Verified", "Payout connected"],
                    sortedWorkers.map((w) => [
                      w.name,
                      w.email,
                      w.role ? WORKER_ROLE_LABELS[w.role] : "",
                      new Date(w.createdAt).toISOString().slice(0, 10),
                      w.onboarded ? "yes" : "no",
                      w.verified ? "yes" : "no",
                      w.payoutConnected ? "yes" : "no",
                    ])
                  )
                }
              >
                Export CSV
              </button>
            </div>
            {sortedWorkers.length === 0 ? (
              <p className="text-muted">No worker signups yet.</p>
            ) : (
              <div className="card" style={{ overflowX: "auto" }}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ cursor: "pointer" }} onClick={() => toggleWorkerSort("name")}>
                        Name{sortArrow(workerSortKey === "name", workerSortDir)}
                      </th>
                      <th style={{ cursor: "pointer" }} onClick={() => toggleWorkerSort("email")}>
                        Email{sortArrow(workerSortKey === "email", workerSortDir)}
                      </th>
                      <th style={{ cursor: "pointer" }} onClick={() => toggleWorkerSort("role")}>
                        Role{sortArrow(workerSortKey === "role", workerSortDir)}
                      </th>
                      <th style={{ cursor: "pointer" }} onClick={() => toggleWorkerSort("createdAt")}>
                        Signed up{sortArrow(workerSortKey === "createdAt", workerSortDir)}
                      </th>
                      <th style={{ cursor: "pointer" }} onClick={() => toggleWorkerSort("onboarded")}>
                        Onboarded{sortArrow(workerSortKey === "onboarded", workerSortDir)}
                      </th>
                      <th style={{ cursor: "pointer" }} onClick={() => toggleWorkerSort("verified")}>
                        Verified{sortArrow(workerSortKey === "verified", workerSortDir)}
                      </th>
                      <th style={{ cursor: "pointer" }} onClick={() => toggleWorkerSort("payoutConnected")}>
                        Payout{sortArrow(workerSortKey === "payoutConnected", workerSortDir)}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedWorkers.map((w) => (
                      <tr key={w.id}>
                        <td>{w.name}</td>
                        <td>{w.email}</td>
                        <td>{w.role ? WORKER_ROLE_LABELS[w.role] : "—"}</td>
                        <td>{new Date(w.createdAt).toLocaleDateString("en-GB")}</td>
                        <td>{statusBadge(w.onboarded)}</td>
                        <td>{statusBadge(w.verified)}</td>
                        <td>{statusBadge(w.payoutConnected)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "26px" }}>
              <div className="section-title" style={{ margin: 0 }}>Venues ({data.venues.length})</div>
              <button
                className="btn ghost"
                onClick={() =>
                  downloadCsv(
                    "venue-signups.csv",
                    ["Name", "Email", "Signed up", "Onboarded", "Payment method"],
                    sortedVenues.map((v) => [
                      v.name,
                      v.email,
                      new Date(v.createdAt).toISOString().slice(0, 10),
                      v.onboarded ? "yes" : "no",
                      v.paymentConnected ? "yes" : "no",
                    ])
                  )
                }
              >
                Export CSV
              </button>
            </div>
            {sortedVenues.length === 0 ? (
              <p className="text-muted">No venue signups yet.</p>
            ) : (
              <div className="card" style={{ overflowX: "auto" }}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ cursor: "pointer" }} onClick={() => toggleVenueSort("name")}>
                        Name{sortArrow(venueSortKey === "name", venueSortDir)}
                      </th>
                      <th style={{ cursor: "pointer" }} onClick={() => toggleVenueSort("email")}>
                        Email{sortArrow(venueSortKey === "email", venueSortDir)}
                      </th>
                      <th style={{ cursor: "pointer" }} onClick={() => toggleVenueSort("createdAt")}>
                        Signed up{sortArrow(venueSortKey === "createdAt", venueSortDir)}
                      </th>
                      <th style={{ cursor: "pointer" }} onClick={() => toggleVenueSort("onboarded")}>
                        Onboarded{sortArrow(venueSortKey === "onboarded", venueSortDir)}
                      </th>
                      <th style={{ cursor: "pointer" }} onClick={() => toggleVenueSort("paymentConnected")}>
                        Payment method{sortArrow(venueSortKey === "paymentConnected", venueSortDir)}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedVenues.map((v) => (
                      <tr key={v.id}>
                        <td>{v.name}</td>
                        <td>{v.email}</td>
                        <td>{new Date(v.createdAt).toLocaleDateString("en-GB")}</td>
                        <td>{statusBadge(v.onboarded)}</td>
                        <td>{statusBadge(v.paymentConnected)}</td>
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
