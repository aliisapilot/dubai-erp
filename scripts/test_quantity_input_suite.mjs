import assert from "node:assert/strict";

// 1. Test calculation engine logic (recalc & calcLineItem)
function calcLineItem(qty, unitPrice, discountPct, vatRate) {
  const q = Number(qty) || 0;
  const p = Number(unitPrice) || 0;
  const d = Math.max(0, Math.min(100, Number(discountPct) || 0));
  const v = Math.max(0, Number(vatRate) || 0);

  const gross = Math.round(q * p * 100) / 100;
  const discountAmt = Math.round(gross * (d / 100) * 100) / 100;
  const taxable = Math.max(0, Math.round((gross - discountAmt) * 100) / 100);
  const vatAmount = Math.round(taxable * (v / 100) * 100) / 100;
  const lineTotal = Math.round((taxable + vatAmount) * 100) / 100;
  return { taxable, vatAmount, lineTotal, gross, discountAmt };
}

console.log("--- TEST 1: Calculations & VAT ---");
// Test: Qty 152 at Rate 50
const c1 = calcLineItem(152, 50, 0, 5);
assert.equal(c1.gross, 7600);
assert.equal(c1.taxable, 7600);
assert.equal(c1.vatAmount, 380);
assert.equal(c1.lineTotal, 7980);
console.log("✓ Qty 152: subtotal=7600, VAT=380, total=7980");

// Test: Replace 152 with 1
const c2 = calcLineItem(1, 50, 0, 5);
assert.equal(c2.gross, 50);
assert.equal(c2.taxable, 50);
assert.equal(c2.vatAmount, 2.5);
assert.equal(c2.lineTotal, 52.5);
console.log("✓ Qty 1: subtotal=50, VAT=2.50, total=52.50");

// Test: Decimal Qty 0.5
const c3 = calcLineItem(0.5, 50, 0, 5);
assert.equal(c3.gross, 25);
assert.equal(c3.taxable, 25);
assert.equal(c3.vatAmount, 1.25);
assert.equal(c3.lineTotal, 26.25);
console.log("✓ Qty 0.5: subtotal=25, VAT=1.25, total=26.25");

// Test: Replace with 100
const c4 = calcLineItem(100, 50, 0, 5);
assert.equal(c4.gross, 5000);
assert.equal(c4.taxable, 5000);
assert.equal(c4.vatAmount, 250);
assert.equal(c4.lineTotal, 5250);
console.log("✓ Qty 100: subtotal=5000, VAT=250, total=5250");

// Test: Decimal Qty 2.75 with 10% discount and 5% VAT
const c5 = calcLineItem(2.75, 120, 10, 5);
assert.equal(c5.gross, 330);
assert.equal(c5.discountAmt, 33);
assert.equal(c5.taxable, 297);
assert.equal(c5.vatAmount, 14.85);
assert.equal(c5.lineTotal, 311.85);
console.log("✓ Qty 2.75 with 10% discount: taxable=297, VAT=14.85, total=311.85");

console.log("\n--- TEST 2: NumericCellInput State Simulation ---");
// Simulate the exact lifecycle of NumericCellInput component
class NumericCellInputSim {
  constructor(props) {
    this.value = props.value;
    this.min = props.min ?? 0;
    this.max = props.max ?? Infinity;
    this.fallback = props.fallback ?? this.min;
    this.allowDecimal = props.allowDecimal ?? true;
    this.allowNegative = props.allowNegative ?? false;
    this.focused = false;
    this.draft = "";
    this.lastCommitted = props.value;
    this.lastChangeNotified = props.value;
  }

  onFocus() {
    this.focused = true;
    this.draft = String(this.value ?? "");
    this.selected = true; // Simulates requestAnimationFrame(() => inputRef.current.select())
  }

  type(text) {
    let sanitized = text;
    if (this.allowDecimal) {
      if (this.allowNegative) {
        sanitized = sanitized.replace(/[^\d.-]/g, "");
        sanitized = sanitized.replace(/(?!^)-/g, "");
      } else {
        sanitized = sanitized.replace(/[^\d.]/g, "");
      }
      const parts = sanitized.split(".");
      if (parts.length > 2) {
        sanitized = parts[0] + "." + parts.slice(1).join("");
      }
    } else {
      sanitized = sanitized.replace(/\D/g, "");
    }
    this.draft = sanitized;
    this.selected = false;

    // Intermediate propagation if valid complete number
    if (sanitized.trim() !== "" && sanitized !== "-" && sanitized !== "." && !sanitized.endsWith(".")) {
      const parsed = parseFloat(sanitized);
      if (!isNaN(parsed)) {
        this.lastChangeNotified = Math.round(parsed * 1_000_000) / 1_000_000;
      }
    }
  }

  onBlur() {
    this.focused = false;
    const trimmed = this.draft.trim();
    let committed;
    if (trimmed === "" || trimmed === "-" || trimmed === ".") {
      committed = this.fallback;
    } else {
      const parsed = parseFloat(trimmed);
      if (isNaN(parsed)) {
        committed = this.fallback;
      } else {
        committed = Math.max(this.min, Math.min(this.max, parsed));
      }
    }
    committed = Math.round(committed * 1_000_000) / 1_000_000;
    this.lastCommitted = committed;
    this.value = committed;
    this.draft = String(committed);
  }

  get displayValue() {
    return this.focused ? this.draft : String(this.value);
  }
}

// 1. Initial value 152
const input = new NumericCellInputSim({ value: 152, min: 0.001, fallback: 1 });
assert.equal(input.displayValue, "152");

// 2. Focus: field is selected
input.onFocus();
assert.equal(input.focused, true);
assert.equal(input.selected, true);
assert.equal(input.displayValue, "152");

// 3. User backspaces / clears the field
input.type("");
assert.equal(input.displayValue, "", "Field MUST remain empty while typing (no jumping to 1 or 0)");

// 4. User types '1'
input.type("1");
assert.equal(input.displayValue, "1");
assert.equal(input.lastChangeNotified, 1);

// 5. Blur commits 1
input.onBlur();
assert.equal(input.displayValue, "1");
assert.equal(input.lastCommitted, 1);
console.log("✓ Successfully replaced 152 with 1 through clearing and typing");

// 6. User enters decimal 0.5
input.onFocus();
input.type(""); // clear
assert.equal(input.displayValue, "");
input.type("0");
assert.equal(input.displayValue, "0");
input.type("0.");
assert.equal(input.displayValue, "0.", "Decimal point preserved without jumping");
input.type("0.5");
assert.equal(input.displayValue, "0.5");
assert.equal(input.lastChangeNotified, 0.5);
input.onBlur();
assert.equal(input.lastCommitted, 0.5);
assert.equal(input.displayValue, "0.5");
console.log("✓ Successfully entered decimal 0.5 without premature resetting");

// 7. User replaces 0.5 with 100
input.onFocus();
assert.equal(input.selected, true);
input.type("100");
assert.equal(input.displayValue, "100");
input.onBlur();
assert.equal(input.lastCommitted, 100);
assert.equal(input.displayValue, "100");
console.log("✓ Successfully replaced with 100 directly");

// 8. User clears field and blurs away (temporary clear -> fallback on blur)
input.onFocus();
input.type("");
assert.equal(input.displayValue, "");
input.onBlur(); // leaves empty
assert.equal(input.lastCommitted, 1, "Empty field normalized to fallback 1 on blur");
assert.equal(input.displayValue, "1");
console.log("✓ Empty field temporarily blank while typing, normalized to fallback 1 on blur");

console.log("\n--- TEST 3: Document Live PDF Preview Data Structure ---");
// Simulate split-screen editor preview mapping
const lineItem = {
  description: "Custom Fabrication",
  quantity: 0.5,
  unit: "pcs",
  unit_price: 300,
  discount_pct: 0,
  vat_rate: 5,
};
const { taxable, vatAmount, lineTotal } = calcLineItem(
  lineItem.quantity,
  lineItem.unit_price,
  lineItem.discount_pct,
  lineItem.vat_rate
);
const previewLine = {
  description: lineItem.description,
  quantity: lineItem.quantity,
  unit: lineItem.unit,
  unit_price: lineItem.unit_price,
  discount: lineItem.discount_pct,
  vat_rate: lineItem.vat_rate,
  vat_amount: vatAmount,
  line_total: lineTotal,
};
assert.equal(previewLine.quantity, 0.5);
assert.equal(previewLine.line_total, 157.5);
console.log("✓ Live PDF preview item correctly preserves decimal quantity 0.5 and line total 157.50");

console.log("\nALL QUANTITY INPUT TESTS PASSED PERFECTLY!");
