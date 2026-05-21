import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { KNOWN_ACP_AGENTS, resolveAcpAgentConfig } from './acpAgentConfig';

describe('KNOWN_ACP_AGENTS', () => {
  it('defines built-in Gemini, OpenCode and Rovo Dev command mappings', () => {
    expect(KNOWN_ACP_AGENTS).toEqual({
      gemini: { command: 'gemini', args: ['--experimental-acp'] },
      opencode: { command: 'opencode', args: ['acp'] },
      rovodev: { command: 'acli', args: ['rovodev', 'acp'] },
    });
  });
});

describe('resolveAcpAgentConfig', () => {
  it('resolves known agent names to predefined command + args', () => {
    expect(resolveAcpAgentConfig(['gemini'])).toEqual({
      agentName: 'gemini',
      command: 'gemini',
      args: ['--experimental-acp'],
    });
  });

  it('appends extra CLI args for known agent aliases', () => {
    expect(resolveAcpAgentConfig(['opencode', '--foo'])).toEqual({
      agentName: 'opencode',
      command: 'opencode',
      args: ['acp', '--foo'],
    });
  });

  it('resolves rovodev to `acli rovodev acp` and forwards extra args', () => {
    expect(resolveAcpAgentConfig(['rovodev'])).toEqual({
      agentName: 'rovodev',
      command: 'acli',
      args: ['rovodev', 'acp'],
    });
    expect(resolveAcpAgentConfig(['rovodev', '--site-url', 'https://example.atlassian.net'])).toEqual({
      agentName: 'rovodev',
      command: 'acli',
      args: ['rovodev', 'acp', '--site-url', 'https://example.atlassian.net'],
    });
  });

  it('strips legacy --acp for opencode compatibility', () => {
    expect(resolveAcpAgentConfig(['opencode', '--acp', '--foo'])).toEqual({
      agentName: 'opencode',
      command: 'opencode',
      args: ['acp', '--foo'],
    });
  });

  it('resolves custom command form with -- separator', () => {
    expect(resolveAcpAgentConfig(['--', 'custom-agent', '--flag'])).toEqual({
      agentName: 'custom-agent',
      command: 'custom-agent',
      args: ['--flag'],
    });
  });

  it('treats unknown agent names as direct commands', () => {
    expect(resolveAcpAgentConfig(['my-agent', '--x'])).toEqual({
      agentName: 'my-agent',
      command: 'my-agent',
      args: ['--x'],
    });
  });

  it('throws with helpful usage when no args are provided', () => {
    expect(() => resolveAcpAgentConfig([])).toThrow('Usage: happy acp <agent-name> or happy acp -- <command> [args]');
  });

  it('throws when separator form omits command', () => {
    expect(() => resolveAcpAgentConfig(['--'])).toThrow('Missing command after "--". Usage: happy acp -- <command> [args]');
  });

  describe('HAPPY_ROVODEV_COMMAND override', () => {
    let originalValue: string | undefined;

    beforeEach(() => {
      originalValue = process.env.HAPPY_ROVODEV_COMMAND;
    });

    afterEach(() => {
      if (originalValue === undefined) {
        delete process.env.HAPPY_ROVODEV_COMMAND;
      } else {
        process.env.HAPPY_ROVODEV_COMMAND = originalValue;
      }
    });

    it('routes rovodev through HAPPY_ROVODEV_COMMAND when set', () => {
      process.env.HAPPY_ROVODEV_COMMAND = '/tmp/atlassian_cli_rovodev';
      expect(resolveAcpAgentConfig(['rovodev'])).toEqual({
        agentName: 'rovodev',
        command: '/tmp/atlassian_cli_rovodev',
        args: ['acp'],
      });
    });

    it('forwards passthrough args when HAPPY_ROVODEV_COMMAND is set', () => {
      process.env.HAPPY_ROVODEV_COMMAND = '/tmp/atlassian_cli_rovodev';
      expect(
        resolveAcpAgentConfig(['rovodev', '--site-url', 'https://example.atlassian.net'])
      ).toEqual({
        agentName: 'rovodev',
        command: '/tmp/atlassian_cli_rovodev',
        args: ['acp', '--site-url', 'https://example.atlassian.net'],
      });
    });

    it('treats empty / whitespace HAPPY_ROVODEV_COMMAND as unset', () => {
      process.env.HAPPY_ROVODEV_COMMAND = '   ';
      expect(resolveAcpAgentConfig(['rovodev'])).toEqual({
        agentName: 'rovodev',
        command: 'acli',
        args: ['rovodev', 'acp'],
      });
    });

    it('does not affect other known agents', () => {
      process.env.HAPPY_ROVODEV_COMMAND = '/tmp/atlassian_cli_rovodev';
      expect(resolveAcpAgentConfig(['gemini'])).toEqual({
        agentName: 'gemini',
        command: 'gemini',
        args: ['--experimental-acp'],
      });
    });
  });
});
