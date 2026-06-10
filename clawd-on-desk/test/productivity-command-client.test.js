"use strict";

const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert");
const http = require("http");

const {
  COMPANION_COMMAND_PATH,
  sanitizeCommand,
  sendCompanionCommand,
} = require("../src/productivity-command-client");

let server = null;

function listen(handler) {
  return new Promise((resolve) => {
    server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      resolve(server.address().port);
    });
  });
}

function closeServer() {
  return new Promise((resolve) => {
    if (!server) {
      resolve();
      return;
    }
    server.close(() => {
      server = null;
      resolve();
    });
  });
}

describe("productivity-command-client", () => {
  afterEach(async () => {
    await closeServer();
  });

  it("sanitizes openApp without a task id", () => {
    assert.deepStrictEqual(sanitizeCommand({ type: "openApp", taskId: "ignored" }), {
      type: "openApp",
    });
  });

  it("sanitizes quickAddTask title without a task id", () => {
    assert.deepStrictEqual(sanitizeCommand({ type: "quickAddTask", title: "  New task  " }), {
      type: "quickAddTask",
      title: "New task",
    });
    assert.strictEqual(sanitizeCommand({ type: "quickAddTask", title: "   " }), null);
  });

  it("rejects task commands without task ids", () => {
    assert.strictEqual(sanitizeCommand({ type: "pauseCurrentTask" }), null);
    assert.strictEqual(sanitizeCommand({ type: "not-real", taskId: "task-1" }), null);
  });

  it("posts companion task commands to Super Productivity", async () => {
    let captured = null;
    const port = await listen((req, res) => {
      assert.strictEqual(req.method, "POST");
      assert.strictEqual(req.url, COMPANION_COMMAND_PATH);
      let body = "";
      req.on("data", (chunk) => {
        body += String(chunk);
      });
      req.on("end", () => {
        captured = JSON.parse(body);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, data: { accepted: true } }));
      });
    });

    const result = await sendCompanionCommand(
      { type: "pauseCurrentTask", taskId: " task-1 " },
      { port },
    );

    assert.deepStrictEqual(captured, {
      type: "pauseCurrentTask",
      taskId: "task-1",
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.statusCode, 200);
  });

  it("posts quick add commands to Super Productivity", async () => {
    let captured = null;
    const port = await listen((req, res) => {
      let body = "";
      req.on("data", (chunk) => {
        body += String(chunk);
      });
      req.on("end", () => {
        captured = JSON.parse(body);
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, data: { taskId: "new-task-id" } }));
      });
    });

    const result = await sendCompanionCommand(
      { type: "quickAddTask", title: " Clipboard task " },
      { port },
    );

    assert.deepStrictEqual(captured, {
      type: "quickAddTask",
      title: "Clipboard task",
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.statusCode, 201);
  });

  it("does not send invalid commands", async () => {
    const result = await sendCompanionCommand({ type: "pauseCurrentTask" });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.statusCode, 400);
    assert.strictEqual(result.error, "invalid_command");
  });
});
