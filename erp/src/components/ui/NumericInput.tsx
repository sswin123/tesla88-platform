'use client';

import { useState, useEffect, useRef } from 'react';

interface NumericInputProps {
  value:          number | string;
  onChange:       (value: number) => void;
  min?:           number;
  max?:           number;
  step?:          number;
  decimals?:      number;   // allowed decimal places; 0 = integers only
  placeholder?:   string;
  className?:     string;
  disabled?:      boolean;
  id?:            string;
  onBlur?:        () => void;
}

/**
 * A numeric input that behaves like a text field.
 * - User can type, Ctrl+A, Backspace, Delete, paste, etc.
 * - No browser spinner buttons.
 * - Validation (min/max/decimals) happens on blur only.
 * - onChange fires with the parsed number on every valid keystroke
 *   AND again on blur after clamping.
 */
export function NumericInput({
  value,
  onChange,
  min,
  max,
  step,
  decimals = 0,
  placeholder,
  className = '',
  disabled,
  id,
  onBlur: externalBlur,
}: NumericInputProps) {
  const [raw, setRaw]     = useState(String(value ?? ''));
  const skipSync          = useRef(false);

  // Keep raw text in sync when value changes externally (e.g. reset)
  useEffect(() => {
    if (!skipSync.current) {
      setRaw(value === '' ? '' : String(value));
    }
    skipSync.current = false;
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const text = e.target.value;

    // Allow: digits, one leading minus, one decimal point (if decimals > 0)
    const allowDecimal = (decimals ?? 0) > 0;
    const pattern      = allowDecimal ? /^-?\d*\.?\d*$/ : /^-?\d*$/;
    if (text !== '' && !pattern.test(text)) return;

    setRaw(text);

    // Fire onChange immediately for valid numbers so the controlled parent
    // value stays close to reality — but don't clamp yet.
    const parsed = allowDecimal ? parseFloat(text) : parseInt(text, 10);
    if (!isNaN(parsed)) {
      skipSync.current = true;
      onChange(parsed);
    }
  }

  function handleBlur() {
    const allowDecimal = (decimals ?? 0) > 0;
    let parsed         = allowDecimal ? parseFloat(raw) : parseInt(raw, 10);

    if (isNaN(parsed)) {
      // Restore to last known good value
      parsed = typeof value === 'number' ? value : (allowDecimal ? parseFloat(String(value)) : parseInt(String(value), 10));
      if (isNaN(parsed)) parsed = min ?? 0;
    }

    // Clamp to min/max
    if (min !== undefined) parsed = Math.max(min, parsed);
    if (max !== undefined) parsed = Math.min(max, parsed);

    // Round to allowed decimals
    if ((decimals ?? 0) >= 0) {
      const factor = Math.pow(10, decimals ?? 0);
      parsed = Math.round(parsed * factor) / factor;
    }

    const display = (decimals ?? 0) > 0 ? String(parsed) : String(parsed);
    setRaw(display);
    skipSync.current = true;
    onChange(parsed);
    externalBlur?.();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') e.currentTarget.blur();
  }

  return (
    <input
      id={id}
      type="text"
      inputMode={(decimals ?? 0) > 0 ? 'decimal' : 'numeric'}
      value={raw}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      placeholder={placeholder ?? (min !== undefined ? String(min) : '0')}
      className={className}
      disabled={disabled}
      autoComplete="off"
    />
  );
}
