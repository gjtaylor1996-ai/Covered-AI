// One-off HubSpot setup: creates the custom company properties the venue
// sync and the prospect import write to. Idempotent — properties that
// already exist are skipped, so it is safe to re-run.
// Usage: node scripts/hubspot-setup.js
// Needs HUBSPOT_ACCESS_TOKEN (loaded from .env if present) with the
// crm.schemas.companies.write scope. Stage values must stay in sync with
// VENUE_STAGES in src/lib/hubspot.ts.

try {
  process.loadEnvFile();
} catch {}

const token = process.env.HUBSPOT_ACCESS_TOKEN;
if (!token) {
  console.error("HUBSPOT_ACCESS_TOKEN is not set.");
  process.exit(1);
}
const base = process.env.HUBSPOT_API_BASE || "https://api.hubapi.com";

const STAGES = [
  ["prospect", "Prospect"],
  ["signed_up", "Signed up"],
  ["onboarded", "Onboarded"],
  ["payment_started", "Payment set-up started"],
  ["first_shift_posted", "First shift posted"],
  ["first_shift_completed", "First shift completed"],
];

const GROUP = "companyinformation";
const PROPERTIES = [
  {
    name: "covered_stage",
    label: "Covered stage",
    type: "enumeration",
    fieldType: "select",
    options: STAGES.map(([value, label], i) => ({ value, label, displayOrder: i })),
  },
  { name: "covered_venue_id", label: "Covered venue ID", type: "string", fieldType: "text" },
  { name: "covered_signed_up_at", label: "Covered signed up", type: "date", fieldType: "date" },
  { name: "covered_shifts_posted", label: "Covered shifts posted", type: "number", fieldType: "number" },
  { name: "covered_shifts_completed", label: "Covered shifts completed", type: "number", fieldType: "number" },
  { name: "covered_rank", label: "Outreach rank", type: "number", fieldType: "number" },
  { name: "covered_fit_tier", label: "Outreach fit tier", type: "string", fieldType: "text" },
  { name: "covered_venue_type", label: "Venue type", type: "string", fieldType: "text" },
  { name: "covered_area", label: "London area", type: "string", fieldType: "text" },
  { name: "covered_first_line", label: "Outreach first line", type: "string", fieldType: "textarea" },
];

async function main() {
  for (const prop of PROPERTIES) {
    const res = await fetch(`${base}/crm/v3/properties/companies`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...prop, groupName: GROUP }),
    });
    if (res.status === 201) console.log("created ", prop.name);
    else if (res.status === 409) console.log("exists  ", prop.name);
    else {
      console.error("FAILED  ", prop.name, res.status, await res.text());
      process.exitCode = 1;
    }
  }
}

main();
