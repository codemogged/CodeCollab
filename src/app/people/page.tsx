import { friends } from "@/lib/mock-data";
import { Avatar, StatusDot } from "@/components";

export default function PeoplePage() {
  return (
    <div className="space-y-8 px-6 py-8">
      <h1 className="font-display text-display-sm tracking-tight text-text">Friends</h1>

      {/* Friend list */}
      <div className="space-y-1">
        {friends.map((friend) => (
          <div
            key={friend.name}
            className="flex items-center gap-4 rounded-xl border border-transparent px-4 py-3 transition hover:border-edge hover:bg-stage-up"
          >
            <Avatar initials={friend.initials} size="md" online={friend.online} />
            <div className="flex-1">
              <p className="text-body font-medium text-text">{friend.name}</p>
              <div className="mt-0.5 flex items-center gap-1.5">
                <StatusDot status={friend.online ? "live" : "offline"} />
                <span className="text-label text-text-dim">
                  {friend.online ? "Online" : "Offline"}
                </span>
              </div>
            </div>
            <button className="btn-ghost text-label">Message</button>
          </div>
        ))}
      </div>

      {/* Invite */}
      <div className="surface p-6 text-center">
        <p className="text-3xl">🤝</p>
        <h2 className="font-display mt-3 text-body-lg font-bold text-text">Invite a friend</h2>
        <p className="mt-1 text-body-sm text-text-dim">
          Share this link. That&rsquo;s all they need.
        </p>
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-stage-up p-1.5 pl-5">
          <span className="text-body-sm text-text-dim select-all truncate">
            codebuddy.app/join/cam-x3k9
          </span>
          <button className="btn-primary py-2 px-4 text-label shrink-0">Copy</button>
        </div>
      </div>
    </div>
  );
}
