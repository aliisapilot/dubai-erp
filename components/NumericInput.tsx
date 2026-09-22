"use client";

import React from "react";

export type NumericPreset = "integer" | "currency" | "percentage" | "measurement" | "custom";

export interface NumericInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
  preset?: NumericPreset;
  value: number | string;
  onChange: (value: number, rawString: string) => void;
  allowNegative?: boolean;
}

/**
 * Standardized NumericInput component that enforces correct spinner behavior across Dubai ERP:
 * - "integer": step=1, whole-number stepping (1 -> 2 -> 3 -> 4) for quantities, counts, stock.
 * - "currency": step=0.01, standard 2-decimal precision for prices, amounts, balances.
 * - "percentage": step=0.01, min=0, max=100 for VAT and discount rates.
 * - "measurement": step=0.01, preserves fractional lengths/weights (kg, sqm, m).
 */
export default function NumericInput({
  preset = "custom",
  value,
  onChange,
  allowNegative = false,
  min,
  max,
  step,
  className = "",
  ...rest
}: NumericInputProps) {
  let resolvedStep = step;
  let resolvedMin = min;
  let resolvedMax = max;

  switch (preset) {
    case "integer":
      resolvedStep = step ?? "1";
      resolvedMin = min ?? (allowNegative ? undefined : "0");
      break;
    case "currency":
      resolvedStep = step ?? "0.01";
      resolvedMin = min ?? (allowNegative ? undefined : "0");
      break;
    case "percentage":
      resolvedStep = step ?? "0.01";
      resolvedMin = min ?? "0";
      resolvedMax = max ?? "100";
      break;
    case "measurement":
      resolvedStep = step ?? "0.01";
      resolvedMin = min ?? (allowNegative ? undefined : "0");
      break;
    default:
      if (!allowNegative && min === undefined) {
        resolvedMin = "0";
      }
      break;
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const num = Number(raw) || 0;
    onChange(num, raw);
  };

  return (
    <input
      type="number"
      step={resolvedStep}
      min={resolvedMin}
      max={resolvedMax}
      value={value}
      onChange={handleChange}
      className={className}
      {...rest}
    />
  );
}
