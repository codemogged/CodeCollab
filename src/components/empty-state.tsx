interface EmptyStateProps {
  emoji: string;
  title: string;
  description: string;
  action?: { label: string; href?: string };
}

export default function EmptyState({ emoji, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <span className="text-5xl">{emoji}</span>
      <h3 className="display-font mt-4 text-display-sm text-ink">{title}</h3>
      <p className="mt-2 max-w-sm text-body text-ink-muted">{description}</p>
      {action && (
        <button className="btn-primary mt-6">{action.label}</button>
      )}
    </div>
  );
}
