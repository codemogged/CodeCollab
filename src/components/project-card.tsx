import Link from "next/link";
import type { Project } from "@/lib/mock-data";
import AvatarStack from "./avatar-stack";
import ProgressRing from "./progress-ring";

const colorMap = {
  sun: { bg: "bg-sun-light", ring: "#ff9f1c" },
  coral: { bg: "bg-coral-light", ring: "#ff6b6b" },
  aqua: { bg: "bg-aqua-light", ring: "#4ecdc4" },
  violet: { bg: "bg-violet-light", ring: "#7c5cfc" },
};

export default function ProjectCard({ project }: { project: Project }) {
  const c = colorMap[project.color];

  return (
    <Link href="/dashboard/room" className="group block">
      <div className="card p-5 transition-all group-hover:shadow-card-hover">
        <div className="flex items-start justify-between gap-4">
          <div className={`flex h-12 w-12 items-center justify-center rounded-2xl text-xl ${c.bg}`}>
            {project.emoji}
          </div>
          <ProgressRing percent={project.progress} color={c.ring} />
        </div>

        <h3 className="display-font mt-4 text-lg font-bold text-ink">{project.name}</h3>
        <p className="mt-1 text-body-sm text-ink-muted">{project.status}</p>

        <div className="mt-4 flex items-center justify-between">
          <AvatarStack members={project.members} />
          <span className="text-label uppercase text-ink-muted">{project.updatedAgo}</span>
        </div>
      </div>
    </Link>
  );
}
