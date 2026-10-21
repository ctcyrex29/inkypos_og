import assert from "node:assert/strict";
import { createPinHash, verifyPin } from "../src/utils/security";

async function main() {
  const hash = await createPinHash("1234");
  assert.ok(typeof hash === "string" && hash.includes(":"));
  assert.equal(await verifyPin("1234", hash), true);
  assert.equal(await verifyPin("9999", hash), false);
  console.log("security hash checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
