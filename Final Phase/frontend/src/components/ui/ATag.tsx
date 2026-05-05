import { useState, useRef } from "react";
import Icon from "./Icon";

interface ATagInputProps {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  max?: number;
  id?: string;
}

export default function ATagInput({ value, onChange, placeholder, disabled, max, id }: ATagInputProps) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function commit(raw: string) {
    const trimmed = raw.trim().replace(/,$/, "").trim();
    if (!trimmed) return;
    if (max && value.length >= max) return;
    if (!value.includes(trimmed)) onChange([...value, trimmed]);
    setDraft("");
  }

  return (
    <div
      className="tag-input"
      onClick={() => inputRef.current?.focus()}
      style={disabled ? { opacity: 0.5, pointerEvents: "none" } : undefined}
    >
      {value.map((t, i) => (
        <span className="abm-tag" key={i}>
          {t}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange(value.filter((_, j) => j !== i)); }}
          >
            <Icon name="x" size={10} />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        id={id}
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === ",") && draft.trim()) {
            e.preventDefault();
            commit(draft);
          } else if (e.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => commit(draft)}
        placeholder={value.length === 0 ? (placeholder ?? "Type and press Enter") : ""}
      />
    </div>
  );
}
