import type { ReactNode } from "react";
import type { ViewId } from "../config/navigation";
type IconName =
  | ViewId
  | "menu"
  | "close"
  | "send"
  | "refresh"
  | "relay"
  | "delete"
  | "edit"
  | "lock"
  | "more";
const iconPaths: Record<IconName, ReactNode> = {
  inbox: (
    <>
      <path d="M4 5.75h16v12.5H4z" />
      <path d="M4 14h4l1.5 2h5L16 14h4" />
    </>
  ),
  today: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
      <path d="M8 14h3M8 17h6" />
    </>
  ),
  notes: (
    <>
      <path d="M6 3.75h9l3 3v13.5H6z" />
      <path d="M14.5 3.75V7h3.25M9 11h6M9 14h6M9 17h4" />
    </>
  ),
  modeling: (
    <>
      <path d="M4 17 12 4l8 13H4Z" />
      <path d="M8 17v3h8v-3" />
    </>
  ),
  question: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M9.75 9.5a2.3 2.3 0 1 1 3.65 1.85c-.9.65-1.4 1.1-1.4 2.15M12 16.75h.01" />
    </>
  ),
  projects: (
    <>
      <path d="M3.75 7.25h6l1.75 2h8.75v10.5H3.75z" />
      <path d="M3.75 7.25V4.5h6l1.5 1.75h7v3" />
    </>
  ),
  "print-queue": (
    <>
      <path d="M7 8V3.75h10V8M7 17H4.5V9.5h15V17H17" />
      <path d="M7 14h10v6.25H7zM16.5 11.25h.01" />
    </>
  ),
  purchase: (
    <>
      <path d="M3.5 5h2l2 9.25h9.25l2-6.5H6.2" />
      <circle cx="9" cy="18.5" r="1.25" />
      <circle cx="16" cy="18.5" r="1.25" />
    </>
  ),
  archive: (
    <>
      <path d="M4 7.5h16v12H4zM3 4h18v3.5H3z" />
      <path d="M9 11h6" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  send: (
    <>
      <path d="m4 4 17 8-17 8 3-8z" />
      <path d="M7 12h14" />
    </>
  ),
  refresh: (
    <>
      <path d="M19 7v5h-5" />
      <path d="M18.25 16a7.5 7.5 0 1 1 .5-7.25L19 12" />
    </>
  ),
  delete: (
    <>
      <path d="M5 7h14M10 11v5M14 11v5" />
      <path d="m9 7 .75-2.25h4.5L15 7M7 7l.75 13h8.5L17 7" />
    </>
  ),
  todo: (
    <>
      <path d="M5 12.5 9 16l10-10" />
      <path d="M4 4h16v16H4z" />
    </>
  ),
  trash: (
    <>
      <path d="M5 7h14M9 7V5h6v2M7 7l.75 13h8.5L17 7" />
      <path d="M10 11v5M14 11v5" />
    </>
  ),
  edit: (
    <>
      <path d="m5 16-.75 3.75L8 19l10.75-10.75a2.12 2.12 0 0 0-3-3L5 16Z" />
      <path d="m14.5 6.5 3 3" />
    </>
  ),
  more: (
    <path d="M5 12h.01M12 12h.01M19 12h.01" />
  ),
  lock: (
    <>
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  relay: (
    <>
      <path d="M5 7.5h10.5a3.5 3.5 0 0 1 0 7H9" />
      <path d="m11.5 11.5-4 3 4 3" />
    </>
  ),
};

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {iconPaths[name]}
    </svg>
  );
}
