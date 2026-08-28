export function formatCreatedAt(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getLocalDateKey(value = new Date()) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getMillisecondsUntilNextLocalDay(value = new Date()) {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() + 1);
  return Math.max(1, next.getTime() - value.getTime());
}

export function getTodayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return {
    dueFrom: start.toISOString(),
    dueTo: end.toISOString(),
  };
}
