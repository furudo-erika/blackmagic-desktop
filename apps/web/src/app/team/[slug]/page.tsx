import { AGENTS } from '../../../config/agents';
import AgentPageClient from './AgentPageClient';

export function generateStaticParams() {
  return AGENTS.map((a) => ({ slug: a.slug }));
}

export default function Page() {
  return <AgentPageClient />;
}
