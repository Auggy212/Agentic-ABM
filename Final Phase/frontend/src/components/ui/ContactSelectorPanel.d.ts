import type { MessageContactSummary } from "../types/api.types";

declare interface ContactSelectorPanelProps {
  selectedContactId: string;
  onSelect: (contact: MessageContactSummary) => void;
}

export default function ContactSelectorPanel(props: ContactSelectorPanelProps): JSX.Element;
