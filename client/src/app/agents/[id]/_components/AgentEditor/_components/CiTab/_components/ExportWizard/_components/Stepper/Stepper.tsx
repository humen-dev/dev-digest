import { Icon } from "@devdigest/ui";
import { s } from "./styles";

/** Numbered step indicator; the active step carries `aria-current="step"` (NFR-13). */
export function Stepper({ step, labels }: { step: number; labels: string[] }) {
  return (
    <ol style={s.list}>
      {labels.map((label, i) => (
        <li key={label} style={s.item} aria-current={i === step ? "step" : undefined}>
          <span style={s.dot(i < step, i === step)}>{i < step ? <Icon.Check size={13} /> : i + 1}</span>
          <span style={s.label(i === step, i <= step)}>{label}</span>
          {i < labels.length - 1 && <span aria-hidden style={s.line(i < step)} />}
        </li>
      ))}
    </ol>
  );
}
