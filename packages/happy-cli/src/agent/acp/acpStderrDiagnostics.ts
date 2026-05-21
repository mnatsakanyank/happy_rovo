/**
 * acpStderrDiagnostics — translates known fatal-startup stderr patterns from an
 * ACP child process into human-friendly hints.
 *
 * Background: ACP child processes (e.g. `acli rovodev acp`, `gemini --experimental-acp`,
 * `opencode acp`) print rich Python/Node stack traces to stderr on startup
 * failure. By default Happy surfaces "Exit code: 1" to the user — which is
 * useless. This module recognises the most common breakages and rewrites the
 * detail string so the user sees something actionable in both the terminal and
 * the mobile app's session-error UI.
 *
 * Keep this file pure (no logger, no I/O). It's trivially unit-testable and
 * runnable under Node's strip-types — no dependencies needed.
 */

export interface AcpExitDiagnosis {
  /**
   * A short, user-facing explanation of why the agent likely failed to start.
   * Intentionally one paragraph, no stack traces.
   */
  hint: string
  /** Internal id of the matched pattern; useful for tests & analytics. */
  pattern:
    | 'rovodev-acp-stdio-streams-limit'
    | 'rovodev-access-restricted'
    | 'http-403-forbidden'
    | 'http-401-unauthorized'
    | 'command-not-found'
}

/**
 * Each rule is an ordered (specific → general) check. The first match wins.
 *
 * `match` is intentionally a substring/regex check on the recent stderr tail
 * because Python tracebacks span many lines and we don't want to anchor on
 * line position.
 */
const RULES: ReadonlyArray<{
  pattern: AcpExitDiagnosis['pattern']
  match: RegExp
  hint: (agentName: string) => string
}> = [
  {
    // rovodev's bundled `acp` Python SDK is incompatible with the version
    // `rovodev.commands.acp.command` was compiled against. The child raises a
    // TypeError on stdio_streams(limit=...) before the first JSON-RPC frame.
    // Affects `acli rovodev` versions around 202605.16.x — known bug.
    pattern: 'rovodev-acp-stdio-streams-limit',
    match: /stdio_streams\(\)\s+got\s+an\s+unexpected\s+keyword\s+argument\s+['"]limit['"]/i,
    hint: (agent) =>
      `${agent} could not start its ACP server: its bundled Python dependencies are out of sync ` +
      `(stdio_streams() got an unexpected keyword argument 'limit'). This is a known bug inside the ` +
      `${agent} CLI itself — please update it (for acli: \`brew upgrade acli\` or rerun the org installer) ` +
      `and report the traceback to the ${agent} maintainers if it persists.`,
  },
  {
    pattern: 'http-403-forbidden',
    // Many agents print "403 Forbidden" or "HTTP 403" on auth/network failure.
    match: /\b(?:HTTP\s+)?403(?:\s+Forbidden)?\b/i,
    hint: (agent) =>
      `${agent} backend returned 403 Forbidden on startup. The most common causes are: ` +
      `(1) you are not connected to the corporate VPN, ` +
      `(2) your account does not have access to the configured site, or ` +
      `(3) credentials are stale (try re-running the agent's auth command, e.g. \`acli rovodev auth\`).`,
  },
  {
    pattern: 'http-401-unauthorized',
    match: /\b(?:HTTP\s+)?401(?:\s+Unauthorized)?\b/i,
    hint: (agent) =>
      `${agent} backend returned 401 Unauthorized on startup. Your credentials are missing or expired — ` +
      `re-run the agent's auth command (e.g. \`acli rovodev auth\`, \`happy connect codex\`, etc.) and try again.`,
  },
  {
    // Older rovodev binaries (e.g. those bundled in JetBrains plugins) gate ACP
    // access behind USER_EMAIL + USER_API_TOKEN env vars instead of reading from
    // ~/.rovodev/config.yml. The access-restriction message appears on stdout
    // (filtered as non-JSON by AcpBackend) but may also appear on stderr.
    pattern: 'rovodev-access-restricted',
    match: /Access Restricted[\s\S]*USER_EMAIL|USER_EMAIL.*USER_API_TOKEN|only available for Atlassian internal users/i,
    hint: (agent) =>
      `${agent} requires USER_EMAIL and USER_API_TOKEN environment variables to use the ACP command. ` +
      `Set them when running happy rovodev: ` +
      `USER_EMAIL=you@atlassian.com USER_API_TOKEN=<token> HAPPY_ROVODEV_COMMAND=<binary> happy rovodev. ` +
      `Your Atlassian API token can be created at https://id.atlassian.com/manage-profile/security/api-tokens`,
  },
  {
    pattern: 'command-not-found',
    // spawn ENOENT message is "spawn <cmd> ENOENT"; we also see "command not found".
    match: /\b(?:spawn\s+\S+\s+ENOENT|command\s+not\s+found)\b/i,
    hint: (agent) =>
      `Could not find the ${agent} executable on PATH. Install it (or fix your PATH) and try again. ` +
      `For Atlassian Rovo Dev, the binary is \`acli\` — see https://developer.atlassian.com/cloud/acli/.`,
  },
] as const

/**
 * Inspect the trailing stderr output of a freshly-exited ACP child process and
 * return a friendly diagnosis if a known fatal pattern is present.
 *
 * @param stderrTail Recent stderr text (the last few KB is plenty — Python
 *                   tracebacks are long but the relevant lines are near the
 *                   bottom).
 * @param agentName  Display name of the agent (e.g. "rovodev", "gemini").
 * @returns A diagnosis, or `null` if no known pattern matches.
 */
export function diagnoseAcpExit(
  stderrTail: string,
  agentName: string,
): AcpExitDiagnosis | null {
  if (!stderrTail) return null
  const display = agentName?.trim() || 'agent'
  for (const rule of RULES) {
    if (rule.match.test(stderrTail)) {
      return { hint: rule.hint(display), pattern: rule.pattern }
    }
  }
  return null
}
