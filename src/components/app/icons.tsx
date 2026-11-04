import type { SVGProps } from "react";

export type IconName =
  | "command"
  | "vault"
  | "graph"
  | "timeline"
  | "projects"
  | "documents"
  | "chat"
  | "bridge"
  | "settings"
  | "plus"
  | "arrow-right"
  | "spark"
  | "search"
  | "logout"
  | "menu"
  | "close"
  | "check"
  | "database"
  | "clock"
  | "users"
  | "shield"
  | "layers"
  | "activity";

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
}

const paths: Record<IconName, React.ReactNode> = {
  command: <path d="M4 4h16v16H4z" />,
  vault: <path d="M5 8l7-4 7 4v8l-7 4-7-4z" />,
  graph: (
    <>
      <circle cx="5" cy="6" r="2" />
      <circle cx="18" cy="5" r="2" />
      <circle cx="12" cy="18" r="2" />
      <path d="M6.8 7.2L16.5 6M6.2 7.7L11 15.9M18 7l-5.2 9" />
    </>
  ),
  timeline: <path d="M3 12h18M3 6h12M3 18h8" />,
  projects: <path d="M4 4h16v16H4zM4 9h16" />,
  documents: <path d="M7 3h7l4 4v14H7zM14 3v4h4" />,
  chat: <path d="M4 5h16v11H9l-5 4z" />,
  bridge: <path d="M4 8h16M4 16h16M8 4v16M16 4v16" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3m0 12v3m9-9h-3M6 12H3m13.2-4.2l2.1-2.1M6.7 17.3l-2.1 2.1m0-14.8l2.1 2.1m10.6 10.6l2.1 2.1" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  "arrow-right": <path d="M5 12h14m-6-6l6 6-6 6" />,
  spark: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />,
  search: <circle cx="11" cy="11" r="6" /><path d="M15.5 15.5L21 21" />,
  logout: <path d="M9 5H5v14h4m0-7h10m-3-3l3 3-3 3" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M5 12l5 5L19 7" />,
  database: <ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />,
  clock: <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />,
  users: <path d="M9 11a4 4 0 100-8 4 4 0 000 8zM3 21v-1a6 6 0 0112 0v1M17 11a3.5 3.5 0 100-7m1 7a5 5 0 013 4.6V21" />,
  shield: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />,
  layers: <path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5" />,
  activity: <path d="M3 12h4l3-8 4 16 3-8h4" />,
};

export function Icon({ name, size = 18, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
