import crypto from "crypto";

// Plain fetch against Persona's REST API, same reasoning as the old
// Onfido integration it replaces: a standard documented JSON:API, no
// need for a client library. Persona's flow is redirect-based (create
// an Inquiry, send the worker to its one-time hosted link, Persona
// posts back to our webhook) rather than raw document upload — same
// shape as the Stripe Connect/Checkout redirects elsewhere in this app.
const BASE_URL = "https://api.withpersona.com/api/v1";

function getApiKey(): string {
  const key = process.env.PERSONA_API_KEY;
  if (!key) {
    throw new Error("PERSONA_API_KEY is not set — see .env.example.");
  }
  return key;
}

function getTemplateId(): string {
  const id = process.env.PERSONA_INQUIRY_TEMPLATE_ID;
  if (!id) {
    throw new Error("PERSONA_INQUIRY_TEMPLATE_ID is not set — see .env.example.");
  }
  return id;
}

async function personaFetch(path: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Persona API error ${res.status} on ${path}: ${body}`);
  }
  return res.json();
}

export interface PersonaInquiry {
  id: string;
  status: string;
  oneTimeLink: string | null;
}

interface InquiryResponse {
  data: { id: string; attributes: { status: string } };
  meta?: { "one-time-link"?: string | null };
}

/**
 * Creates a new Inquiry and a one-time hosted-flow link in the same
 * call. The worker is redirected to that link to do document + selfie
 * capture directly with Persona — we never handle the raw files.
 */
export async function createInquiry(
  firstName: string,
  lastName: string,
  dob: string, // "YYYY-MM-DD"
  redirectUri: string
): Promise<PersonaInquiry> {
  const body = (await personaFetch("/inquiries", {
    method: "POST",
    body: JSON.stringify({
      data: {
        attributes: {
          "inquiry-template-id": getTemplateId(),
          "redirect-uri": redirectUri,
          fields: {
            "name-first": firstName,
            "name-last": lastName,
            birthdate: dob,
          },
        },
      },
      meta: { "auto-create-one-time-link": true },
    }),
  })) as InquiryResponse;
  return {
    id: body.data.id,
    status: body.data.attributes.status,
    oneTimeLink: body.meta?.["one-time-link"] ?? null,
  };
}

/** Resumes an existing (not-yet-completed) Inquiry with a fresh link. */
export async function generateOneTimeLink(inquiryId: string): Promise<string> {
  const body = (await personaFetch(`/inquiries/${inquiryId}/generate-one-time-link`, {
    method: "POST",
    body: JSON.stringify({}),
  })) as InquiryResponse;
  if (!body.meta?.["one-time-link"]) {
    throw new Error(`Persona did not return a one-time-link for ${inquiryId}`);
  }
  return body.meta["one-time-link"];
}

export async function retrieveInquiry(inquiryId: string): Promise<{ id: string; status: string }> {
  const body = (await personaFetch(`/inquiries/${inquiryId}`, { method: "GET" })) as InquiryResponse;
  return { id: body.data.id, status: body.data.attributes.status };
}

/**
 * Persona signs webhook payloads as HMAC-SHA256 over
 * "{timestamp}.{rawBody}", sent as `Persona-Signature:
 * t=<timestamp>,v1=<hex>` (possibly multiple space-separated v1 entries
 * during secret rotation — any match is accepted).
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.PERSONA_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return false;

  const pairs = signatureHeader.split(" ");
  const timestamp = pairs[0]?.split(",")[0]?.split("=")[1];
  if (!timestamp) return false;

  const signatures = pairs
    .map((pair) => pair.match(/v1=([^,]+)/)?.[1])
    .filter((sig): sig is string => Boolean(sig));
  if (signatures.length === 0) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  const expectedBuf = Buffer.from(expected);

  return signatures.some((sig) => {
    const sigBuf = Buffer.from(sig);
    return expectedBuf.length === sigBuf.length && crypto.timingSafeEqual(expectedBuf, sigBuf);
  });
}
