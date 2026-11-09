// Imports the outreach target list into HubSpot as companies at stage
// "Prospect" (plus a contact where the list has an email), so outreach and
// signed-up venues live in one pipeline. Idempotent — a company already
// in HubSpot with the same name is updated, not duplicated, and one that
// has already signed up is never moved back to Prospect.
// Usage: node scripts/hubspot-import-prospects.js <path-to-csv> [--dry-run]
// CSV columns: Rank, Venue, Type, Area, Fit tier, Website (from source
// listing), Contact name, Contact email (from venue site), First-line
// personalisation. Needs HUBSPOT_ACCESS_TOKEN and the properties from
// scripts/hubspot-setup.js.

const fs = require("node:fs");

try {
  process.loadEnvFile();
} catch {}

const token = process.env.HUBSPOT_ACCESS_TOKEN;
const csvPath = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
if (!csvPath) {
  console.error("Usage: node scripts/hubspot-import-prospects.js <csv> [--dry-run]");
  process.exit(1);
}
if (!token && !dryRun) {
  console.error("HUBSPOT_ACCESS_TOKEN is not set.");
  process.exit(1);
}
const base = process.env.HUBSPOT_API_BASE || "https://api.hubapi.com";

// Minimal RFC 4180 parser — quoted fields, doubled quotes, newlines in fields.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

async function hs(method, path, body, okStatuses = []) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok && !okStatuses.includes(res.status)) {
    throw new Error(`${method} ${path} -> ${res.status}: ${data?.message ?? text}`);
  }
  return { status: res.status, data };
}

async function main() {
  const rows = parseCsv(fs.readFileSync(csvPath, "utf8").replace(/^﻿/, ""));
  const header = rows.shift();
  const col = (name) => header.findIndex((h) => h.trim().toLowerCase().startsWith(name.toLowerCase()));
  const idx = {
    rank: col("Rank"),
    venue: col("Venue"),
    type: col("Type"),
    area: col("Area"),
    tier: col("Fit tier"),
    website: col("Website"),
    contactName: col("Contact name"),
    contactEmail: col("Contact email"),
    firstLine: col("First-line"),
  };
  for (const [k, v] of Object.entries(idx)) {
    if (v === -1) throw new Error(`CSV is missing a "${k}" column`);
  }
  // Optional columns (present in the South West London list): why the venue
  // counts as independent, kept on the company's description.
  const basisIdx = col("Independence basis");
  const confIdx = col("Independence confidence");

  let created = 0;
  let updated = 0;
  let skippedSignedUp = 0;
  let contacts = 0;

  for (const r of rows) {
    const name = r[idx.venue].trim();
    if (!name) continue;
    const props = {
      name,
      city: "London",
      covered_rank: Number(r[idx.rank]) || undefined,
      covered_fit_tier: r[idx.tier].trim() || undefined,
      covered_venue_type: r[idx.type].trim() || undefined,
      covered_area: r[idx.area].trim() || undefined,
      covered_first_line: r[idx.firstLine].trim() || undefined,
      domain: domainOf(r[idx.website].trim()) || undefined,
      description:
        basisIdx !== -1 && r[basisIdx].trim()
          ? `Independent: ${r[basisIdx].trim()}${confIdx !== -1 && r[confIdx].trim() ? ` (confidence: ${r[confIdx].trim()})` : ""}`
          : undefined,
    };
    Object.keys(props).forEach((k) => props[k] === undefined && delete props[k]);

    if (dryRun) {
      console.log("would import", name, props.domain ?? "", r[idx.contactEmail].trim() ? "(+contact)" : "");
      continue;
    }

    const found = await hs("POST", "/crm/v3/objects/companies/search", {
      filterGroups: [{ filters: [{ propertyName: "name", operator: "EQ", value: name }] }],
      properties: ["covered_stage", "covered_venue_id"],
      limit: 1,
    });
    const existing = found.data.results[0];
    let companyId;
    if (existing) {
      companyId = existing.id;
      // Never drag a venue that has already signed up back to Prospect.
      const signedUp = Boolean(existing.properties.covered_venue_id);
      const update = signedUp ? {} : { ...props, covered_stage: "prospect" };
      if (signedUp) skippedSignedUp += 1;
      else {
        await hs("PATCH", `/crm/v3/objects/companies/${companyId}`, { properties: update });
        updated += 1;
      }
    } else {
      const made = await hs("POST", "/crm/v3/objects/companies", {
        properties: { ...props, covered_stage: "prospect" },
      });
      companyId = made.data.id;
      created += 1;
    }

    const email = r[idx.contactEmail].trim();
    if (email.includes("@")) {
      const [first, ...rest] = r[idx.contactName].trim().split(/\s+/);
      const contactProps = { email, company: name };
      if (first) contactProps.firstname = first;
      if (rest.length) contactProps.lastname = rest.join(" ");
      const patched = await hs(
        "PATCH",
        `/crm/v3/objects/contacts/${encodeURIComponent(email)}?idProperty=email`,
        { properties: contactProps },
        [404]
      );
      const contactId =
        patched.status === 404
          ? (await hs("POST", "/crm/v3/objects/contacts", { properties: contactProps })).data.id
          : patched.data.id;
      await hs("PUT", `/crm/v4/objects/contacts/${contactId}/associations/default/companies/${companyId}`);
      contacts += 1;
    }
  }

  if (!dryRun) {
    console.log(
      `Done: ${created} created, ${updated} updated, ${skippedSignedUp} left alone (already signed up), ${contacts} contacts linked.`
    );
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
