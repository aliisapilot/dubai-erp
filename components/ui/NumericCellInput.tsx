"use client";

import React, { useRef, useState, useCallback } from "react";

export interface NumericCellInputProps {
  /** Current numeric value (from parent state) */
  value: number;
  /** Called whenever a valid number is entered (for live calculation/preview) */
  onChange?: (value: number) => void;
  /** Called with the final validated number when editing finishes (blur/enter) */
  onCommit?: (value: number) => void;
  /** Minimum allowed value (default: 0) */
  min?: number;
  /** Maximum allowed value (default: Infinity) */
  max?: number;
  /** Decimal step shown/used (default: "any") */
  step?: string | number;
  /** Fallback value if field is left empty on blur (default: same as min) */
  fallback?: number;
  /** If true, show empty string instead of 0 when value is 0 */
  emptyOnZero?: boolean;
  /** Allow negative numbers (default: false) */
  allowNegative?: boolean;
  /** Allow decimal numbers (default: true) */
  allowDecimal?: boolean;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  required?: boolean;
  id?: string;
  name?: string;
  autoFocus?: boolean;
  title?: string;
}

export const NumericCellInput: React.FC<NumericCellInputProps> = ({
  value,
  onChange,
  onCommit,
  min = 0,
  max = Infinity,
  step = "any",
  fallback,
  emptyOnZero = false,
  allowNegative = false,
  allowDecimal = true,
  disabled = false,
  className = "",
  placeholder,
  required,
  id,
  name,
  autoFocus,
  title,
}) => {
  const commitHandler = onCommit || onChange;
  const changeHandler = onChange || onCommit;
  const fb = fallback !== undefined ? fallback : min;

  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFocus = useCallback(() => {
    setFocused(true);
    const initial = value === 0 && emptyOnZero ? "" : String(value ?? "");
    setDraft(initial);

    // Select entire existing text so the user can replace directly with first keystroke
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.select();
      }
    }, 10);
  }, [value, emptyOnZero]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      let text = e.target.value;

      // Filter characters based on allowed rules
      if (allowDecimal) {
        if (allowNegative) {
          text = text.replace(/[^\d.-]/g, "");
          // Keep only leading minus
          text = text.replace(/(?!^)-/g, "");
        } else {
          text = text.replace(/[^\d.]/g, "");
        }
        // At most one decimal point
        const parts = text.split(".");
        if (parts.length > 2) {
          text = parts[0] + "." + parts.slice(1).join("");
        }
      } else {
        if (allowNegative) {
          text = text.replace(/[^\d-]/g, "");
          text = text.replace(/(?!^)-/g, "");
        } else {
          text = text.replace(/\D/g, "");
        }
      }

      setDraft(text);

      // If draft represents a valid complete number, propagate immediately so calculations & live preview update
      if (text.trim() !== "" && text !== "-" && text !== "." && !text.endsWith(".")) {
        const parsed = parseFloat(text);
        if (!isNaN(parsed)) {
          // Normalise to at most 6 decimal places to prevent float artifacts
          const clean = Math.round(parsed * 1_000_000) / 1_000_000;
          if (changeHandler) {
            changeHandler(clean);
          }
        }
      }
    },
    [allowDecimal, allowNegative, changeHandler]
  );

  const handleBlur = useCallback(() => {
    setFocused(false);
    const trimmed = draft.trim();
    let committed: number;

    if (trimmed === "" || trimmed === "-" || trimmed === ".") {
      committed = fb;
    } else {
      const parsed = parseFloat(trimmed);
      if (isNaN(parsed)) {
        committed = fb;
      } else {
        committed = Math.max(min, Math.min(max, parsed));
      }
    }

    // Normalise to at most 6 decimal places
    committed = Math.round(committed * 1_000_000) / 1_000_000;

    if (commitHandler) {
      commitHandler(committed);
    }
    setDraft(committed === 0 && emptyOnZero ? "" : String(committed));
  }, [draft, fb, min, max, commitHandler, emptyOnZero]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      if (inputRef.current) {
        inputRef.current.blur();
      }
    }
  }, []);

  // Prevent mouse-wheel scrolling from changing numbers accidentally
  const handleWheel = useCallback((e: React.WheelEvent<HTMLInputElement>) => {
    if (document.activeElement === inputRef.current) {
      e.currentTarget.blur();
    }
  }, []);

  const displayValue = focused
    ? draft
    : value === 0 && emptyOnZero
    ? ""
    : value !== undefined && value !== null && !isNaN(value)
    ? String(value)
    : "";

  return (
    <input
      ref={inputRef}
      type="text"
      step={step}
      inputMode={allowDecimal ? "decimal" : "numeric"}
      value={displayValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      onWheel={handleWheel}
      disabled={disabled}
      className={className}
      placeholder={placeholder}
      required={required}
      id={id}
      name={name}
      autoFocus={autoFocus}
      title={title}
      autoComplete="off"
      spellCheck={false}
    />
  );
};

export default NumericCellInput;
