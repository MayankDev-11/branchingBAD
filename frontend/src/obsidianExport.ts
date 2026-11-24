import type { BranchDetailResponse, GraphResponse, InsightsResponse } from './types';

// The "Export Obsidian Markdown" note on the Privacy page, built from the live API data so every
// number and record ID in it is real. (Mayank's backend Obsidian export can replace this later.)

const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const links = (ids: string[]) => ids.map((id) => `[[${id}]]`).join(', ');

export function buildObsidianNote(
  graph: GraphResponse,
  details: Record<string, BranchDetailResponse>,
  insights: InsightsResponse | null
): string {
  const lines: string[] = [
    '---',
    'roottrace_export: true',
    `exported_at: ${new Date().toISOString()}`,
    `data_as_of: ${graph.range.end}`,
    'privacy_mode: presidio_plus_bedrock_mumbai',
    '---',
    '',
    '# RootTrace Personal Knowledge Vault',
    '',
    '## Verified Knowledge',
  ];

  if (graph.knowledge.length === 0) lines.push('- None yet.');
  for (const k of graph.knowledge) {
    const branch = graph.branches.find((b) => b.end_date === k.date);
    const ids = branch ? details[branch.id]?.hypotheses[0]?.claims[0]?.record_ids.slice(0, 2) ?? [] : [];
    lines.push(`- **${longDate(k.date)}**: ${k.statement} *(Confidence: ${k.confidence}${ids.length ? ` · Records: ${links(ids)}` : ''})*`);
  }

  for (const b of graph.branches.filter((br) => br.status === 'open')) {
    const d = details[b.id];
    lines.push('', `## Active Investigation: ${b.title}`);
    if (d?.change_event) lines.push(`- **Triggered by:** ${d.change_event.label} (PELT change detection)`);
    d?.hypotheses.forEach((h) => {
      const claim = h.claims[0];
      lines.push(
        `- **Hypothesis #${h.rank} (${h.confidence ?? 0}%):** ${h.label ?? h.text}: ${claim?.text ?? 'not enough data yet'}${
          claim?.record_ids.length ? ` (${links(claim.record_ids.slice(0, 2))})` : ''
        }`
      );
    });
    const exp = d?.experiment;
    if (exp) {
      lines.push(
        `- **${exp.locked ? 'Locked' : 'Draft'} Experiment:** ${exp.description} for ${exp.duration_days} nights. Criterion: ${exp.success_criterion}${
          exp.locked_at ? ` (locked ${longDate(exp.locked_at.slice(0, 10))} via SQLite trigger)` : ''
        } · night ${exp.days_elapsed} of ${exp.duration_days} · ${exp.adherence_pct}% adherence`
      );
    }
  }

  if (insights) {
    lines.push('', `*${insights.coverage.total_observations} observations over ${insights.coverage.days} days.*`);
  }
  lines.push('', '> *Personal pattern, not medical advice. Raw health records were never transmitted to external AI models.*', '');
  return lines.join('\n');
}
