/**
 * @layer core - Small timed file lock helper for duplicate-trigger suppression.
 */

import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

type TimedFileLockOptions = {
  lockFilePath: string;
  ttlMs: number;
  now?: () => number;
};

type TimedFileLockRecord = {
  createdAt?: number;
  expiresAt?: number;
};

export type TimedFileLockResult =
  | {
    acquired: true;
    lockFilePath: string;
    createdAt: number;
    expiresAt: number;
  }
  | {
    acquired: false;
    reason: "active_lock";
    lockFilePath: string;
    createdAt?: number;
    expiresAt?: number;
  };

function getErrorCode(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null || !("code" in err)) {
    return undefined;
  }
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function parseLockRecord(raw: string): TimedFileLockRecord | undefined {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const createdAt =
      typeof parsed.createdAt === "number" && Number.isFinite(parsed.createdAt)
        ? parsed.createdAt
        : undefined;
    const expiresAt =
      typeof parsed.expiresAt === "number" && Number.isFinite(parsed.expiresAt)
        ? parsed.expiresAt
        : undefined;
    if (createdAt !== undefined || expiresAt !== undefined) {
      return { createdAt, expiresAt };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

async function readExistingLock(
  lockFilePath: string,
  ttlMs: number,
): Promise<{ createdAt: number; expiresAt: number } | undefined> {
  try {
    const raw = await readFile(lockFilePath, "utf8");
    const parsed = parseLockRecord(raw);
    if (parsed?.expiresAt !== undefined) {
      const createdAt = parsed.createdAt ?? Math.max(0, parsed.expiresAt - ttlMs);
      return {
        createdAt,
        expiresAt: parsed.expiresAt,
      };
    }
  } catch (err) {
    if (getErrorCode(err) !== "ENOENT") {
      throw err;
    }
    return undefined;
  }

  try {
    const lockStat = await stat(lockFilePath);
    const createdAt = Number.isFinite(lockStat.mtimeMs) ? lockStat.mtimeMs : Date.now();
    return {
      createdAt,
      expiresAt: createdAt + ttlMs,
    };
  } catch (err) {
    if (getErrorCode(err) === "ENOENT") {
      return undefined;
    }
    throw err;
  }
}

export async function tryAcquireTimedFileLock(
  options: TimedFileLockOptions,
): Promise<TimedFileLockResult> {
  const now = options.now ?? Date.now;
  await mkdir(dirname(options.lockFilePath), { recursive: true });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const createdAt = now();
    const expiresAt = createdAt + options.ttlMs;

    try {
      await writeFile(
        options.lockFilePath,
        `${JSON.stringify({ createdAt, expiresAt, pid: process.pid })}\n`,
        { flag: "wx" },
      );
      return {
        acquired: true,
        lockFilePath: options.lockFilePath,
        createdAt,
        expiresAt,
      };
    } catch (err) {
      if (getErrorCode(err) !== "EEXIST") {
        throw err;
      }
    }

    const existingLock = await readExistingLock(options.lockFilePath, options.ttlMs);
    if (existingLock && existingLock.expiresAt > now()) {
      return {
        acquired: false,
        reason: "active_lock",
        lockFilePath: options.lockFilePath,
        createdAt: existingLock.createdAt,
        expiresAt: existingLock.expiresAt,
      };
    }

    try {
      await unlink(options.lockFilePath);
    } catch (err) {
      if (getErrorCode(err) !== "ENOENT") {
        throw err;
      }
    }
  }

  throw new Error(
    `[timed_file_lock] could not replace expired lock at ${options.lockFilePath}.`,
  );
}
