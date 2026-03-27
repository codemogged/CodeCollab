interface AvatarProps {
  initials: string;
  size?: "sm" | "md" | "lg";
  online?: boolean;
  ring?: boolean;
}

const sizes = {
  sm: "h-8 w-8 text-[10px]",
  md: "h-10 w-10 text-xs",
  lg: "h-14 w-14 text-sm",
};

export default function Avatar({ initials, size = "md", online, ring }: AvatarProps) {
  const inner = (
    <div className={`${sizes[size]} relative flex items-center justify-center rounded-full bg-cream-deep font-semibold text-ink select-none`}>
      {initials}
      {online !== undefined && (
        <span className={`absolute -bottom-0.5 -right-0.5 block h-2.5 w-2.5 rounded-full border-2 border-white ${online ? "bg-aqua" : "bg-ink-muted/40"}`} />
      )}
    </div>
  );

  if (ring) return <div className="avatar-ring">{inner}</div>;
  return inner;
}
