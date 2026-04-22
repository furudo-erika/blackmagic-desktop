// Shared email send — tries providers in order of preference based on what
// the user has connected:
//
//   1. Amazon SES (integrations.amazon_ses) — signs a SESv2 SendEmail
//      request with AWS SigV4. Preferred: it's the least-privilege BYOK
//      path (single `ses:SendEmail` IAM action) and the user owns their
//      own domain.
//   2. Resend (config.resend_api_key) — legacy fallback for older vaults.
//   3. Error — neither connected; caller decides what to do (the draft
//      stays `approved` + surface the error for the UI).
//
// MCP-backed email tools (`gmail.send_email`, …) are handled one layer up
// in drafts.ts — this file only does the two BYOK paths.

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import pathMod from 'node:path';
import { getVaultRoot } from './paths.js';

type SendResult =
  | { ok: true; provider: 'ses' | 'resend'; messageId?: string; from?: string }
  | { ok: false; error: string; triedProviders: string[] };

export interface EmailArgs {
  to: string;
  subject: string;
  body_markdown?: string;
  body_html?: string;
  from?: string;
  reply_to?: string;
}

function naiveMarkdownToHtml(md: string): string {
  const withLinks = md.replace(/(https?:\/\/[^\s)<>"]+)(?![^<]*>)/g, '<a href="$1">$1</a>');
  return withLinks
    .split(/\n{2,}/g)
    .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

async function loadIntegrations(): Promise<any> {
  try {
    const raw = await fs.readFile(pathMod.join(getVaultRoot(), '.bm', 'integrations.json'), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Amazon SES via SESv2 SendEmail + SigV4. Node's crypto does HMAC-SHA256;
// no external SDK. We target the v2 API because it accepts a JSON body
// directly and avoids the query-string quirks of the classic SES API.
// ---------------------------------------------------------------------------
function sigv4Hmac(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}
function sigv4Hex(buf: Buffer): string { return buf.toString('hex'); }

function sigv4Signature(opts: {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service: string;
  method: string;
  host: string;
  uri: string;
  queryString: string;
  headers: Record<string, string>;
  body: string;
  nowUtc: Date;
}): { authHeader: string; amzDate: string } {
  const amz = opts.nowUtc.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = amz.slice(0, 8);
  const lowered: Record<string, string> = {};
  for (const [k, v] of Object.entries(opts.headers)) lowered[k.toLowerCase()] = v;
  const signedHeaderNames = Object.keys(lowered).sort();
  const canonicalHeaders = signedHeaderNames
    .map((h) => `${h}:${(lowered[h] ?? '').trim()}\n`)
    .join('');
  const signedHeaders = signedHeaderNames.join(';');
  const payloadHash = crypto.createHash('sha256').update(opts.body, 'utf8').digest('hex');
  const canonicalRequest = [
    opts.method,
    opts.uri,
    opts.queryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  const scope = `${date}/${opts.region}/${opts.service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amz,
    scope,
    crypto.createHash('sha256').update(canonicalRequest, 'utf8').digest('hex'),
  ].join('\n');
  const kDate = sigv4Hmac('AWS4' + opts.secretAccessKey, date);
  const kRegion = sigv4Hmac(kDate, opts.region);
  const kService = sigv4Hmac(kRegion, opts.service);
  const kSigning = sigv4Hmac(kService, 'aws4_request');
  const signature = sigv4Hex(sigv4Hmac(kSigning, stringToSign));
  return {
    authHeader: `AWS4-HMAC-SHA256 Credential=${opts.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    amzDate: amz,
  };
}

async function sendViaSes(creds: any, args: EmailArgs): Promise<SendResult> {
  const accessKey = creds.access_key_id;
  const secret = creds.secret_access_key;
  const region = creds.region || 'us-east-1';
  const from = args.from || creds.from;
  if (!accessKey || !secret || !from) {
    return { ok: false, error: 'SES integration missing access_key_id/secret_access_key/from', triedProviders: ['ses'] };
  }
  const html = args.body_html || (args.body_markdown ? naiveMarkdownToHtml(args.body_markdown) : '');
  const text = args.body_markdown || '';

  const payload = {
    FromEmailAddress: from,
    Destination: { ToAddresses: [args.to] },
    Content: {
      Simple: {
        Subject: { Data: args.subject, Charset: 'UTF-8' },
        Body: {
          ...(html ? { Html: { Data: html, Charset: 'UTF-8' } } : {}),
          ...(text ? { Text: { Data: text, Charset: 'UTF-8' } } : {}),
        },
      },
    },
    ...(args.reply_to ? { ReplyToAddresses: [args.reply_to] } : {}),
  };
  const body = JSON.stringify(payload);
  const host = `email.${region}.amazonaws.com`;
  const now = new Date();
  const amzShort = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const headers: Record<string, string> = {
    host,
    'content-type': 'application/json',
    'x-amz-date': amzShort,
  };
  const { authHeader } = sigv4Signature({
    accessKeyId: accessKey,
    secretAccessKey: secret,
    region,
    service: 'ses',
    method: 'POST',
    host,
    uri: '/v2/email/outbound-emails',
    queryString: '',
    headers,
    body,
    nowUtc: now,
  });

  const res = await fetch(`https://${host}/v2/email/outbound-emails`, {
    method: 'POST',
    headers: { ...headers, Authorization: authHeader },
    body,
  });
  const rtext = await res.text();
  if (!res.ok) {
    return { ok: false, error: `SES ${res.status}: ${rtext.slice(0, 300)}`, triedProviders: ['ses'] };
  }
  try {
    const data = JSON.parse(rtext) as { MessageId?: string };
    return { ok: true, provider: 'ses', messageId: data.MessageId, from };
  } catch {
    return { ok: true, provider: 'ses', from };
  }
}

async function sendViaResend(apiKey: string, fromDefault: string | undefined, args: EmailArgs): Promise<SendResult> {
  const from = args.from || fromDefault;
  if (!from) return { ok: false, error: 'Resend needs from (or set from_email)', triedProviders: ['resend'] };
  const html = args.body_html || (args.body_markdown ? naiveMarkdownToHtml(args.body_markdown) : '');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: args.to,
      subject: args.subject,
      html,
      text: args.body_markdown,
      ...(args.reply_to ? { reply_to: args.reply_to } : {}),
    }),
  });
  const text = await res.text();
  let data: any = null;
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  if (!res.ok) {
    const msg = (data && typeof data === 'object' && 'message' in data && String(data.message))
      || String(text).slice(0, 200)
      || `resend ${res.status}`;
    return { ok: false, error: msg, triedProviders: ['resend'] };
  }
  return { ok: true, provider: 'resend', messageId: data?.id, from };
}

export async function sendEmailViaBestProvider(
  args: EmailArgs,
  opts?: { resendKey?: string; resendFrom?: string },
): Promise<SendResult> {
  const tried: string[] = [];
  const errors: string[] = [];
  const store = await loadIntegrations();
  const ses = store?.amazon_ses;
  const hasSes = ses?.status === 'connected' && ses?.credentials;
  if (hasSes) {
    const r = await sendViaSes(ses.credentials, args);
    if (r.ok) return r;
    tried.push('ses');
    errors.push(`SES: ${r.error}`);
  }
  if (opts?.resendKey) {
    const r = await sendViaResend(opts.resendKey, opts.resendFrom, args);
    if (r.ok) return r;
    tried.push('resend');
    errors.push(`Resend: ${r.error}`);
  }
  if (tried.length === 0) {
    return {
      ok: false,
      error: 'No email provider connected. Open the sidebar → Tools → Amazon SES and paste your credentials (access_key_id + secret_access_key + region + from). Also: bottom-left gear icon works to get there.',
      triedProviders: ['none-connected'],
    };
  }
  // We actually tried a provider; surface its error so the user can fix
  // the root cause instead of chasing a misleading "nothing connected".
  return {
    ok: false,
    error: errors.join(' · '),
    triedProviders: tried,
  };
}
