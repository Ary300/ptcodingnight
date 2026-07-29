import type { SeedPastStatus } from "@/lib/schemas/seed";

/**
 * The imported history flag, rendered so an organiser cannot skim past it.
 *
 * PRD §8: the spreadsheet's real value is that it remembers which problems nobody could
 * solve. Nine titles were used in a past contest and **scored zero points from anybody**.
 * Re-picking one of those is the specific mistake this component exists to prevent, so it
 * gets the loudest treatment on the page — an inverted `--ink` plate with `--gold` text
 * (13.44, AAA) rather than another quiet grey pill in a row of quiet grey pills.
 *
 * Gold on `--paper` measures 1.39 and is unusable; inverting the surface is what makes the
 * brand accent legal here at all (DESIGN.md §2).
 */

interface FlagStyle {
  readonly label: string;
  readonly meaning: string;
  readonly severity: "alarm" | "caution" | "good" | "neutral";
}

const FLAGS: Record<SeedPastStatus, FlagStyle> = {
  "used-but-zero-points": {
    label: "! nobody scored",
    meaning: "Used in a past contest and nobody scored a single point on it.",
    severity: "alarm",
  },
  "partially-solved-in-past": {
    label: "partially solved",
    meaning: "Used before; some partial credit, never a full solve.",
    severity: "caution",
  },
  "solved-in-past": {
    label: "solved before",
    meaning: "Solved in a past contest. Reusing it means somebody may already know it.",
    severity: "neutral",
  },
  "used-in-contest": {
    label: "used before",
    meaning: "Appeared in a past contest; outcome not recorded.",
    severity: "neutral",
  },
  "candidate-unused": {
    label: "never used",
    meaning: "On the shortlist but never run. No history either way.",
    severity: "good",
  },
  "hint-currency": {
    label: "warmup",
    meaning: "A CodingBat-style warmup. Two of these earn one hint.",
    severity: "neutral",
  },
  "group-problem": {
    label: "group round",
    meaning: "Ran as a group problem, where hints apply.",
    severity: "neutral",
  },
};

const SEVERITY_CLASS: Record<FlagStyle["severity"], string> = {
  // Inverted plate — the only way gold is legible on this surface.
  alarm: "bg-ink font-bold",
  caution: "border border-panther text-panther font-semibold",
  good: "border border-ink/30",
  neutral: "border border-ink/20 opacity-80",
};

export interface HistoryFlagProps {
  status: SeedPastStatus;
  className?: string;
}

export function HistoryFlag({ status, className }: HistoryFlagProps) {
  const flag = FLAGS[status];

  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 whitespace-nowrap ${SEVERITY_CLASS[flag.severity]} ${className ?? ""}`}
      style={{
        fontSize: "var(--text-xs)",
        color: flag.severity === "alarm" ? "var(--color-gold)" : undefined,
      }}
      title={flag.meaning}
    >
      {flag.label}
      <span className="sr-only">. {flag.meaning}</span>
    </span>
  );
}

export function historyMeaning(status: SeedPastStatus): string {
  return FLAGS[status].meaning;
}

export function isRepeatMistake(status: SeedPastStatus): boolean {
  return status === "used-but-zero-points";
}
