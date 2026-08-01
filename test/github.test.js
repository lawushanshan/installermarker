import test from "node:test";
import assert from "node:assert/strict";
import { decodeContent } from "../src/github.js";

test("rejects oversized manifests before decoding", () => {
  assert.throws(() => decodeContent({ encoding: "base64", size: 300_000, content: "eA==" }), /inspection limit/);
});