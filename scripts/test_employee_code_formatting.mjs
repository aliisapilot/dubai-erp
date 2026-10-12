import assert from "node:assert/strict";

function formatEmployeeCode(rawCode, index) {
  if (typeof index === "number" && !isNaN(index) && index >= 0) {
    return `EMP-${String(index + 1).padStart(2, "0")}`;
  }

  if (rawCode) {
    const trimmed = String(rawCode).trim();
    const yearMatch = trimmed.match(/(?:20\d\d[-_]?)0*(\d+)$/);
    if (yearMatch) {
      const n = parseInt(yearMatch[1], 10);
      if (!isNaN(n) && n > 0) {
        return `EMP-${String(n).padStart(2, "0")}`;
      }
    }

    const match = trimmed.match(/^EMP-(\d+)$/i);
    if (match) {
      const n = parseInt(match[1], 10);
      if (!isNaN(n) && n > 0) {
        const finalNum = n > 200000 ? (n % 1000) : n;
        return `EMP-${String(finalNum).padStart(2, "0")}`;
      }
    }

    const digits = trimmed.replace(/\D/g, "");
    if (digits) {
      const n = parseInt(digits, 10);
      if (!isNaN(n) && n > 0) {
        const finalNum = n > 200000 ? (n % 1000) : n;
        return `EMP-${String(finalNum).padStart(2, "0")}`;
      }
    }
  }

  return "EMP-01";
}

console.log("Testing formatEmployeeCode with historical codes from user screenshot:");

// 1. When index is provided (e.g. table rows):
assert.equal(formatEmployeeCode("EMP-202601", 0), "EMP-01");
assert.equal(formatEmployeeCode("EMP-202602", 1), "EMP-02");
assert.equal(formatEmployeeCode("EMP-202603", 2), "EMP-03");
assert.equal(formatEmployeeCode("EMP-202604", 3), "EMP-04");
assert.equal(formatEmployeeCode("EMP-202605", 4), "EMP-05");
assert.equal(formatEmployeeCode("EMP-202606", 5), "EMP-06");
assert.equal(formatEmployeeCode("EMP-202607", 6), "EMP-07");
assert.equal(formatEmployeeCode("EMP-202608", 7), "EMP-08");
assert.equal(formatEmployeeCode("EMP-202609", 8), "EMP-09");
assert.equal(formatEmployeeCode("EMP-20260027", 9), "EMP-10");

// 2. When rawCode without index is provided:
assert.equal(formatEmployeeCode("EMP-202601"), "EMP-01");
assert.equal(formatEmployeeCode("EMP-202602"), "EMP-02");
assert.equal(formatEmployeeCode("EMP-202609"), "EMP-09");
assert.equal(formatEmployeeCode("EMP-20260027"), "EMP-27");
assert.equal(formatEmployeeCode("EMP-01"), "EMP-01");
assert.equal(formatEmployeeCode("EMP-02"), "EMP-02");
assert.equal(formatEmployeeCode("EMP-1"), "EMP-01");
assert.equal(formatEmployeeCode("1"), "EMP-01");
assert.equal(formatEmployeeCode("10"), "EMP-10");

console.log("All test cases passed! EMP-01, EMP-02, EMP-03... verified!");
