import { authAndSetupMachineIfNeeded } from '@/ui/auth'
import { ensureDaemonRunning } from '@/daemon/ensureDaemonRunning'
import { runAcp, resolveAcpAgentConfig } from '@/agent/acp'

/**
 * Handles `happy rovodev` — runs the Atlassian Rovo Dev CLI under Happy's
 * generic ACP runner so users get the same QR-pairing + mobile control as
 * `happy claude` / `happy codex` / `happy gemini`.
 *
 * Rovo Dev itself is already authenticated out-of-band via `acli rovodev auth`,
 * so no vendor-specific auth step is required here. Happy still pairs with the
 * mobile app via {@link authAndSetupMachineIfNeeded} (which renders the QR).
 *
 * Any unrecognized flags after the subcommand are forwarded to `acli rovodev acp`,
 * e.g. `happy rovodev --site-url https://example.atlassian.net`.
 *
 * ## Binary resolution
 *
 * By default Happy spawns `acli rovodev acp`. If you need to point at a
 * different Rovo Dev binary (e.g. the one bundled inside the JetBrains plugin,
 * which may be a different version), set:
 *
 *   HAPPY_ROVODEV_COMMAND=/path/to/atlassian_cli_rovodev happy rovodev
 *
 * When `HAPPY_ROVODEV_COMMAND` is set, Happy invokes that binary directly with
 * just `acp` (and any passthrough flags) instead of going via `acli rovodev`.
 */
export async function handleRovodevCommand(args: string[]): Promise<void> {
  let startedBy: 'daemon' | 'terminal' | undefined = undefined
  let verbose = false
  const passthroughArgs: string[] = []

  // args[0] is the subcommand name itself ("rovodev"); start at index 1.
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--started-by') {
      startedBy = args[++i] as 'daemon' | 'terminal'
      continue
    }
    if (args[i] === '--verbose') {
      verbose = true
      continue
    }
    passthroughArgs.push(args[i])
  }

  // Allow users to override the rovodev binary — useful when `acli rovodev acp`
  // is broken in the installed version but a working binary is available elsewhere
  // (e.g. the JetBrains plugin ships its own rovodev build).
  const customBinary = process.env.HAPPY_ROVODEV_COMMAND?.trim()
  let command: string
  let acpArgs: string[]

  if (customBinary) {
    // Direct binary: invoke as `<binary> acp [passthrough...]`
    command = customBinary
    acpArgs = ['acp', ...passthroughArgs]
  } else {
    // Default: resolve through KNOWN_ACP_AGENTS → `acli rovodev acp [passthrough...]`
    const resolved = resolveAcpAgentConfig(['rovodev', ...passthroughArgs])
    command = resolved.command
    acpArgs = resolved.args
  }

  const { credentials } = await authAndSetupMachineIfNeeded()
  await ensureDaemonRunning()

  await runAcp({
    credentials,
    startedBy,
    verbose,
    agentName: 'rovodev',
    command,
    args: acpArgs,
  })
}
