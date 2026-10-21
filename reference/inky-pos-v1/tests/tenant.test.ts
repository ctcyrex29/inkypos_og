import assert from "node:assert/strict";
import { getPortalContext } from "../src/utils/tenant";

const platform = getPortalContext("super_admin");
assert.equal(platform.portalType, "platform");
assert.ok(platform.sections.includes("Companies"));

const company = getPortalContext("cashier");
assert.equal(company.portalType, "company");
assert.ok(company.sections.includes("Sales"));
assert.equal(company.canAccessPos, true);

console.log("tenant portal mapping checks passed");
