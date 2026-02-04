import crypto from "crypto";

import type { Provider, StatusReason, VerificationResult } from "@/lib/signature-verification";

export interface VerificationTokenPayload {
  v: 1;
  userId: string;
  provider: Provider;
  rawBodySha256: string;
  issuedAt: number; // seconds since epoch
  result: Pick<VerificationResult, "status" | "reason" | "method" | "error" | "secretHint" | "providerEventId" | "toleranceUsedSec">;
}

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(input: string): Buffer {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  return Buffer.from(b64 + pad, "base64");
}

function hmacSha256(secret: string, data: string): Buffer {
  return crypto.createHmac("sha256", secret).update(data).digest();
}

export function signVerificationToken(payload: VerificationTokenPayload): string {
  const secret = process.env.VERIFICATION_TOKEN_SECRET;
  if (!secret) {
    throw new Error("Missing VERIFICATION_TOKEN_SECRET");
  }

  const body = base64UrlEncode(JSON.stringify(payload));
  const sig = base64UrlEncode(hmacSha256(secret, body));
  return `${body}.${sig}`;
}

export function verifyVerificationToken(token: string): VerificationTokenPayload {
  const secret = process.env.VERIFICATION_TOKEN_SECRET;
  if (!secret) {
    throw new Error("Missing VERIFICATION_TOKEN_SECRET");
  }

  const [body, sig] = token.split(".");
  if (!body || !sig) {
    throw new Error("Invalid verification token format");
  }

  const expectedSig = base64UrlEncode(hmacSha256(secret, body));
  if (sig.length !== expectedSig.length) {
    throw new Error("Invalid verification token signature");
  }
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
    throw new Error("Invalid verification token signature");
  }

  const decoded = JSON.parse(base64UrlDecode(body).toString("utf8")) as VerificationTokenPayload;
  if (decoded.v !== 1) {
    throw new Error("Unsupported verification token version");
  }

  const maxAgeSec = parseInt(process.env.VERIFICATION_TOKEN_MAX_AGE_SEC || "900", 10);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(decoded.issuedAt) || now - decoded.issuedAt > maxAgeSec) {
    throw new Error("Verification token expired");
  }

  if (!decoded.userId) {
    throw new Error("Verification token missing userId");
  }

  const status = decoded.result?.status;
  if (status !== "verified" && status !== "failed" && status !== "not_verified") {
    throw new Error("Verification token has invalid status");
  }

  const reason = decoded.result?.reason;
  const allowedReasons: StatusReason[] = [
    "missing_header",
    "missing_secret",
    "unsupported_provider",
    "mismatch",
    "malformed_signature",
    "timestamp_expired",
    "duplicate",
  ];
  if (reason && !allowedReasons.includes(reason)) {
    throw new Error("Verification token has invalid reason");
  }

  if (!decoded.rawBodySha256 || typeof decoded.rawBodySha256 !== "string") {
    throw new Error("Verification token missing rawBodySha256");
  }

  return decoded;
}
