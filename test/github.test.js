import test from "node:test";
import assert from "node:assert/strict";
import { createGitHubClient, decodeContent } from "../src/github.js";

test("rejects oversized manifests before decoding", () => {
  assert.throws(() => decodeContent({ encoding: "base64", size: 300_000, content: "eA==" }), /inspection limit/);
});

test("wraps timeouts raised while reading an error response body", async () => {
  // 模拟真实慢网络下的 504：响应头先到达，body 读取因超时中止
  const timeout = new Error("The operation was aborted due to timeout");
  timeout.name = "TimeoutError";
  const fetchImplementation = async () => ({
    ok: false,
    status: 504,
    text: () => Promise.reject(timeout)
  });
  const client = createGitHubClient(fetchImplementation, null);
  await assert.rejects(() => client.repository("acme", "widget"), /timed out for \/repos\/acme\/widget after 15000ms/);
});

test("wraps timeouts raised while reading a success response body", async () => {
  const timeout = new Error("The operation was aborted due to timeout");
  timeout.name = "TimeoutError";
  const fetchImplementation = async () => ({
    ok: true,
    status: 200,
    text: () => Promise.resolve("{}"),
    json: () => Promise.reject(timeout)
  });
  const client = createGitHubClient(fetchImplementation, null);
  await assert.rejects(() => client.repository("acme", "widget"), /timed out for \/repos\/acme\/widget/);
});

test("keeps non-timeout body failures unwrapped", async () => {
  const fetchImplementation = async () => ({
    ok: true,
    status: 200,
    text: () => Promise.resolve("not json"),
    json: () => Promise.reject(new SyntaxError("Unexpected token"))
  });
  const client = createGitHubClient(fetchImplementation, null);
  await assert.rejects(() => client.repository("acme", "widget"), /Unexpected token/);
});
