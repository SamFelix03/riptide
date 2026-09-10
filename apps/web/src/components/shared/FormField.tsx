"use client";

import { useEffect, useState, type ReactNode } from "react";
import { formatFeeField, formatUnitsTrimmed, formatWad, parseFeeField, parseTokenInput, parseUnitInput } from "@/lib/format";

export function FormField({
  label,
  suffix,
  hint,
  children,
}: {
  label: string;
  suffix?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="form-field">
      <span className="form-field-label">{label}</span>
      <div className="form-field-control">
        {children}
        {suffix ? <small className="form-field-suffix">{suffix}</small> : null}
      </div>
      {hint ? <span className="form-field-hint tabular">{hint}</span> : null}
    </label>
  );
}

export function HumanWadField({
  label,
  value,
  onChange,
  suffix,
  decimals = 18,
}: {
  label: string;
  value: bigint;
  onChange: (v: bigint) => void;
  suffix?: string;
  decimals?: number;
}) {
  const canonical = formatUnitsTrimmed(value, decimals);
  const [text, setText] = useState(canonical);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(canonical);
  }, [canonical, focused]);

  return (
    <FormField label={label} suffix={suffix} hint={formatWad(value)}>
      <input
        value={text}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          setText(e.target.value);
          const parsed = parseTokenInput(e.target.value, decimals);
          if (parsed !== null) onChange(parsed);
        }}
      />
    </FormField>
  );
}

export function HumanFeeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: bigint;
  onChange: (v: bigint) => void;
}) {
  const canonical = formatFeeField(value);
  const [text, setText] = useState(canonical);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(canonical);
  }, [canonical, focused]);

  return (
    <FormField label={label} suffix="bps">
      <input
        value={text}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          setText(e.target.value);
          const parsed = parseFeeField(e.target.value);
          if (parsed !== null) onChange(parsed);
        }}
      />
    </FormField>
  );
}

export function HumanUnitField({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);

  return (
    <FormField label={label} suffix={suffix}>
      <input
        value={text}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          setText(e.target.value);
          const parsed = parseUnitInput(e.target.value);
          if (parsed !== null) onChange(parsed);
        }}
      />
    </FormField>
  );
}

export function HumanRatioField({
  label,
  value,
  onChange,
  suffix,
  hint,
}: {
  label: string;
  value: bigint;
  onChange: (v: bigint) => void;
  suffix?: string;
  hint?: string;
}) {
  const canonical = formatWad(value, 4);
  const [text, setText] = useState(canonical);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(canonical);
  }, [canonical, focused]);

  return (
    <FormField label={label} suffix={suffix} hint={hint ?? formatWad(value, 4)}>
      <input
        value={text}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          setText(e.target.value);
          const parsed = parseTokenInput(e.target.value, 18);
          if (parsed !== null) onChange(parsed);
        }}
      />
    </FormField>
  );
}
