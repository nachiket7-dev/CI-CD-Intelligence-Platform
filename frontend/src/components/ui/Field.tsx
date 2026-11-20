import type { SelectHTMLAttributes } from "react";

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: { value: string; label: string }[];
}

export function SelectField({ label, options, id, name, ...rest }: Props) {
  const fieldId = id ?? `field-${name ?? label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <label htmlFor={fieldId} className="flex flex-wrap items-center gap-2 text-sm text-muted">
      <span className="shrink-0">{label}</span>
      <select
        id={fieldId}
        name={name ?? fieldId}
        className="h-9 max-w-[calc(100vw-3rem)] sm:max-w-xs truncate rounded-pill border border-rule-2 bg-paper px-2.5 text-ink pointer-coarse:h-11"
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
