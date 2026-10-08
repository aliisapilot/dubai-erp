"use client";

import React, { useState } from "react";

export type NumericPreset = "integer" | "currency" | "percentage" | "measurement" | "custom";

export interface NumericInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange" | "value"> {
  preset?: NumericPreset;
  value: number | string | null | undefined;
  onChange: (value: number, rawString: string) => void;
  allowNegative?: boolean;
  emptyOnZero?: boolean;
  clearOnZeroFocus?: boolean;
  formatOnBlur?: boolean;
  decimalPlaces?: number;
}

/**
 * Standardized NumericInput component for Dubai ERP:
 * - "currency": 2-decimal formatting (0.00 placeholder, empty when 0, auto-clears 0 on focus, uninterrupted typing, formats 58 -> 58.00 on blur)
 * - "percentage": 0-100 decimal input (0.0 placeholder, auto-clears on focus if 0)
 * - "measurement": 3-decimal precision for mm, cm, m (e.g. 12.000m)
 * - "integer": Whole number integer stepping (1, 2, 3...)
 *
 * Guaranteed Behavior:
 * 1. Empty field displays placeholder (e.g. 0.00) rather than an actual 0.
 * 2. Focusing a 0/0.0/0.00 field automatically clears it so user types "58" and gets "58", NOT "058".
 * 3. Never interferes with user while typing decimals (allows "58.", "58.5", "58.50").
 * 4. Leaving an empty field safely defaults to 0 without NaN or calculation breakage.
 * 5. On blur, currency rates display cleanly formatted as "58.00".
 */
export default function NumericInput({
  preset = "custom",
  value,
  onChange,
  allowNegative = false,
  emptyOnZero,
  clearOnZeroFocus,
  formatOnBlur,
  decimalPlaces,
  placeholder,
  min,
  max,
  className = "",
  onFocus,
  onBlur,
  ...rest
}: NumericInputProps) {
  const isCurrency = preset === "currency";
  const isPercentage = preset === "percentage";
  const isInteger = preset === "integer";

  // Configuration defaults
  const shouldEmptyOnZero = emptyOnZero ?? (isCurrency || isPercentage);
  const shouldClearOnZeroFocus = clearOnZeroFocus ?? (isCurrency || isPercentage);
  const shouldFormatOnBlur = formatOnBlur ?? isCurrency;

  const defaultPlaceholder =
    placeholder ??
    (isCurrency ? "0.00" : isPercentage ? "0.0" : preset === "measurement" ? "0" : undefined);

  // Helper: check if a value represents 0
  const isZeroOrEmpty = (val: number | string | null | undefined): boolean => {
    if (val === null || val === undefined || val === "") return true;
    const num = Number(val);
    return !isNaN(num) && num === 0;
  };

  // Helper: format value for idle (non-focused) state
  const formatIdle = (val: number | string | null | undefined): string => {
    if (val === null || val === undefined || val === "") return "";
    const num = Number(val);
    if (isNaN(num)) return "";
    if (shouldEmptyOnZero && num === 0) return "";
    if (shouldFormatOnBlur) {
      return num.toFixed(decimalPlaces ?? (isCurrency ? 2 : 3));
    }
    return String(val);
  };

  const [isFocused, setIsFocused] = useState(false);
  const [internalText, setInternalText] = useState("");

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);

    // Requirement 2: If current value is 0, 0.0, or 0.00, clear it automatically!
    if (shouldClearOnZeroFocus && isZeroOrEmpty(value)) {
      setInternalText("");
    } else if (value !== null && value !== undefined && value !== "") {
      // If non-zero (e.g. 58 or 58.5), show editable string and select all for immediate replacement
      const strVal = String(value);
      setInternalText(strVal);
      setTimeout(() => e.target.select(), 0);
    } else {
      setInternalText("");
    }

    if (onFocus) onFocus(e);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;

    let sanitized = raw;
    if (isInteger) {
      sanitized = raw.replace(/[^\d-]/g, "");
    } else {
      // Decimal: allow digits, optional minus, and at most one decimal point
      sanitized = raw.replace(/[^\d.-]/g, "");
      const parts = sanitized.split(".");
      if (parts.length > 2) {
        sanitized = parts[0] + "." + parts.slice(1).join("");
      }
    }

    if (!allowNegative) {
      sanitized = sanitized.replace(/-/g, "");
    } else {
      // Keep only leading minus
      sanitized = sanitized.replace(/(?!^)-/g, "");
    }

    setInternalText(sanitized);

    // Immediately propagate parsed numeric value to parent for instant calculation update
    if (sanitized === "" || sanitized === "-" || sanitized === ".") {
      // Requirement 3: empty treated internally as 0, no NaN
      onChange(0, sanitized);
    } else {
      const parsed = parseFloat(sanitized);
      const safeNum = isNaN(parsed) ? 0 : parsed;
      onChange(safeNum, sanitized);
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(false);
    const trimmed = internalText.trim();

    if (trimmed === "" || trimmed === "-" || trimmed === ".") {
      // Requirement 3: nothing entered -> treated as 0
      onChange(0, "0");
      setInternalText(shouldEmptyOnZero ? "" : isCurrency ? "0.00" : "0");
    } else {
      let parsed = parseFloat(trimmed);
      if (isNaN(parsed)) parsed = 0;

      // Min/Max clamp if provided
      if (min !== undefined && parsed < Number(min)) parsed = Number(min);
      if (max !== undefined && parsed > Number(max)) parsed = Number(max);

      // Requirement 6: After blur, may display rate cleanly as 58.00
      if (shouldEmptyOnZero && parsed === 0) {
        onChange(0, "0");
        setInternalText("");
      } else if (shouldFormatOnBlur) {
        const formatted = parsed.toFixed(decimalPlaces ?? (isCurrency ? 2 : 3));
        onChange(parsed, formatted);
        setInternalText(formatted);
      } else {
        onChange(parsed, String(parsed));
        setInternalText(String(parsed));
      }
    }

    if (onBlur) onBlur(e);
  };

  return (
    <input
      type="text"
      inputMode={isInteger ? "numeric" : "decimal"}
      value={isFocused ? internalText : formatIdle(value)}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      placeholder={defaultPlaceholder}
      className={className}
      {...rest}
    />
  );
}
