interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

const statusColors: Record<string, string> = {
  // Pipeline statuses
  queued: 'badge-info',
  creating_containers: 'badge-info',
  polling: 'badge-info',
  publishing: 'badge-warning',
  published: 'badge-success',
  failed: 'badge-error',
  awaiting_approval: 'badge-warning',
  // Routing
  pending: 'badge-warning',
  approved: 'badge-success',
  rejected: 'badge-error',
  // Translation
  translating: 'badge-info',
  completed: 'badge-success',
  // Slides
  generating: 'badge-info',
  // General
  active: 'badge-success',
  inactive: 'badge-error',
  viral: 'badge-accent',
};

export default function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const colorClass = statusColors[status] || 'badge-default';
  return (
    <span className={`badge ${colorClass} ${size === 'sm' ? 'badge-sm' : ''}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}
