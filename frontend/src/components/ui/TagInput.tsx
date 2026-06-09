import { useState, useRef, KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  max?: number;
  className?: string;
  id?: string;
  disabled?: boolean;
}

export default function TagInput({
  value,
  onChange,
  placeholder = "Type and press Enter",
  max,
  className,
  id,
  disabled,
}: TagInputProps) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function add(raw: string) {
    const tag = raw.trim();
    if (!tag || value.includes(tag)) return;
    if (max && value.length >= max) return;
    onChange([...value, tag]);
    setInput("");
  }

  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(input);
    } else if (e.key === "Backspace" && !input && value.length > 0) {
      remove(value.length - 1);
    }
  }

  return (
    <div
      className={cn(
        "flex flex-wrap gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 min-h-[42px]",
        "focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20",
        disabled && "bg-gray-50 opacity-60",
        className
      )}
      onClick={() => inputRef.current?.focus()}
    >
      {value.map((tag, i) => (
        <span key={i} className="tag">
          {tag}
          {!disabled && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); remove(i); }}
              className="ml-0.5 rounded-full hover:text-brand-900 transition"
              aria-label={`Remove ${tag}`}
            >
              ×
            </button>
          )}
        </span>
      ))}
      <input
        ref={inputRef}
        id={id}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKey}
        onBlur={() => { if (input.trim()) add(input); }}
        placeholder={value.length === 0 ? placeholder : ""}
        disabled={disabled}
        className="flex-1 min-w-[120px] border-none outline-none bg-transparent text-sm placeholder-gray-400"
      />
    </div>
  );
}
