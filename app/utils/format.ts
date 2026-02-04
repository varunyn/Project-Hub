/**
 * Shared client-safe formatting helpers for dates and status display.
 */

export function formatLastActivity(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return "1 week ago";
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return date.toLocaleDateString();
}

export function formatCommitDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  const now = new Date();
  const sameDay = now.toDateString() === date.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = yesterday.toDateString() === date.toDateString();
  const datePart = date.toLocaleDateString(undefined, { dateStyle: "medium" });
  const timePart = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  if (sameDay) return `Today at ${timePart}`;
  if (isYesterday) return `Yesterday at ${timePart}`;
  return `${datePart} at ${timePart}`;
}

export function getStatusColor(status: string): string {
  switch (status) {
    case "in progress":
      return "bg-blue-50 text-blue-700 ring-1 ring-blue-200/60";
    case "completed":
      return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60";
    case "archived":
      return "bg-slate-100 text-slate-600 ring-1 ring-slate-200/60";
    default:
      return "bg-slate-100 text-slate-600 ring-1 ring-slate-200/60";
  }
}

export function getStatusDotColor(status: string): string {
  switch (status) {
    case "in progress":
      return "bg-blue-500";
    case "completed":
      return "bg-emerald-500";
    case "archived":
      return "bg-slate-400";
    default:
      return "bg-slate-400";
  }
}
