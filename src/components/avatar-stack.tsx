import type { Member } from "@/lib/mock-data";
import Avatar from "./avatar";

interface AvatarStackProps {
  members: Member[];
  max?: number;
}

export default function AvatarStack({ members, max = 4 }: AvatarStackProps) {
  const visible = members.slice(0, max);
  const overflow = members.length - max;

  return (
    <div className="flex -space-x-2">
      {visible.map((m) => (
        <div key={m.name} className="relative ring-2 ring-white rounded-full">
          <Avatar initials={m.initials} size="sm" online={m.online} />
        </div>
      ))}
      {overflow > 0 && (
        <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-cream-deep ring-2 ring-white text-[10px] font-semibold text-ink-muted">
          +{overflow}
        </div>
      )}
    </div>
  );
}
