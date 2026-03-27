interface StatBlockProps {
  value: string | number;
  label: string;
  accent?: "sun" | "coral" | "aqua" | "violet";
}

const accentMap = {
  sun: "text-sun",
  coral: "text-coral",
  aqua: "text-aqua",
  violet: "text-violet",
};

export default function StatBlock({ value, label, accent = "sun" }: StatBlockProps) {
  return (
    <div className="text-center">
      <p className={`display-font text-4xl font-bold ${accentMap[accent]}`}>{value}</p>
      <p className="mt-1 text-label uppercase text-ink-muted">{label}</p>
    </div>
  );
}
