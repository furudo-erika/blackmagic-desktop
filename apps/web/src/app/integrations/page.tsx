'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, type Integration, type IntegrationProvider } from '../../lib/api';
import { Plug } from 'lucide-react';
import {
  PageShell,
  PageHeader,
  PageBody,
  Panel,
  Button,
} from '../../components/ui/primitives';

type ProviderDef = {
  provider: IntegrationProvider;
  name: string;
  description: string;
  oauth: boolean;
  endpointField?: boolean;
  brandColor: string;
};

/**
 * Brand logo paths from Simple Icons (simpleicons.org, MIT licensed).
 * Each entry is an SVG `d` string rendered in white on the brand's
 * colored background tile. We prefer the canonical brand mark over
 * initials so each card is actually identifiable at a glance.
 */
const BRAND_PATHS: Record<IntegrationProvider, string> = {
  hubspot:
    'M18.164 7.93V5.084a2.198 2.198 0 001.267-1.978v-.067A2.2 2.2 0 0017.238.845h-.067a2.2 2.2 0 00-2.193 2.194v.067a2.196 2.196 0 001.252 1.973l.013.005v2.852a6.212 6.212 0 00-2.969 1.31l.012-.01-7.842-6.105A2.516 2.516 0 104.042 4.52l-.015-.008 7.714 6.005a6.228 6.228 0 00-1.042 3.468c0 1.368.442 2.633 1.19 3.66l-.012-.017-2.348 2.352A2.004 2.004 0 008.904 20a2.004 2.004 0 00-.625 1.46v.005c0 .525.202 1.003.533 1.36l-.001-.002A1.988 1.988 0 0010.276 23.4c.52 0 .993-.201 1.346-.528l-.001.001.017-.017 2.318-2.322A6.23 6.23 0 1018.164 7.93zm-4.097 9.336a3.195 3.195 0 110-6.39 3.195 3.195 0 010 6.39z',
  attio:
    'M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 4.5a7.5 7.5 0 110 15 7.5 7.5 0 010-15zm0 3a4.5 4.5 0 100 9 4.5 4.5 0 000-9z',
  salesforce:
    'M10.006 5.415a4.195 4.195 0 013.045-1.306c1.56 0 2.954.9 3.69 2.205.63-.3 1.35-.45 2.1-.45 2.85 0 5.159 2.34 5.159 5.22 0 2.88-2.31 5.22-5.16 5.22-.345 0-.69-.033-1.02-.1-.84 1.5-2.43 2.52-4.26 2.52-.78 0-1.5-.18-2.16-.48a4.732 4.732 0 01-4.395 2.925c-2.55 0-4.695-2.355-4.695-4.92 0-.345.045-.69.105-1.02-1.44-.75-2.4-2.25-2.4-3.975 0-2.475 2.025-4.5 4.5-4.5.72 0 1.395.165 2.01.465a5.05 5.05 0 013.48-1.805z',
  gong:
    'M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 3.6a8.4 8.4 0 110 16.8 8.4 8.4 0 010-16.8zm0 2.4a6 6 0 100 12 6 6 0 000-12zm0 2.4a3.6 3.6 0 110 7.2 3.6 3.6 0 010-7.2z',
  unipile:
    'M3 3v11.25a6.75 6.75 0 0013.5 0V3h-3v11.25a3.75 3.75 0 01-7.5 0V3H3zm15 0v18h3V3h-3z',
  slack:
    'M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 012.521-2.52 2.527 2.527 0 012.521 2.52v6.313A2.528 2.528 0 018.834 24a2.528 2.528 0 01-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 01-2.521-2.52A2.528 2.528 0 018.834 0a2.528 2.528 0 012.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 012.521 2.522 2.528 2.528 0 01-2.521 2.521H2.522A2.528 2.528 0 010 8.835a2.528 2.528 0 012.522-2.522h6.312zm10.122 2.522a2.528 2.528 0 012.522-2.522A2.528 2.528 0 0124 8.835a2.528 2.528 0 01-2.522 2.521h-2.522V8.835zm-1.268 0a2.528 2.528 0 01-2.523 2.521 2.527 2.527 0 01-2.52-2.521V2.522A2.527 2.527 0 0115.165 0a2.528 2.528 0 012.523 2.522v6.313zM15.165 18.956a2.528 2.528 0 012.523 2.522A2.528 2.528 0 0115.165 24a2.527 2.527 0 01-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 01-2.52-2.523 2.526 2.526 0 012.52-2.52h6.313A2.527 2.527 0 0124 15.165a2.528 2.528 0 01-2.522 2.523h-6.313z',
  gmail:
    'M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 010 19.366V5.457c0-.904.732-1.636 1.636-1.636h.819L12 10.731l9.545-6.91h.82c.903 0 1.635.732 1.635 1.636z',
  feishu:
    'M11.02 17.284a15.48 15.48 0 01-5.203 1.884c-.64.11-1.29.176-1.947.176-.78 0-1.547-.088-2.283-.264a6.86 6.86 0 01-1.147-.382l-.44-.198.44-.22c1.745-.874 3.31-1.856 4.73-2.962a25.91 25.91 0 001.947-1.642c.485-.44.95-.903 1.392-1.386l.264-.287.22.287a12.75 12.75 0 001.945 1.856c.617.462 1.256.88 1.924 1.254l.44.22-.44.22c-.38.198-.79.374-1.213.528l-.22.066-.088.044-.132.044-.132.022-.22.06-.22.066c-.038.012-.08.022-.12.033l-.22.066zm6.88-4.95c.374-.374.725-.77 1.054-1.188 1.28-1.58 2.272-3.395 2.95-5.369L22.61 4a9.78 9.78 0 00-1.036-.77c-.46-.308-.946-.572-1.452-.814l-.32-.132-.088.374a19.155 19.155 0 01-1.783 4.532 22.88 22.88 0 01-2.464 3.66l-.286.308.374.264a18.54 18.54 0 001.76 1.034l.352.176.242-.308zM12 2.4c-2.51 0-4.95.512-7.217 1.518l-.34.154.286.22c.816.66 1.588 1.364 2.33 2.112.725.726 1.41 1.496 2.067 2.288l.22.263.22-.263a14.98 14.98 0 012.31-2.266 15.06 15.06 0 012.266-1.58l.33-.198-.33-.198a12.43 12.43 0 00-1.342-.748A8.28 8.28 0 0012 2.4zm11.297 9.152L23.188 12a11.39 11.39 0 00-1.1-4.686l-.154-.33-.198.33a20.105 20.105 0 01-2.618 3.396 20.51 20.51 0 01-3.22 2.706l-.287.198.198.287c.88 1.232 1.856 2.398 2.948 3.44l.22.22.22-.242a11.55 11.55 0 003.11-5.767z',
  metabase:
    'M2.699 15.068a1.35 1.35 0 11-.002 2.701 1.35 1.35 0 01.002-2.701zm5.396-.125a1.35 1.35 0 11-.002 2.702 1.35 1.35 0 01.002-2.702zm5.31 0a1.35 1.35 0 11-.001 2.702 1.35 1.35 0 01.002-2.702zm5.31 0a1.35 1.35 0 11-.002 2.702 1.35 1.35 0 01.002-2.702zm-10.62-8.1a1.35 1.35 0 11-.001 2.7 1.35 1.35 0 01.002-2.7zm5.31 0a1.35 1.35 0 11-.001 2.7 1.35 1.35 0 01.002-2.7zm5.31 0a1.35 1.35 0 11-.001 2.7 1.35 1.35 0 01.002-2.7zm0-6.843a1.35 1.35 0 110 2.7 1.35 1.35 0 010-2.7zm-5.31 0a1.35 1.35 0 110 2.7 1.35 1.35 0 010-2.7zm-5.31 0a1.35 1.35 0 110 2.7 1.35 1.35 0 010-2.7zm-5.395 8.1a1.35 1.35 0 11-.001 2.7 1.35 1.35 0 01.002-2.7zm0-6.843a1.35 1.35 0 110 2.7 1.35 1.35 0 010-2.7zm18.9 13.686a1.35 1.35 0 11-.002 2.702 1.35 1.35 0 01.002-2.702z',
  supabase:
    'M11.9 1.375c-.4 0-.7.2-.9.5L.6 14.575c-.4.5-.4 1.2 0 1.7.2.3.5.4.8.4H9.9v6.4c0 .4.3.8.8.8.3 0 .5-.2.7-.4l10.4-12.7c.4-.5.4-1.2 0-1.7-.2-.3-.5-.4-.8-.4H14.1v-6.4c0-.4-.3-.8-.8-.8h-1.4z',
  calcom:
    'M5.091 0h13.818C21.727 0 24 2.273 24 5.091v13.818C24 21.727 21.727 24 18.909 24H5.091C2.273 24 0 21.727 0 18.909V5.091C0 2.273 2.273 0 5.091 0zM7.2 12a4.8 4.8 0 018.192-3.394l-1.697 1.697A2.4 2.4 0 1012 14.4c.662 0 1.263-.268 1.697-.703l1.697 1.697A4.8 4.8 0 017.2 12z',
  discord:
    'M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028 14.09 14.09 0 001.226-1.994.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418Z',
  telegram:
    'M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z',
  notion:
    'M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933zM1.936.55 15.29 0 17.49.887 19.3 2.614c.376.466.515.606.515 1.073v16.01c0 .653-.233.746-.56.933l-2.156 1.214c-.42.42-.654.607-1.495.607l-12.67.467c-.747 0-.748-.467-.89-.933L.746 19.274C.28 18.714.093 18.227.093 17.63V2.995c0-.513.232-.98.793-1.073l1.05-1.372Z',
  linear:
    'M3.007 11.555L12.447 20.995C7.578 20.78 3.221 16.422 3.007 11.555zm-.005-2.483 11.926 11.926a10.514 10.514 0 002.325-.65L2.329 6.74a10.51 10.51 0 00-.327 2.332zm1.088-4.745L19.682 20.02a10.61 10.61 0 001.637-1.409L5.46 2.653a10.6 10.6 0 00-1.37 1.674zM8.497 1.154 22.855 15.513a10.554 10.554 0 00.605-2.478L10.97.55a10.514 10.514 0 00-2.473.604z',
  github:
    'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12',
  stripe:
    'M13.479 9.883c-1.626-.604-2.512-1.067-2.512-1.803 0-.622.511-.977 1.423-.977 1.667 0 3.379.642 4.558 1.22l.666-4.111c-.935-.446-2.847-1.177-5.49-1.177-1.87 0-3.425.489-4.536 1.401-1.157.957-1.755 2.34-1.755 4.005 0 3.018 1.843 4.309 4.852 5.403 1.935.691 2.585 1.18 2.585 1.935 0 .732-.625 1.155-1.756 1.155-1.398 0-3.704-.686-5.218-1.566l-.672 4.16c1.302.736 3.705 1.476 6.195 1.476 1.97 0 3.615-.467 4.726-1.353 1.246-.99 1.888-2.45 1.888-4.394 0-3.087-1.867-4.376-4.908-5.485z',
  // Apify — bracketed "A" evoking their [a.] brand mark. Simple Icons
  // doesn't publish an Apify glyph, so we draw a clean geometric stand-in:
  // left/right square brackets flanking an uppercase A.
  apify:
    'M3 3h4v2H5v14h2v2H3V3zm18 0v18h-4v-2h2V5h-2V3h4zM12 6l-5 12h2.2l1.05-2.6h3.5L14.8 18H17L12 6zm0 4.1l1.2 3.1h-2.4L12 10.1z',
  // Amazon SES — envelope-in-box. AWS trademark isn't in Simple Icons; we
  // render a clean envelope silhouette so the card is recognizable as an
  // email-sending service.
  amazon_ses:
    'M3 5h18a1 1 0 011 1v12a1 1 0 01-1 1H3a1 1 0 01-1-1V6a1 1 0 011-1zm.8 2l8.2 5.3L20.2 7H3.8zM3 8.35V17h18V8.35l-8.45 5.5a1 1 0 01-1.1 0L3 8.35z',
  // GSC — magnifier + small "G" corner mark. Generic search-analytics
  // glyph (no Google trademark).
  gsc:
    'M10.5 3a7.5 7.5 0 015.92 12.08l4.75 4.75-1.34 1.34-4.75-4.75A7.5 7.5 0 1110.5 3zm0 2a5.5 5.5 0 100 11 5.5 5.5 0 000-11zm.5 2.5v2h2v1.5h-2v2H9.5v-2h-2V9.5h2v-2H11z',
  // Ghost — simple ghost silhouette. Matches Ghost's brand mark shape
  // without using their registered logo.
  ghost:
    'M12 2a8 8 0 018 8v11l-2.5-1.8L15 21l-3-2-3 2-2.5-1.8L4 21V10a8 8 0 018-8zm-3.2 7.3a1.2 1.2 0 100 2.4 1.2 1.2 0 000-2.4zm6.4 0a1.2 1.2 0 100 2.4 1.2 1.2 0 000-2.4z',
  // WordPress — concentric circle W. Clean geometric; no trademark.
  wordpress:
    'M12 2a10 10 0 100 20 10 10 0 000-20zm0 2a8 8 0 016.93 4H5.07A8 8 0 0112 4zM4 12a8 8 0 01.64-3.14L9.3 19.5A8 8 0 014 12zm9.1 7.86L6.2 7.5h5.5l1.4 2.8L11 19.5a8 8 0 002.1.36zm6.14-3L14.8 7.5h2.24A8 8 0 0119.24 16.86z',
  // RB2B — abstract person-on-orbit (visitor de-anonymization).
  rb2b:
    'M12 2a4 4 0 100 8 4 4 0 000-8zm0 10c-3.31 0-6 2.24-6 5v3h12v-3c0-2.76-2.69-5-6-5zm9-6h-3v2h-2v2h2v2h-2v-2h-2V8h2V6h2V4h3v2zm-2 4h2v2h-2v-2z',
};

function BrandLogo({ provider, color }: { provider: IntegrationProvider; color: string }) {
  const d = BRAND_PATHS[provider];
  return (
    <div
      aria-hidden
      className="w-9 h-9 rounded-md flex items-center justify-center shrink-0"
      style={{ background: color }}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="#ffffff" aria-hidden>
        <path d={d} />
      </svg>
    </div>
  );
}

type Group = {
  label: string;
  providers: ProviderDef[];
};

const GROUPS: Group[] = [
  {
    label: 'CRM',
    providers: [
      {
        provider: 'hubspot',
        name: 'HubSpot',
        description: 'Sync contacts, companies, deals. Write enrichment back.',
        oauth: true,
        brandColor: '#FF7A59',
      },
      {
        provider: 'attio',
        name: 'Attio',
        description: 'Two-way sync with Attio objects and lists.',
        oauth: false,
        endpointField: true,
        brandColor: '#1F2937',
      },
      {
        provider: 'salesforce',
        name: 'Salesforce',
        description: 'Pull accounts, contacts, opportunities. Push updates to records.',
        oauth: true,
        brandColor: '#00A1E0',
      },
    ],
  },
  {
    label: 'Sales engagement',
    providers: [
      {
        provider: 'gong',
        name: 'Gong',
        description: 'Ingest call recordings and transcripts for research.',
        oauth: false,
        brandColor: '#8017D8',
      },
      {
        provider: 'unipile',
        name: 'Unipile',
        description: 'LinkedIn account management + DM + connection requests via Unipile (the canonical, non-ToS-grey path — replaces the old li_at cookie hack). Pricing: https://www.unipile.com/pricing-api/. Paste your API key + the instance URL Unipile gave you (https://api…unipile.com:…).',
        oauth: false,
        endpointField: true,
        brandColor: '#0066FF',
      },
    ],
  },
  {
    label: 'Messaging',
    providers: [
      {
        provider: 'slack',
        name: 'Slack',
        description: 'Post agent updates and receive slash commands in your workspace.',
        oauth: true,
        brandColor: '#611F69',
      },
      {
        provider: 'gmail',
        name: 'Gmail',
        description: 'Send first-touch emails and read replies from an authorized inbox.',
        oauth: true,
        brandColor: '#EA4335',
      },
      {
        provider: 'feishu',
        name: 'Feishu',
        description: 'Post notifications, send DMs/group messages, and read Bitable rows via custom bot or tenant token.',
        oauth: false,
        brandColor: '#3370FF',
      },
      {
        provider: 'discord',
        name: 'Discord',
        description: 'Post agent updates to channels and receive slash commands via bot token or webhook.',
        oauth: false,
        endpointField: true,
        brandColor: '#5865F2',
      },
      {
        provider: 'telegram',
        name: 'Telegram',
        description: 'Send notifications and receive commands via a bot token from @BotFather.',
        oauth: false,
        brandColor: '#26A5E4',
      },
    ],
  },
  {
    label: 'Scheduling',
    providers: [
      {
        provider: 'calcom',
        name: 'Cal.com',
        description: 'Read bookings, create event types, and trigger reschedules with a personal API key.',
        oauth: false,
        brandColor: '#111111',
      },
    ],
  },
  {
    label: 'Knowledge',
    providers: [
      {
        provider: 'notion',
        name: 'Notion',
        description: 'Read and append to databases and pages via an internal integration token.',
        oauth: true,
        brandColor: '#111111',
      },
    ],
  },
  {
    label: 'Engineering',
    providers: [
      {
        provider: 'linear',
        name: 'Linear',
        description: 'Query issues, create tickets, and move them through states with a personal API key.',
        oauth: true,
        brandColor: '#5E6AD2',
      },
      {
        provider: 'github',
        name: 'GitHub',
        description: 'Read issues/PRs, open PRs, and comment on behalf of the agent via a fine-grained token.',
        oauth: true,
        brandColor: '#181717',
      },
    ],
  },
  {
    label: 'Payments',
    providers: [
      {
        provider: 'stripe',
        name: 'Stripe',
        description: 'Read customers, subscriptions, and invoices. Trigger refunds via a restricted key.',
        oauth: false,
        brandColor: '#635BFF',
      },
    ],
  },
  {
    label: 'Scraping',
    providers: [
      {
        provider: 'apify',
        name: 'Apify',
        description: 'Run actors for Google/Reddit/X scraping. Outreach pipelines pull leads through Apify instead of hitting each site directly.',
        oauth: false,
        brandColor: '#00B04F',
      },
    ],
  },
  {
    label: 'Email infrastructure',
    providers: [
      {
        provider: 'amazon_ses',
        name: 'Amazon SES',
        description: 'Send outreach email through Amazon SES with your own verified domain — replaces Resend for cold-email sequences.',
        oauth: false,
        endpointField: true,
        brandColor: '#FF9900',
      },
    ],
  },
  {
    label: 'SEO',
    providers: [
      {
        provider: 'gsc',
        name: 'Google Search Console',
        description: 'Pull impressions, clicks, CTR, and positions for every query + page. Feeds the `gsc-content-brief` skill (REWRITE / PUSH / GAP analysis).',
        oauth: false,
        brandColor: '#4285F4',
      },
    ],
  },
  {
    label: 'Content / CMS',
    providers: [
      {
        provider: 'ghost',
        name: 'Ghost',
        description: 'Read blog posts and create drafts via Ghost Admin API. Approve-gated — nothing publishes until you confirm.',
        oauth: false,
        endpointField: true,
        brandColor: '#15171A',
      },
      {
        provider: 'wordpress',
        name: 'WordPress',
        description: 'Read posts and create drafts via WordPress REST API + application passwords. Approve-gated.',
        oauth: false,
        endpointField: true,
        brandColor: '#21759B',
      },
    ],
  },
  {
    label: 'Visitor identification',
    providers: [
      {
        provider: 'rb2b',
        name: 'RB2B',
        description: 'De-anonymize US-based website visitors. Paste your RB2B API key — agents pull person + company per session and write them to companies/ + contacts/ for the Website Visitor Agent to act on.',
        oauth: false,
        brandColor: '#FF6B35',
      },
    ],
  },
  {
    label: 'Data',
    providers: [
      {
        provider: 'metabase',
        name: 'Metabase',
        description: 'Run saved questions and ad-hoc SQL against your Metabase instance.',
        oauth: false,
        endpointField: true,
        brandColor: '#509EE3',
      },
      {
        provider: 'supabase',
        name: 'Supabase',
        description: 'Read/write Postgres rows and call RPC functions via service_role key.',
        oauth: false,
        endpointField: true,
        brandColor: '#3ECF8E',
      },
    ],
  },
];

export default function IntegrationsPage() {
  const query = useQuery({
    queryKey: ['integrations'],
    queryFn: api.listIntegrations,
    retry: false,
  });

  const missing = query.error instanceof ApiError && query.error.status === 404;
  const disabled = missing || query.isLoading || !!query.error;

  const byProvider = new Map<IntegrationProvider, Integration>();
  for (const i of query.data?.integrations ?? []) byProvider.set(i.provider, i);

  return (
    <PageShell>
      <PageHeader
        title="Integrations"
        subtitle="Paste API keys for the services your agents should read / write — CRMs, messaging, email providers, scrapers. BYOK, local-only: keys live in .bm/integrations.json and mirror to <vault>/.env."
        icon={Plug}
      />
      <PageBody maxWidth="5xl">
        {missing && (
          <div className="mb-6 px-4 py-3 rounded-lg border border-line dark:border-[#2A241D] bg-flame-soft text-sm text-ink dark:text-[#E6E0D8]">
            Daemon endpoint not yet wired. Cards render read-only until the daemon exposes
            <code className="font-mono text-xs mx-1">/api/integrations</code>.
          </div>
        )}
        {query.error && !missing && (
          <div className="mb-6 px-4 py-3 rounded-lg border border-line dark:border-[#2A241D] bg-white dark:bg-[#1F1B15] text-sm text-muted dark:text-[#8C837C]">
            Failed to load integrations: {(query.error as Error).message}
          </div>
        )}

        {GROUPS.map((group) => (
          <section key={group.label} className="mb-8">
            <h2 className="text-[11px] uppercase tracking-wider text-muted dark:text-[#8C837C] font-mono mb-3">
              {group.label}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {group.providers.map((def) => (
                <IntegrationCard
                  key={def.provider}
                  def={def}
                  integration={byProvider.get(def.provider)}
                  disabled={disabled}
                />
              ))}
            </div>
          </section>
        ))}
      </PageBody>
    </PageShell>
  );
}

function IntegrationCard({
  def,
  integration,
  disabled,
}: {
  def: ProviderDef;
  integration?: Integration;
  disabled: boolean;
}) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [token, setToken] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const connected = integration?.status === 'connected';

  const saveMut = useMutation({
    mutationFn: (creds: Record<string, string>) => api.saveIntegrationToken(def.provider, creds),
    onSuccess: () => {
      setShowForm(false);
      setToken('');
      setEndpoint('');
      qc.invalidateQueries({ queryKey: ['integrations'] });
    },
  });

  const disconnectMut = useMutation({
    mutationFn: () => api.disconnectIntegration(def.provider),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations'] }),
  });

  const oauthMut = useMutation({
    mutationFn: () => api.oauthStart(def.provider),
    onSuccess: (data) => {
      if (window.bmBridge?.openExternal) window.bmBridge.openExternal(data.browserUrl);
    },
  });

  function save() {
    const trimmed = token.trim();
    if (!trimmed) return;
    // Amazon SES needs four fields (access key, secret, region, from).
    // Rather than adding a special multi-field form, we accept a JSON
    // object in the main paste box — if it parses as `{...}`, spread it
    // into the credentials record verbatim. Any other provider keeps the
    // existing single-token flow.
    let creds: Record<string, string>;
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          creds = Object.fromEntries(
            Object.entries(parsed).map(([k, v]) => [k, String(v)]),
          );
        } else {
          creds = { token: trimmed };
        }
      } catch {
        creds = { token: trimmed };
      }
    } else {
      creds = { token: trimmed };
    }
    if (def.endpointField && endpoint.trim() && !creds.endpoint) {
      creds.endpoint = endpoint.trim();
    }
    saveMut.mutate(creds);
  }

  return (
    <Panel className="flex flex-col gap-3 p-5">
      <div className="flex items-start gap-3">
        <BrandLogo provider={def.provider} color={def.brandColor} />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold text-ink dark:text-[#F5F1EA]">{def.name}</div>
          <p className="text-xs text-muted dark:text-[#8C837C] mt-0.5">{def.description}</p>
        </div>
      </div>

      <div className="text-xs">
        {connected ? (
          <span className="text-flame font-medium">
            Connected{integration?.connectedAs ? ` as ${integration.connectedAs}` : ''}
          </span>
        ) : (
          <span className="text-muted dark:text-[#8C837C]">Not connected</span>
        )}
      </div>

      {!showForm && (
        <div className="flex items-center gap-3 mt-auto">
          {connected ? (
            <Button
              variant="danger"
              onClick={() => disconnectMut.mutate()}
              disabled={disabled || disconnectMut.isPending}
            >
              {disconnectMut.isPending ? 'Disconnecting…' : 'Disconnect'}
            </Button>
          ) : def.oauth ? (
            <>
              <Button
                variant="primary"
                onClick={() => oauthMut.mutate()}
                disabled={disabled || oauthMut.isPending}
              >
                {oauthMut.isPending ? 'Opening…' : 'Connect with OAuth'}
              </Button>
              <Button variant="ghost" onClick={() => setShowForm(true)} disabled={disabled}>
                Paste token
              </Button>
            </>
          ) : (
            <Button variant="primary" onClick={() => setShowForm(true)} disabled={disabled}>
              Connect
            </Button>
          )}
        </div>
      )}

      {showForm && (
        <div className="flex flex-col gap-2 border-t border-line dark:border-[#2A241D] pt-3">
          <textarea
            value={token}
            onChange={(e) => setToken(e.target.value)}
            rows={def.provider === 'amazon_ses' || def.provider === 'gsc' ? 8 : 3}
            placeholder={
              def.provider === 'amazon_ses'
                ? '{\n  "access_key_id": "AKIA…",\n  "secret_access_key": "…",\n  "region": "us-east-1",\n  "from": "Lynn <lynn@inc.apidog.com>"\n}'
                : def.provider === 'gsc'
                  ? '{\n  "service_account_json": "<paste the whole JSON key file>",\n  "site_url": "sc-domain:example.com"\n}'
                  : def.provider === 'ghost'
                    ? 'GHOST_ADMIN_API_KEY format: <id>:<secret>'
                    : def.provider === 'wordpress'
                      ? 'wpuser:xxxx xxxx xxxx xxxx xxxx xxxx'
                      : def.provider === 'apify'
                        ? 'apify_api_…'
                        : 'Paste API token'
            }
            className="resize-none bg-cream dark:bg-[#0F0D0A] border border-line dark:border-[#2A241D] rounded-md px-3 py-2 text-xs font-mono text-ink dark:text-[#E6E0D8] focus:outline-none focus:border-flame"
          />
          {def.endpointField && (
            <input
              type="text"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="Endpoint URL (optional)"
              className="bg-cream dark:bg-[#0F0D0A] border border-line dark:border-[#2A241D] rounded-md px-3 py-2 text-xs font-mono text-ink dark:text-[#E6E0D8] focus:outline-none focus:border-flame"
            />
          )}
          {saveMut.error && (
            <div className="text-xs text-flame">{(saveMut.error as Error).message}</div>
          )}
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              onClick={save}
              disabled={disabled || saveMut.isPending || !token.trim()}
            >
              {saveMut.isPending ? 'Saving…' : 'Save'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setShowForm(false);
                setToken('');
                setEndpoint('');
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}
