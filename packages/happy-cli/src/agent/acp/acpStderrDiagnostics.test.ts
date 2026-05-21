import { describe, it, expect } from 'vitest'
import { diagnoseAcpExit } from './acpStderrDiagnostics'

const ROVODEV_REAL_TRACEBACK = `
2026-05-19 15:42:11.524 | ERROR    | rovodev.commands.acp.command:acp:38 - ACP server error: stdio_streams() got an unexpected keyword argument 'limit'
Traceback (most recent call last):
  File "rovodev/commands/acp/command.py", line 34, in acp
  File "asyncio/runners.py", line 194, in run
  File "asyncio/runners.py", line 118, in run
  File "asyncio/base_events.py", line 720, in run_until_complete
  File "rovodev/commands/acp/command.py", line 29, in run_acp_server
TypeError: stdio_streams() got an unexpected keyword argument 'limit'

During handling of the above exception, another exception occurred:

Traceback (most recent call last):
  File "__main__.py", line 5, in <module>
acp.exceptions.RequestError: Internal error
[PYI-40203:ERROR] Failed to execute script '__main__' due to unhandled exception!
✗ Error: failed to execute the command
`

describe('diagnoseAcpExit', () => {
  it('returns null for empty input', () => {
    expect(diagnoseAcpExit('', 'rovodev')).toBeNull()
    expect(diagnoseAcpExit('   ', 'rovodev')).toBeNull()
  })

  it('returns null when no known pattern matches', () => {
    expect(diagnoseAcpExit('some other unrelated error output', 'rovodev')).toBeNull()
  })

  it('detects the rovodev stdio_streams(limit=…) TypeError', () => {
    const result = diagnoseAcpExit(ROVODEV_REAL_TRACEBACK, 'rovodev')
    expect(result?.pattern).toBe('rovodev-acp-stdio-streams-limit')
    expect(result?.hint).toContain('rovodev')
    expect(result?.hint).toMatch(/bundled .* dependencies are out of sync/i)
    expect(result?.hint).toContain('brew upgrade acli')
  })

  it('detects 403 Forbidden and mentions VPN', () => {
    const result = diagnoseAcpExit('✗ Error: 403 Forbidden\n', 'rovodev')
    expect(result?.pattern).toBe('http-403-forbidden')
    expect(result?.hint).toMatch(/VPN/i)
    expect(result?.hint).toContain('rovodev')
  })

  it('detects bare "HTTP 403" wording too', () => {
    const result = diagnoseAcpExit('upstream responded HTTP 403\n', 'gemini')
    expect(result?.pattern).toBe('http-403-forbidden')
    expect(result?.hint).toContain('gemini')
  })

  it('detects 401 Unauthorized and suggests re-auth', () => {
    const result = diagnoseAcpExit('401 Unauthorized', 'rovodev')
    expect(result?.pattern).toBe('http-401-unauthorized')
    expect(result?.hint).toMatch(/credentials are missing or expired/i)
  })

  it('detects ENOENT from a failed spawn', () => {
    const result = diagnoseAcpExit('Error: spawn opencode ENOENT', 'opencode')
    expect(result?.pattern).toBe('command-not-found')
    expect(result?.hint).toMatch(/Could not find the opencode executable/i)
  })

  it('detects "command not found" wording from shells', () => {
    const result = diagnoseAcpExit('zsh: command not found: gemini', 'gemini')
    expect(result?.pattern).toBe('command-not-found')
    expect(result?.hint).toContain('gemini')
  })

  it('matches the stdio_streams rule even when 403 also appears (specificity wins by order)', () => {
    // The 403 was an earlier failure; the real fatal is the stdio_streams crash
    // that shows up *after* the network issue is fixed. We list the stdio_streams
    // rule first so it wins regardless of order in the tail.
    const mixed = `${ROVODEV_REAL_TRACEBACK}\nfollowed by: 403 Forbidden retry`
    const result = diagnoseAcpExit(mixed, 'rovodev')
    expect(result?.pattern).toBe('rovodev-acp-stdio-streams-limit')
  })

  it('falls back to the generic "agent" label when name is blank', () => {
    const result = diagnoseAcpExit('403 Forbidden', '')
    expect(result?.hint).toMatch(/^agent backend returned 403/i)
  })
})
