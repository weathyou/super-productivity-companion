"use strict";

const http = require("http");

const SUPER_PRODUCTIVITY_HOST = "127.0.0.1";
const SUPER_PRODUCTIVITY_PORT = 3876;
const COMPANION_COMMAND_PATH = "/companion-command";
const REQUEST_TIMEOUT_MS = 1000;
const MAX_RESPONSE_BYTES = 8192;
const QUICK_ADD_TITLE_MAX_LENGTH = 500;

const VALID_COMMAND_TYPES = new Set([
  "openApp",
  "quickAddTask",
  "openCurrentTask",
  "pauseCurrentTask",
  "resumeCurrentTask",
  "stopCurrentTask",
  "completeCurrentTask",
]);

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function sanitizeCommand(command) {
  if (!isPlainObject(command) || !VALID_COMMAND_TYPES.has(command.type)) return null;
  if (command.type === "openApp") return { type: "openApp" };
  if (command.type === "quickAddTask") {
    if (typeof command.title !== "string" || !command.title.trim()) return null;
    return {
      type: "quickAddTask",
      title: command.title.trim().slice(0, QUICK_ADD_TITLE_MAX_LENGTH),
    };
  }
  if (typeof command.taskId !== "string" || !command.taskId.trim()) return null;
  return {
    type: command.type,
    taskId: command.taskId.trim(),
  };
}

function parseResponseBody(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function sendCompanionCommand(command, options = {}) {
  const sanitized = sanitizeCommand(command);
  if (!sanitized) {
    return Promise.resolve({
      ok: false,
      statusCode: 400,
      error: "invalid_command",
    });
  }

  const host = options.host || SUPER_PRODUCTIVITY_HOST;
  const port = Number.isInteger(options.port) ? options.port : SUPER_PRODUCTIVITY_PORT;
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : REQUEST_TIMEOUT_MS;

  return new Promise((resolve) => {
    const payload = JSON.stringify(sanitized);
    let responseBody = "";
    let settled = false;
    const settle = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const req = http.request(
      {
        hostname: host,
        port,
        path: COMPANION_COMMAND_PATH,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
        timeout: timeoutMs,
      },
      (res) => {
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          if (responseBody.length < MAX_RESPONSE_BYTES) responseBody += chunk;
        });
        res.on("end", () => {
          const parsed = parseResponseBody(responseBody);
          const ok = !!parsed && parsed.ok === true && res.statusCode >= 200 && res.statusCode < 300;
          settle({
            ok,
            statusCode: res.statusCode,
            body: parsed,
            error: ok ? null : (parsed && parsed.error && parsed.error.code) || "request_failed",
          });
        });
      },
    );

    req.on("error", (err) => settle({
      ok: false,
      statusCode: 0,
      error: err && err.code ? err.code : "request_error",
    }));
    req.on("timeout", () => {
      req.destroy();
      settle({ ok: false, statusCode: 0, error: "timeout" });
    });
    req.end(payload);
  });
}

module.exports = {
  SUPER_PRODUCTIVITY_HOST,
  SUPER_PRODUCTIVITY_PORT,
  COMPANION_COMMAND_PATH,
  QUICK_ADD_TITLE_MAX_LENGTH,
  VALID_COMMAND_TYPES,
  sanitizeCommand,
  sendCompanionCommand,
};
