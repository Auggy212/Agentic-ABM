export type SequenceChannel = "email" | "linkedin" | "call";
export type SequenceStatus = "active" | "paused" | "draft";

export interface SequenceStep {
  id: string;
  day: number;
  channel: SequenceChannel;
  title: string;
  body: string;
  stats: Record<string, string | number>;
}

export interface SequenceMetrics {
  sent: number;
  opened: number;   // 0–1 rate
  replied: number;  // 0–1 rate
  meetings: number;
}

export interface Sequence {
  id: string;
  name: string;
  description: string;
  status: SequenceStatus;
  accounts: number;
  contacts: number;
  metrics?: SequenceMetrics;
  steps?: SequenceStep[];
}

export interface SequencesKpi {
  label: string;
  num: string;
  delta: string;
}

export interface SequencesResponse {
  sequences: Sequence[];
  kpis: SequencesKpi[];
}
