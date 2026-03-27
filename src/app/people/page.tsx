import { friends } from "@/lib/mock-data";
import { Avatar, StatusDot } from "@/components";

export default function PeoplePage() {
  return (
    <div className="space-y-8">
      <h1 className="display-font text-display-md text-ink">Your people</h1>

      {/* Friend list */}
      <div className="space-y-3">
        {friends.map((friend) => (
          <div
            key={friend.name}
            className="card flex items-center gap-4 p-4"
          >
            <Avatar initials={friend.initials} size="md" online={friend.online} />
            <div className="flex-1">
              <p className="text-body font-medium text-ink">{friend.name}</p>
              <div className="mt-0.5 flex items-center gap-1.5">
                <StatusDot status={friend.online ? "live" : "offline"} />
                <span className="text-label text-ink-muted">
                  {friend.online ? "Online" : "Offline"}
                </span>
              </div>
            </div>
            <button className="btn-secondary py-2 px-4 text-xs">Message</button>
          </div>
        ))}
      </div>

      {/* Invite */}
      <div className="card p-6 text-center">
        <p className="text-3xl">🤝</p>
        <h2 className="display-font mt-3 text-body-lg font-bold text-ink">Invite a friend</h2>
        <p className="mt-1 text-body-sm text-ink-muted">
          Share this link. That&rsquo;s all they need.
        </p>
        <div className="mt-4 flex items-center gap-2 rounded-full bg-cream-deep p-1.5 pl-5">
          <span className="text-body-sm text-ink-muted select-all truncate">
            codebuddy.app/join/cam-x3k9
          </span>
          <button className="btn-primary py-2 px-4 text-xs shrink-0">Copy</button>
        </div>
      </div>
    </div>
  );
}
