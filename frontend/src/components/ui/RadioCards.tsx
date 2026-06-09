interface Option {
  value: string;
  label: string;
  hint?: string;
}

interface RadioCardsProps {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
}

export default function RadioCards({ value, onChange, options }: RadioCardsProps) {
  return (
    <div className="radio-cards">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="radio-card"
          data-active={String(value === o.value)}
          onClick={() => onChange(o.value)}
        >
          <div className="radio-card-label">{o.label}</div>
          {o.hint && <div className="radio-card-hint">{o.hint}</div>}
        </button>
      ))}
    </div>
  );
}
