#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";

const [property, sitemapUrl] = process.argv.slice(2);
const credentialPath = process.env.SERPSMITH_GSC_CREDENTIALS;

function fail(code, cls) {
  process.stderr.write(`gsc_submit result=failed class=${cls}\n`);
  process.exit(code);
}
function b64url(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return buffer.toString("base64url");
}

if (!property || !sitemapUrl || !credentialPath) fail(64, "usage_or_configuration");
if (!(property.startsWith("sc-domain:") || property.startsWith("https://"))) fail(64, "invalid_property");
if (!sitemapUrl.startsWith("https://")) fail(64, "invalid_sitemap_url");

let credential;
try {
  credential = JSON.parse(fs.readFileSync(credentialPath, "utf8"));
} catch {
  fail(77, "credential_unreadable");
}
const { client_email: clientEmail, private_key: privateKey, token_uri: tokenUri } = credential;
if (!clientEmail || !privateKey || !tokenUri) fail(77, "credential_invalid");

const now = Math.floor(Date.now() / 1000);
const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
const claims = b64url(JSON.stringify({
  iss: clientEmail,
  scope: "https://www.googleapis.com/auth/webmasters",
  aud: tokenUri,
  iat: now,
  exp: now + 3600
}));
const unsigned = `${header}.${claims}`;
let signature;
try {
  signature = crypto.sign("RSA-SHA256", Buffer.from(unsigned), privateKey);
} catch {
  fail(77, "credential_signing");
}
const assertion = `${unsigned}.${b64url(signature)}`;

let tokenResponse;
try {
  tokenResponse = await fetch(tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    }),
    signal: AbortSignal.timeout(30000)
  });
} catch {
  fail(69, "token_transport");
}
let tokenPayload = {};
try { tokenPayload = await tokenResponse.json(); } catch {}
if (!tokenResponse.ok || !tokenPayload.access_token) {
  if (tokenResponse.status === 401 || tokenResponse.status === 403) fail(77, "authentication_or_permission");
  if (tokenResponse.status === 429) fail(69, "rate_limited");
  if (tokenResponse.status >= 500) fail(69, "google_server");
  fail(69, "token_unexpected_response");
}

const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/sitemaps/${encodeURIComponent(sitemapUrl)}`;
let response;
try {
  response = await fetch(endpoint, {
    method: "PUT",
    headers: { authorization: `Bearer ${tokenPayload.access_token}` },
    signal: AbortSignal.timeout(30000)
  });
} catch {
  fail(69, "submission_transport");
}
if (response.status === 204) {
  process.stdout.write(`gsc_submit property=${property} sitemap=${sitemapUrl} status=204 result=accepted\n`);
  process.exit(0);
}
if (response.status === 401 || response.status === 403) fail(77, "authentication_or_permission");
if (response.status === 404) fail(77, "property_or_endpoint_not_found");
if (response.status === 429) fail(69, "rate_limited");
if (response.status >= 500) fail(69, "google_server");
fail(69, "unexpected_response");
