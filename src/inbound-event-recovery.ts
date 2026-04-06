import os from "node:os";
import path from "node:path";
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";

import type { AibotEventMsgPayload } from "./types.js";

const DEFAULT_RECOVERY_BASE_DIR = path.join(os.tmpdir(), "openclaw-grix-inbound-events");
const DEFAULT_RECOVERY_TTL_MS = 48 * 60 * 60 * 1000;

type PersistedInboundEventRecord = {
  version: 1;
  accountId: string;
  recordId: string;
  acked: boolean;
  event: AibotEventMsgPayload;
  createdAt: number;
  updatedAt: number;
};

export type PendingInboundEventHandle = {
  accountId: string;
  recordId: string;
  filePath: string;
  record: PersistedInboundEventRecord;
};

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function resolveRecordId(accountId: string, event: AibotEventMsgPayload): string {
  const eventId = normalizeText(event.event_id);
  if (eventId) {
    return `${accountId}:event:${eventId}`;
  }
  return `${accountId}:message:${normalizeText(event.session_id)}:${normalizeText(event.msg_id)}`;
}

function resolveBaseDir(baseDir?: string): string {
  const normalized = normalizeText(baseDir);
  if (normalized) {
    return path.resolve(normalized);
  }
  return DEFAULT_RECOVERY_BASE_DIR;
}

function resolveRecoveryDir(accountId: string, baseDir?: string): string {
  return path.join(resolveBaseDir(baseDir), encodeURIComponent(accountId));
}

function resolveRecordFilePath(accountId: string, recordId: string, baseDir?: string): string {
  return path.join(
    resolveRecoveryDir(accountId, baseDir),
    `${encodeURIComponent(recordId)}.json`,
  );
}

async function writeRecord(
  record: PersistedInboundEventRecord,
  filePath: string,
): Promise<void> {
  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tempPath, JSON.stringify(record), "utf8");
  await rename(tempPath, filePath);
}

async function readRecord(filePath: string): Promise<PersistedInboundEventRecord | null> {
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as Partial<PersistedInboundEventRecord>;
  if (
    parsed.version !== 1 ||
    normalizeText(parsed.accountId) === "" ||
    normalizeText(parsed.recordId) === ""
  ) {
    return null;
  }
  return {
    version: 1,
    accountId: normalizeText(parsed.accountId),
    recordId: normalizeText(parsed.recordId),
    acked: parsed.acked === true,
    event: (parsed.event ?? {}) as AibotEventMsgPayload,
    createdAt: Number(parsed.createdAt ?? 0) || Date.now(),
    updatedAt: Number(parsed.updatedAt ?? 0) || Date.now(),
  };
}

function buildHandle(record: PersistedInboundEventRecord, filePath: string): PendingInboundEventHandle {
  return {
    accountId: record.accountId,
    recordId: record.recordId,
    filePath,
    record,
  };
}

export async function persistPendingInboundEvent(params: {
  accountId: string;
  event: AibotEventMsgPayload;
  baseDir?: string;
  nowMs?: number;
}): Promise<PendingInboundEventHandle | null> {
  const accountId = normalizeText(params.accountId);
  const sessionId = normalizeText(params.event?.session_id);
  const messageSid = normalizeText(params.event?.msg_id);
  if (!accountId || !sessionId || !messageSid) {
    return null;
  }

  const nowMs = Number.isFinite(Number(params.nowMs))
    ? Math.floor(Number(params.nowMs))
    : Date.now();
  const recordId = resolveRecordId(accountId, params.event);
  const record: PersistedInboundEventRecord = {
    version: 1,
    accountId,
    recordId,
    acked: false,
    event: params.event,
    createdAt: nowMs,
    updatedAt: nowMs,
  };
  const filePath = resolveRecordFilePath(accountId, recordId, params.baseDir);
  await writeRecord(record, filePath);
  return buildHandle(record, filePath);
}

export async function markPendingInboundEventAcked(
  handle: PendingInboundEventHandle | null | undefined,
  params?: {
    nowMs?: number;
  },
): Promise<void> {
  if (!handle) {
    return;
  }
  const nowMs = Number.isFinite(Number(params?.nowMs))
    ? Math.floor(Number(params?.nowMs))
    : Date.now();
  handle.record = {
    ...handle.record,
    acked: true,
    updatedAt: nowMs,
  };
  await writeRecord(handle.record, handle.filePath);
}

export async function deletePendingInboundEvent(
  handle: PendingInboundEventHandle | null | undefined,
): Promise<void> {
  if (!handle) {
    return;
  }
  await rm(handle.filePath, { force: true });
}

export async function loadRecoverablePendingInboundEvents(params: {
  accountId: string;
  baseDir?: string;
  nowMs?: number;
  ttlMs?: number;
}): Promise<PendingInboundEventHandle[]> {
  const accountId = normalizeText(params.accountId);
  if (!accountId) {
    return [];
  }

  const nowMs = Number.isFinite(Number(params.nowMs))
    ? Math.floor(Number(params.nowMs))
    : Date.now();
  const ttlMs = Number.isFinite(Number(params.ttlMs)) && Number(params.ttlMs) > 0
    ? Math.floor(Number(params.ttlMs))
    : DEFAULT_RECOVERY_TTL_MS;
  const directory = resolveRecoveryDir(accountId, params.baseDir);

  let fileNames: string[];
  try {
    fileNames = await readdir(directory);
  } catch {
    return [];
  }

  const handles: PendingInboundEventHandle[] = [];
  for (const fileName of fileNames) {
    if (!fileName.endsWith(".json")) {
      continue;
    }
    const filePath = path.join(directory, fileName);
    try {
      const record = await readRecord(filePath);
      if (!record) {
        await rm(filePath, { force: true });
        continue;
      }
      if (record.accountId != accountId) {
        await rm(filePath, { force: true });
        continue;
      }
      if (record.updatedAt+ttlMs <= nowMs) {
        await rm(filePath, { force: true });
        continue;
      }
      if (!record.acked) {
        continue;
      }
      handles.push(buildHandle(record, filePath));
    } catch {
      await rm(filePath, { force: true });
    }
  }

  handles.sort((left, right) => {
    if (left.record.updatedAt != right.record.updatedAt) {
      return left.record.updatedAt - right.record.updatedAt;
    }
    return left.recordId.localeCompare(right.recordId);
  });
  return handles;
}
