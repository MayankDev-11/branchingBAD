import type { ClaimItem } from './types';

type AuditHypothesis = {
  rank: number;
  text: string;
  claims: ClaimItem[];
};

type AskAudit =
  | { provider: 'Gemini'; topic: string; hypotheses: AuditHypothesis[] }
  | { provider: 'Claude Haiku on Bedrock'; question: string }
  | { provider: null };

export function readAskAudit(raw: string): AskAudit {
  if (!raw) return { provider: null };

  try {
    // Bedrock records one request per line. Gemini sends a single request.
    const firstRequest = JSON.parse(raw.split('\n', 1)[0]);
    if (typeof firstRequest?.modelId === 'string') {
      const question = firstRequest.messages?.[0]?.content?.[0]?.text;
      return {
        provider: 'Claude Haiku on Bedrock',
        question: typeof question === 'string' ? question : '',
      };
    }

    const input = firstRequest?.contents?.[0]?.parts?.[0]?.text;
    if (typeof input === 'string' && firstRequest.systemInstruction) {
      const evidence = JSON.parse(input);
      if (typeof evidence?.topic === 'string' && Array.isArray(evidence.hypotheses)) {
        const hypotheses: AuditHypothesis[] = [];
        for (const item of evidence.hypotheses) {
          if (
            !Number.isInteger(item?.rank) || typeof item?.text !== 'string'
            || !Array.isArray(item?.claims)
          ) continue;
          const claims = item.claims.filter((claim: ClaimItem) =>
            typeof claim?.text === 'string'
            && Array.isArray(claim?.record_ids)
            && claim.record_ids.every((id) => typeof id === 'string')
          );
          hypotheses.push({ rank: item.rank, text: item.text, claims });
        }
        return { provider: 'Gemini', topic: evidence.topic, hypotheses };
      }
    }
  } catch {
    // Older responses may contain plain text. The exact request stays available.
  }
  return { provider: null };
}
