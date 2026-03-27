import type { Expert } from "@/lib/mock-data";
import Avatar from "./avatar";

export default function ExpertCard({ expert }: { expert: Expert }) {
  return (
    <div className="card group p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar initials={expert.initials} size="lg" online={expert.available} ring={expert.available} />
          <div>
            <h3 className="text-body font-semibold text-ink">{expert.name}</h3>
            <p className="text-body-sm text-ink-muted">{expert.specialty}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="display-font text-lg font-bold text-ink">{expert.rate}</p>
          <p className="text-label uppercase text-ink-muted">
            {"★".repeat(Math.floor(expert.rating))} {expert.rating}
          </p>
        </div>
      </div>

      <p className="mt-4 text-body-sm leading-relaxed text-ink-muted">{expert.bio}</p>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {expert.skills.map((skill) => (
          <span key={skill} className="pill bg-cream-deep text-[10px] text-ink-muted">
            {skill}
          </span>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between">
        <span className="text-label uppercase text-ink-muted">{expert.jobs} jobs completed</span>
        {expert.available ? (
          <button className="btn-primary py-2 px-5 text-xs">Invite to project</button>
        ) : (
          <span className="pill bg-cream-deep text-[10px] text-ink-muted">Unavailable</span>
        )}
      </div>
    </div>
  );
}
