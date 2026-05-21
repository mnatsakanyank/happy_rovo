/**
 * Unit tests for {@link parseDaemonLockPidFromPath}.
 *
 * Covers the orphan-recovery path used by stopDaemon (and indirectly by
 * `pnpm cli:install` and `happy daemon start`) when daemon.state.json has
 * been deleted but the lock file still points at a real process.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseDaemonLockPidFromPath } from './persistence';

describe('parseDaemonLockPidFromPath', () => {
    let tmpDir: string;
    let lockFile: string;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'happy-lockpid-test-'));
        lockFile = join(tmpDir, 'daemon.state.json.lock');
    });

    afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
    });

    it('returns null when the lock file does not exist', () => {
        expect(parseDaemonLockPidFromPath(lockFile)).toBeNull();
    });

    it('returns the PID when the lock file contains a positive integer', () => {
        writeFileSync(lockFile, '12345');
        expect(parseDaemonLockPidFromPath(lockFile)).toBe(12345);
    });

    it('trims surrounding whitespace and newlines (real daemons write with no trailing newline but be defensive)', () => {
        writeFileSync(lockFile, '  98765\n');
        expect(parseDaemonLockPidFromPath(lockFile)).toBe(98765);
    });

    it('returns null for an empty file', () => {
        writeFileSync(lockFile, '');
        expect(parseDaemonLockPidFromPath(lockFile)).toBeNull();
    });

    it('returns null for whitespace-only contents', () => {
        writeFileSync(lockFile, '   \n  ');
        expect(parseDaemonLockPidFromPath(lockFile)).toBeNull();
    });

    it('returns null for non-numeric contents', () => {
        writeFileSync(lockFile, 'not-a-pid');
        expect(parseDaemonLockPidFromPath(lockFile)).toBeNull();
    });

    it('returns null for non-integer numbers', () => {
        writeFileSync(lockFile, '12.34');
        expect(parseDaemonLockPidFromPath(lockFile)).toBeNull();
    });

    it('returns null for zero or negative PIDs (these would target process groups, not what we want)', () => {
        writeFileSync(lockFile, '0');
        expect(parseDaemonLockPidFromPath(lockFile)).toBeNull();
        writeFileSync(lockFile, '-1');
        expect(parseDaemonLockPidFromPath(lockFile)).toBeNull();
    });

    it('returns null when the path points at a directory (read fails)', () => {
        // tmpDir exists, but it's a directory not a file — readFileSync throws.
        expect(parseDaemonLockPidFromPath(tmpDir)).toBeNull();
    });
});
