interface StatusDotProps {
  status: "live" | "busy" | "offline";
  label?: string;
}

export default function StatusDot({ status, label }: StatusDotProps) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`status-dot status-dot-${status}`} />
      {label && <span className="text-body-sm text-ink-muted">{label}</span>}
    </span>
  );
}
