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

  function addTags(raw: string) {
    const parts = raw.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    const next = [...value];
    for (const part of parts) {
      if (max && next.length >= max) break;
      if (!next.includes(part)) next.push(part);
    }
    onChange(next);
    setDraft("");
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    // Auto-split if user typed or auto-completed a comma/semicolon
    if (v.includes(",") || v.includes(";")) {
      addTags(v);
    } else {
      setDraft(v);
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text");
    if (text.includes(",") || text.includes(";") || text.includes("\n")) {
      e.preventDefault();
      addTags(draft + text);
    }
    // single-word paste: let it fall through to handleChange naturally
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
        onChange={handleChange}
        onPaste={handlePaste}
        onKeyDown={(e) => {
          if (e.key === "Enter" && draft.trim()) {
            e.preventDefault();
            addTags(draft);
          } else if (e.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => { if (draft.trim()) addTags(draft); }}
        placeholder={value.length === 0 ? (placeholder ?? "Type and press Enter") : ""}
      />
    </div>
  );
}
