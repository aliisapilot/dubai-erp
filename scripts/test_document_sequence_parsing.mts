import assert from "node:assert/strict";
import { extractHistoricalSequence, nextSequenceFromReferences } from "../lib/documentSequenceParsing";

assert.equal(extractHistoricalSequence("INV-145", ["INV"]), 145);
assert.equal(extractHistoricalSequence("INV145-26", ["INV"]), 145);
assert.equal(extractHistoricalSequence("INV-2026-0145", ["INV"]), 145);
assert.equal(extractHistoricalSequence("INV145/10/26", ["INV"]), 145);
assert.equal(extractHistoricalSequence("QUO-145", ["INV"]), null);
assert.equal(nextSequenceFromReferences(["INV-001", "INV-009", "INV-145"], ["INV"]), 146);
assert.equal(nextSequenceFromReferences(["QTN145-26", "QUO-101"], ["QTN", "QUO"]), 146);
assert.equal(nextSequenceFromReferences(["INV-145", "INV-009"], ["INV"], 200), 200);
console.log("Legacy document sequence parsing tests passed");
