export type AcpAgentConfig = {
  command: string;
  args: string[];
};

export const KNOWN_ACP_AGENTS: Record<string, AcpAgentConfig> = {
  gemini: { command: 'gemini', args: ['--experimental-acp'] },
  opencode: { command: 'opencode', args: ['acp'] },
  // Atlassian Rovo Dev CLI exposes an ACP server via `acli rovodev acp`.
  // Users do not need a separate Happy auth step for rovodev itself — `acli`
  // handles its own auth out-of-band; Happy still pairs with the mobile app
  // via the normal QR flow in authAndSetupMachineIfNeeded().
  rovodev: { command: 'acli', args: ['rovodev', 'acp'] },
};

/**
 * Per-call override for the rovodev ACP launcher.
 *
 * If `HAPPY_ROVODEV_COMMAND` is set, Happy launches that binary in place of
 * `acli rovodev acp` (e.g. a pinned working build of Atlassian's
 * `atlassian_cli_rovodev` PyInstaller bundle).
 *
 * Workaround context: some `acli` stable releases ship a `rovodev` payload
 * whose embedded `acp` Python SDK is incompatible with
 * `rovodev.commands.acp.command.run_acp_server` — the
 * `stdio_streams() got an unexpected keyword argument 'limit'` TypeError. See
 * the matching detection rule in `acpStderrDiagnostics.ts`.
 *
 * The override binary is invoked with the `acp` subcommand plus any
 * passthrough args, matching the shape `acli rovodev acp [args]` expects.
 */
function rovodevOverrideFromEnv(): AcpAgentConfig | null {
  const override = process.env.HAPPY_ROVODEV_COMMAND?.trim();
  if (!override) return null;
  return { command: override, args: ['acp'] };
}

export type ResolvedAcpAgentConfig = {
  agentName: string;
  command: string;
  args: string[];
};

export function resolveAcpAgentConfig(cliArgs: string[]): ResolvedAcpAgentConfig {
  if (cliArgs.length === 0) {
    throw new Error('Usage: happy acp <agent-name> or happy acp -- <command> [args]');
  }

  if (cliArgs[0] === '--') {
    const command = cliArgs[1];
    if (!command) {
      throw new Error('Missing command after "--". Usage: happy acp -- <command> [args]');
    }
    return {
      agentName: command,
      command,
      args: cliArgs.slice(2),
    };
  }

  const agentName = cliArgs[0];
  const known = KNOWN_ACP_AGENTS[agentName];
  if (known) {
    const passthroughArgs = cliArgs
      .slice(1)
      // Backward-compatible with old OpenCode docs/flags.
      .filter((arg) => !(agentName === 'opencode' && arg === '--acp'));
    // Honor HAPPY_ROVODEV_COMMAND as a per-invocation override for the
    // (currently broken in `acli` stable) rovodev ACP launcher.
    const base = agentName === 'rovodev' ? (rovodevOverrideFromEnv() ?? known) : known;
    return {
      agentName,
      command: base.command,
      args: [...base.args, ...passthroughArgs],
    };
  }

  return {
    agentName,
    command: agentName,
    args: cliArgs.slice(1),
  };
}
