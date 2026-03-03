import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { piiScanPayload, redactPIIText } from "./piiScanner.ts";

Deno.test("piiScanPayload detects sensitive fields", () => {
  const payload = {
    note: "Name: Jane Doe, DOB 01/22/1991, SSN 123-45-6789, phone +1 (602) 555-9999",
  };

  const result = piiScanPayload(payload);
  assert(result.blocked);
  assert(result.findings.length >= 3);
});

Deno.test("redactPIIText removes direct PII patterns", () => {
  const input = "Name: Jane Doe Email: jane@example.com Address: 123 Main St";
  const output = redactPIIText(input);

  assert(output.redacted.includes("[REDACTED_NAME]"));
  assert(output.redacted.includes("[REDACTED_EMAIL]"));
  assert(output.redacted.includes("[REDACTED_ADDRESS]"));
  assertEquals(output.counts.email, 1);
});
