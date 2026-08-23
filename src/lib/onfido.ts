import crypto from "crypto";

// Plain fetch against Onfido's REST API rather than their SDK — keeps
// this auditable without depending on a package whose current shape I
// can't verify here, and Onfido's API is a standard documented REST
// API with no need for a client library. EU region by default (UK
// company); ONFIDO_REGION can override for us/ca.
function getBaseUrl(): string {
  const region = process.env.ONFIDO_REGION || "eu";
  return `https://api.${region}.onfido.com/v3.6`;
}

function getApiToken(): string {
  const token = process.env.ONFIDO_API_TOKEN;
  if (!token) {
    throw new Error("ONFIDO_API_TOKEN is not set — see .env.example.");
  }
  return token;
}

async function onfidoFetch(path: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(`${getBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Token token=${getApiToken()}`,
      ...init.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Onfido API error ${res.status} on ${path}: ${body}`);
  }
  return res.json();
}

export interface OnfidoApplicant {
  id: string;
}

export async function createApplicant(
  firstName: string,
  lastName: string,
  dob: string // "YYYY-MM-DD"
): Promise<OnfidoApplicant> {
  return onfidoFetch("/applicants", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ first_name: firstName, last_name: lastName, dob }),
  }) as Promise<OnfidoApplicant>;
}

async function uploadFile(
  path: string,
  applicantId: string,
  file: File,
  extraFields: Record<string, string>
): Promise<{ id: string }> {
  const form = new FormData();
  form.append("applicant_id", applicantId);
  for (const [key, value] of Object.entries(extraFields)) form.append(key, value);
  form.append("file", file);
  return onfidoFetch(path, { method: "POST", body: form }) as Promise<{ id: string }>;
}

export async function uploadDocument(
  applicantId: string,
  file: File,
  side: "front" | "back",
  type = "passport"
): Promise<{ id: string }> {
  return uploadFile("/documents", applicantId, file, { type, side });
}

export async function uploadLivePhoto(
  applicantId: string,
  file: File
): Promise<{ id: string }> {
  return uploadFile("/live_photos", applicantId, file, {});
}

export interface OnfidoCheck {
  id: string;
  status: string;
}

export async function createCheck(applicantId: string): Promise<OnfidoCheck> {
  return onfidoFetch("/checks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      applicant_id: applicantId,
      report_names: ["document", "facial_similarity_photo"],
    }),
  }) as Promise<OnfidoCheck>;
}

export interface OnfidoCheckResult {
  id: string;
  status: string;
  result: "clear" | "consider" | null;
}

export async function retrieveCheck(checkId: string): Promise<OnfidoCheckResult> {
  return onfidoFetch(`/checks/${checkId}`, { method: "GET" }) as Promise<OnfidoCheckResult>;
}

/** Onfido signs webhook payloads with HMAC-SHA256 over the raw body. */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const webhookToken = process.env.ONFIDO_WEBHOOK_TOKEN;
  if (!webhookToken || !signatureHeader) return false;
  const expected = crypto.createHmac("sha256", webhookToken).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
