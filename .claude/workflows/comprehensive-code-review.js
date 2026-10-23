export const meta = {
  name: "comprehensive-code-review",
  description: "Review codebase for logical bugs, security, data integrity, and race conditions",
  phases: [
    { title: "Review" },
    { title: "Verify" },
  ]
};

const FINDINGS_SCHEMA = {
  type: "object",
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          file: { type: "string" },
          line: { type: "integer" },
          title: { type: "string" },
          description: { type: "string" },
          severity: { type: "string", enum: ["critical", "high", "medium"] }
        },
        required: ["file", "line", "title", "description", "severity"]
      }
    }
  },
  required: ["findings"]
};

const VERDICT_SCHEMA = {
  type: "object",
  properties: {
    isReal: { type: "boolean", description: "True if the bug is valid, False if it is a false positive or fundamentally flawed finding." },
    reasoning: { type: "string", description: "Why it is real or false positive. Provide deep technical context." }
  },
  required: ["isReal", "reasoning"]
};

// Apps to review
const APPS = args;

const results = await pipeline(
  APPS,
  (app) => agent(
    `You are a senior security researcher and backend engineer. Review all python files in backend/${app}/ (such as models.py, views.py, serializers.py, signals.py) for the following severe issues:
    1. Logical bugs or improper error handling
    2. Authentication/Permission bypasses (security)
    3. Race conditions
    4. Data integrity and migration problems

    Use 'Read' and 'Bash' to explore files in backend/${app}. Focus deeply.
    Return a list of strictly critical/high/medium severity findings. Be precise about 'file' (repo-relative path) and 'line'.
    Ignore minor stylistic or formatting issues.

    Intentional project decisions — do NOT report these:
    - ChatContactsListView in communications/views.py returns all active users on purpose (not limited by warehouse).
    - Authenticated users have no global rate limit on purpose (only AnonRateThrottle and ScopedRateThrottle), so users behind the Cloudflare tunnel are not locked out.
    Hard project rule: any path that can lose user data (deleting records, destructive migrations, cascades) is at least high severity.`,
    { label: `review:${app}`, phase: 'Review', schema: FINDINGS_SCHEMA, effort: 'high' }
  ),
  (review) => {
    // If the review agent failed, review is null. Filter safely.
    const findings = (review && review.findings) ? review.findings : [];
    return parallel(
      findings.map(f => () =>
        agent(
          `Adversarially verify the following finding:
          File: ${f.file}
          Line: ${f.line}
          Title: ${f.title}
          Description: ${f.description}

          You are a skeptical reviewer. Your goal is to REFUTE this finding.
          Use Read tool on ${f.file} to inspect the context around line ${f.line}.
          Are there checks elsewhere? Is this actually safe? Is it a race condition in practice?
          Return isReal=false if you can refute it. Only return isReal=true if the bug is genuinely real and unresolved.
          Also return isReal=false if the finding is one of the intentional project decisions: the chat contacts list is not limited by warehouse, and authenticated users have no global rate limit.`,
          { label: `verify:${f.file?.split('/').pop()}`, phase: 'Verify', schema: VERDICT_SCHEMA, effort: 'high' }
        ).then(v => ({ ...f, verdict: v, file_clean: f.file, line: f.line }))
      )
    );
  }
);

const confirmed = results.flat().filter(Boolean).filter(f => f.verdict && f.verdict.isReal);

// Log to help user
log(`Found ${confirmed.length} verified critical/high/medium issues across ${APPS.length} apps.`);

return { confirmed };
