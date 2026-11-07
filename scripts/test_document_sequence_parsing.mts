import assert from "node:assert/strict";
import { extractHistoricalSequence, nextSequenceFromReferences } from "../lib/documentSequenceParsing";

assert.equal(extractHistoricalSequence("INV-145", ["INV"]), 145);
assert.equal(extractHistoricalSequence("INV-001", ["INV"]), 1);
assert.equal(extractHistoricalSequence("INV-117", ["INV"]), 117);
assert.equal(extractHistoricalSequence("INV145-26", ["INV"]), 145);
assert.equal(extractHistoricalSequence("QTN145-26", ["QTN"]), 145);
assert.equal(extractHistoricalSequence("PO-031", ["PO"]), 31);
assert.equal(extractHistoricalSequence("INV-2026-0145", ["INV"]), 145);
assert.equal(extractHistoricalSequence("INV-145-2026", ["INV"]), 145);
assert.equal(extractHistoricalSequence("QTN-26-0145", ["QTN"]), 145);
assert.equal(extractHistoricalSequence("INV145/10/26", ["INV"]), 145);
assert.equal(extractHistoricalSequence("QUO-145", ["INV"]), 145); // fallback matches raw reference format

// Prompt specification: INV-001, INV-117, INV-145 -> INV-146
assert.equal(nextSequenceFromReferences(["INV-001", "INV-117", "INV-145"], ["INV"]), 146);

// Prompt specification: QTN145-26 -> next valid quotation sequence 146
assert.equal(nextSequenceFromReferences(["QTN145-26"], ["QTN"]), 146);
assert.equal(nextSequenceFromReferences(["QTN145-26", "QUO-101"], ["QTN", "QUO"]), 146);

// Prompt specification: PO-031 -> PO-032
assert.equal(nextSequenceFromReferences(["PO-031"], ["PO"]), 32);

// Minimum sequence preservation
assert.equal(nextSequenceFromReferences(["INV-145", "INV-009"], ["INV"], 200), 200);

console.log("Legacy document sequence parsing tests passed");
