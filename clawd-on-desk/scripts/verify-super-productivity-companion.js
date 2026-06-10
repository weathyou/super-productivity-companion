"use strict";

const assert = require("node:assert");
const http = require("node:http");
const path = require("node:path");

const initServer = require("../src/server");
const initState = require("../src/state");
const themeLoader = require("../src/theme-loader");
const {
  CLAWD_SERVER_HEADER,
  CLAWD_SERVER_ID,
} = require("../hooks/server-config");
const {
  sendCompanionCommand,
} = require("../src/productivity-command-client");

themeLoader.init(path.join(__dirname, "..", "src"));

function requestJson({ port, path: requestPath, method = "GET", body }) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? "" : JSON.stringify(body);
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: requestPath,
        method,
        headers: payload
          ? {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(payload),
            }
          : undefined,
        timeout: 2000,
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          text += chunk;
        });
        res.on("end", () => {
          let parsed = null;
          if (text) {
            try {
              parsed = JSON.parse(text);
            } catch {
              parsed = null;
            }
          }
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: parsed,
            rawBody: text,
          });
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error(`Request timed out: ${method} ${requestPath}`));
    });
    req.end(payload);
  });
}

function listen(server, host = "127.0.0.1", port = 0) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      const address = server.address();
      resolve(address.port);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    if (!server || !server.listening) {
      resolve();
      return;
    }
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

async function getFreePort() {
  const server = http.createServer();
  const port = await listen(server);
  await close(server);
  return port;
}

async function waitForClawdServer(api, timeoutMs = 2000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const status = api.getRuntimeStatus();
    if (status && status.listening && Number.isInteger(status.port)) return status;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Clawd companion HTTP server did not start");
}

function makeStateCtx() {
  const ctx = {
    lang: "en",
    theme: themeLoader.loadTheme("clawd"),
    doNotDisturb: false,
    miniTransitioning: false,
    miniMode: false,
    mouseOverPet: false,
    idlePaused: false,
    forceEyeResend: false,
    eyePauseUntil: 0,
    mouseStillSince: Date.now(),
    miniSleepPeeked: false,
    pendingPermissions: [],
    playSound: () => {},
    sendToRenderer: () => {},
    syncHitWin: () => {},
    sendToHitWin: () => {},
    miniPeekIn: () => {},
    miniPeekOut: () => {},
    buildContextMenu: () => {},
    buildTrayMenu: () => {},
    resolvePermissionEntry: () => {},
    dismissPermissionsForDnd: () => {},
    focusTerminalWindow: () => {},
    focusHostPlatform: "win32",
    getCursorScreenPoint: () => ({ x: 0, y: 0 }),
    processKill: () => {
      const err = new Error("ESRCH");
      err.code = "ESRCH";
      throw err;
    },
  };
  return ctx;
}

async function verifyProductivityStateRoute() {
  let runtimePort = null;
  const requestedPort = await getFreePort();
  const stateCtx = makeStateCtx();
  const stateApi = initState(stateCtx);
  const serverApi = initServer({
    ...stateCtx,
    updateProductivityState: stateApi.updateProductivityState,
    getProductivityState: stateApi.getProductivityState,
    manageClaudeHooksAutomatically: false,
    isAgentEnabled: () => false,
    getPortCandidates: () => [requestedPort],
    readRuntimePort: () => runtimePort,
    writeRuntimeConfig: (port) => {
      runtimePort = port;
      return true;
    },
    clearRuntimeConfig: () => {
      runtimePort = null;
      return true;
    },
    setImmediate: (fn) => setTimeout(fn, 0),
  });

  try {
    serverApi.startHttpServer();
    const status = await waitForClawdServer(serverApi);
    assert.strictEqual(status.port, requestedPort);
    assert.strictEqual(status.runtimeMatches, true);

    const response = await requestJson({
      port: requestedPort,
      path: "/productivity-state",
      method: "POST",
      body: {
        source: "super-productivity",
        schemaVersion: 1,
        sentAt: Date.now(),
        state: {
          mode: "working",
          currentTask: {
            id: "task-1",
            title: "Integration smoke task",
          },
          timer: {
            isRunning: true,
            elapsedToday: 750000,
          },
          day: {
            plannedTaskCount: 4,
            completedTaskCount: 2,
            totalTrackedMs: 750000,
          },
          nextReminder: {
            taskId: "task-2",
            title: "Follow up",
            dueAt: Date.now() + 60000,
          },
        },
      },
    });

    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(response.headers[CLAWD_SERVER_HEADER], CLAWD_SERVER_ID);
    assert.deepStrictEqual(response.body, { ok: true, acceptedSchemaVersion: 1 });
    assert.strictEqual(stateApi.getCurrentState(), "working");
    assert.strictEqual(stateApi.getProductivityState().state.currentTask.id, "task-1");
    assert.strictEqual(stateApi.getProductivityState().state.day.completedTaskCount, 2);

    const badSchema = await requestJson({
      port: requestedPort,
      path: "/productivity-state",
      method: "POST",
      body: {
        source: "super-productivity",
        schemaVersion: 99,
        sentAt: Date.now(),
        state: { mode: "working" },
      },
    });
    assert.strictEqual(badSchema.statusCode, 409);
    assert.strictEqual(stateApi.getProductivityState().schemaVersion, 1);

    return { clawdPort: requestedPort };
  } finally {
    serverApi.cleanup();
    stateApi.cleanup();
  }
}

async function verifyCompanionCommands() {
  const received = [];
  const fakeSuperProductivity = http.createServer((req, res) => {
    assert.strictEqual(req.method, "POST");
    assert.strictEqual(req.url, "/companion-command");
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      received.push(JSON.parse(body));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, data: { accepted: true } }));
    });
  });

  const port = await listen(fakeSuperProductivity);
  try {
    assert.strictEqual((await sendCompanionCommand({ type: "openApp" }, { port })).ok, true);
    assert.strictEqual(
      (await sendCompanionCommand({ type: "pauseCurrentTask", taskId: " task-1 " }, { port })).ok,
      true,
    );
    assert.strictEqual(
      (await sendCompanionCommand({ type: "quickAddTask", title: " Clipboard task " }, { port })).ok,
      true,
    );

    const invalid = await sendCompanionCommand({ type: "completeCurrentTask" }, { port });
    assert.strictEqual(invalid.ok, false);
    assert.strictEqual(invalid.error, "invalid_command");

    assert.deepStrictEqual(received, [
      { type: "openApp" },
      { type: "pauseCurrentTask", taskId: "task-1" },
      { type: "quickAddTask", title: "Clipboard task" },
    ]);
    return { superProductivityPort: port, commandCount: received.length };
  } finally {
    await close(fakeSuperProductivity);
  }
}

async function main() {
  const stateResult = await verifyProductivityStateRoute();
  const commandResult = await verifyCompanionCommands();

  console.log("Super Productivity companion bridge smoke passed");
  console.log(`- Clawd /productivity-state accepted snapshot on port ${stateResult.clawdPort}`);
  console.log(
    `- Clawd command client sent ${commandResult.commandCount} sanitized commands to fake Super Productivity on port ${commandResult.superProductivityPort}`,
  );
}

main().catch((err) => {
  console.error("Super Productivity companion bridge smoke failed");
  console.error(err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
