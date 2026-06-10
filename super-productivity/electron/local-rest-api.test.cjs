const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const Module = require('node:module');

require('ts-node/register/transpile-only');

const originalModuleLoad = Module._load;
const localRestApiModulePath = path.resolve(__dirname, 'local-rest-api.ts');
const LOCAL_REST_API_PORT = 3876;

let ipcResponseHandler;
let appReady;
let sentToRenderer;
let focusCalls;
let warnCalls;

const resetModule = () => {
  delete require.cache[localRestApiModulePath];
};

const installMocks = () => {
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') {
      return {
        ipcMain: {
          on: (eventName, handler) => {
            if (eventName === 'LOCAL_REST_API_RESPONSE') {
              ipcResponseHandler = handler;
            }
          },
        },
      };
    }

    if (request === 'electron-log/main') {
      return {
        log: () => {},
        warn: (...args) => warnCalls.push(args),
      };
    }

    if (request === './main-window') {
      return {
        getIsAppReady: () => appReady,
        getWin: () => ({
          webContents: {
            send: (eventName, payload) => {
              sentToRenderer.push({ eventName, payload });
              setImmediate(() => {
                ipcResponseHandler({}, {
                  requestId: payload.requestId,
                  status: 202,
                  body: {
                    ok: true,
                    data: {
                      acceptedType: payload.body && payload.body.type,
                    },
                  },
                });
              });
            },
          },
        }),
      };
    }

    if (request === './various-shared') {
      return {
        showOrFocus: () => {
          focusCalls += 1;
        },
      };
    }

    if (request === '../src/app/features/config/global-config.model') {
      return {};
    }

    return originalModuleLoad.call(this, request, parent, isMain);
  };
};

const makeConfig = ({ localRest = false, companion = false } = {}) => ({
  misc: {
    isLocalRestApiEnabled: localRest,
    isDesktopCompanionEnabled: companion,
  },
});

const listen = (server) => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(LOCAL_REST_API_PORT, '127.0.0.1', () => {
    server.off('error', reject);
    resolve();
  });
});

const close = (server) => new Promise((resolve, reject) => {
  if (!server.listening) {
    resolve();
    return;
  }
  server.close((err) => (err ? reject(err) : resolve()));
});

const isPortFree = async () => {
  const probe = http.createServer();
  try {
    await listen(probe);
    return true;
  } catch {
    return false;
  } finally {
    await close(probe);
  }
};

const requestJson = ({ method = 'GET', path: requestPath, body, headers = {} }) =>
  new Promise((resolve, reject) => {
    const payload = body === undefined ? '' : JSON.stringify(body);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: LOCAL_REST_API_PORT,
        path: requestPath,
        method,
        headers: {
          ...headers,
          ...(payload
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
              }
            : {}),
        },
        timeout: 2000,
      },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          text += chunk;
        });
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            body: text ? JSON.parse(text) : null,
          });
        });
      },
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error(`${method} ${requestPath} timed out`));
    });
    req.end(payload);
  });

const waitForServer = async () => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 2000) {
    try {
      const response = await requestJson({ path: '/health' });
      if (response.status === 200) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('local REST API server did not start');
};

test.beforeEach(() => {
  ipcResponseHandler = null;
  appReady = true;
  sentToRenderer = [];
  focusCalls = 0;
  warnCalls = [];
  installMocks();
});

test.afterEach(() => {
  Module._load = originalModuleLoad;
  resetModule();
});

test('desktop companion command starts the local server and forwards through renderer IPC', async (t) => {
  if (!(await isPortFree())) {
    t.skip(`127.0.0.1:${LOCAL_REST_API_PORT} is already in use`);
    return;
  }

  const { initLocalRestApi, updateLocalRestApiConfig } = require(localRestApiModulePath);

  try {
    initLocalRestApi();
    assert.equal(typeof ipcResponseHandler, 'function');

    updateLocalRestApiConfig(makeConfig({ localRest: true, companion: false }));
    await waitForServer();

    const disabled = await requestJson({
      method: 'POST',
      path: '/companion-command',
      body: { type: 'openApp' },
    });
    assert.equal(disabled.status, 403);
    assert.equal(disabled.body.error.code, 'COMPANION_DISABLED');
    assert.equal(sentToRenderer.length, 0);

    const localRestRoute = await requestJson({ path: '/status' });
    assert.equal(localRestRoute.status, 202);
    assert.equal(sentToRenderer.at(-1).payload.path, '/status');

    updateLocalRestApiConfig(makeConfig({ localRest: false, companion: true }));

    const accepted = await requestJson({
      method: 'POST',
      path: '/companion-command',
      body: { type: 'pauseCurrentTask', taskId: 'task-1' },
    });

    assert.equal(accepted.status, 202);
    assert.deepEqual(accepted.body, {
      ok: true,
      data: { acceptedType: 'pauseCurrentTask' },
    });
    assert.equal(focusCalls, 1);
    assert.equal(sentToRenderer.at(-1).eventName, 'LOCAL_REST_API_REQUEST');
    assert.equal(sentToRenderer.at(-1).payload.method, 'POST');
    assert.equal(sentToRenderer.at(-1).payload.path, '/companion-command');
    assert.deepEqual(sentToRenderer.at(-1).payload.body, {
      type: 'pauseCurrentTask',
      taskId: 'task-1',
    });

    const broaderRouteDisabled = await requestJson({ path: '/status' });
    assert.equal(broaderRouteDisabled.status, 404);
    assert.equal(warnCalls.length, 0);
  } finally {
    updateLocalRestApiConfig(makeConfig());
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
});
