import { ipcMain } from 'electron';
import { warn } from 'electron-log/main';
import { readFileSync } from 'fs';
import { request } from 'http';
import { homedir } from 'os';
import { join } from 'path';
import { IPC } from './shared-with-frontend/ipc-events.const';
import {
  DESKTOP_COMPANION_SCHEMA_VERSION,
  DesktopCompanionPublishResult,
  ProductivityCompanionState,
  ProductivityStateRequest,
} from './shared-with-frontend/desktop-companion.model';

const CLAWD_SERVER_ID = 'clawd-on-desk';
const CLAWD_SERVER_HEADER = 'x-clawd-server';
const CLAWD_HOST = '127.0.0.1';
const CLAWD_PORTS = [23333, 23334, 23335, 23336, 23337] as const;
const PRODUCTIVITY_STATE_PATH = '/productivity-state';
const RUNTIME_CONFIG_PATH = join(homedir(), '.clawd', 'runtime.json');
const REQUEST_TIMEOUT_MS = 500;
const MAX_RESPONSE_BYTES = 4096;

let isInitialized = false;
let lastSuccessfulPort: number | undefined;

const normalizePort = (value: unknown): number | undefined => {
  const port = Number(value);
  return Number.isInteger(port) &&
    CLAWD_PORTS.includes(port as (typeof CLAWD_PORTS)[number])
    ? port
    : undefined;
};

const readRuntimePort = (): number | undefined => {
  try {
    const raw = JSON.parse(readFileSync(RUNTIME_CONFIG_PATH, 'utf8')) as {
      app?: unknown;
      port?: unknown;
    };
    if (raw?.app !== CLAWD_SERVER_ID) {
      return undefined;
    }
    return normalizePort(raw.port);
  } catch {
    return undefined;
  }
};

export const getDesktopCompanionPortCandidates = (
  runtimePort = readRuntimePort(),
): number[] => {
  const candidates: number[] = [];
  const add = (port: number | undefined): void => {
    if (port && !candidates.includes(port)) {
      candidates.push(port);
    }
  };

  add(lastSuccessfulPort);
  add(runtimePort);
  CLAWD_PORTS.forEach(add);
  return candidates;
};

const isClawdResponse = (
  headers: Record<string, string | string[] | undefined>,
): boolean => {
  const header = headers[CLAWD_SERVER_HEADER];
  return Array.isArray(header)
    ? header[0] === CLAWD_SERVER_ID
    : header === CLAWD_SERVER_ID;
};

const postToPort = (
  port: number,
  body: ProductivityStateRequest,
): Promise<DesktopCompanionPublishResult> =>
  new Promise((resolve) => {
    const payload = JSON.stringify(body);
    let responseBody = '';
    let settled = false;
    const settle = (result: DesktopCompanionPublishResult): void => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    };

    const req = request(
      {
        hostname: CLAWD_HOST,
        port,
        path: PRODUCTIVITY_STATE_PATH,
        method: 'POST',
        headers: {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          'Content-Type': 'application/json',
          // eslint-disable-next-line @typescript-eslint/naming-convention
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: REQUEST_TIMEOUT_MS,
      },
      (res) => {
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          if (responseBody.length < MAX_RESPONSE_BYTES) {
            responseBody += chunk;
          }
        });
        res.on('end', () => {
          const isClawd = isClawdResponse(res.headers);
          const ok =
            res.statusCode !== undefined &&
            res.statusCode >= 200 &&
            res.statusCode < 300 &&
            isClawd;
          const unsupportedSchema = isClawd && res.statusCode === 409;
          settle({ ok, port: ok ? port : undefined, unsupportedSchema });
        });
      },
    );

    req.on('error', () => settle({ ok: false }));
    req.on('timeout', () => {
      req.destroy();
      settle({ ok: false });
    });
    req.end(payload);
  });

export const publishDesktopCompanionState = async (
  state: ProductivityCompanionState,
): Promise<DesktopCompanionPublishResult> => {
  const body: ProductivityStateRequest = {
    source: 'super-productivity',
    schemaVersion: DESKTOP_COMPANION_SCHEMA_VERSION,
    sentAt: Date.now(),
    state,
  };

  for (const port of getDesktopCompanionPortCandidates()) {
    const result = await postToPort(port, body);
    if (result.ok) {
      lastSuccessfulPort = port;
      return result;
    }
    if (result.unsupportedSchema) {
      return result;
    }
  }

  return { ok: false };
};

export const initDesktopCompanionPublisher = (): void => {
  if (isInitialized) {
    return;
  }
  isInitialized = true;

  ipcMain.handle(
    IPC.DESKTOP_COMPANION_PUBLISH_STATE,
    async (
      _event,
      state: ProductivityCompanionState,
    ): Promise<DesktopCompanionPublishResult> => {
      try {
        return await publishDesktopCompanionState(state);
      } catch (error) {
        warn('[desktop-companion] Failed to publish state', error);
        return { ok: false };
      }
    },
  );
};
