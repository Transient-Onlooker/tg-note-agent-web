export type ViewId =
  | "inbox"
  | "todo"
  | "today"
  | "notes"
  | "modeling"
  | "question"
  | "projects"
  | "print-queue"
  | "purchase"
  | "archive"
  | "trash";

export interface NavigationItem {
  id: ViewId;
  label: string;
  description: string;
}

export interface NavigationGroup {
  label: string;
  items: NavigationItem[];
}

export const navigationGroups: NavigationGroup[] = [
  {
    label: "Workspace",
    items: [
      {
        id: "inbox",
        label: "Inbox",
        description: "들어온 메모를 빠르게 확인하고 정리하는 공간입니다.",
      },
      {
        id: "todo",
        label: "Todo",
        description: "아직 처리해야 할 Todo입니다.",
      },
      {
        id: "today",
        label: "Today",
        description: "오늘 확인할 메모와 할 일을 모아보는 화면입니다.",
      },
      {
        id: "notes",
        label: "Notes",
        description: "정리된 모든 노트를 한곳에서 관리하는 화면입니다.",
      },
    ],
  },
  {
    label: "Collections",
    items: [
      {
        id: "projects",
        label: "Projects",
        description: "프로젝트별로 관련 메모를 묶어 관리하는 화면입니다.",
      },
      {
        id: "print-queue",
        label: "Print Queue",
        description: "출력하거나 따로 보관할 자료를 준비하는 화면입니다.",
      },
      {
        id: "purchase",
        label: "Purchase",
        description: "구매 후보와 필요한 물건을 정리하는 화면입니다.",
      },
    ],
  },
  {
    label: "Library",
    items: [
      {
        id: "archive",
        label: "Archive",
        description: "완료되거나 보관된 노트를 찾아보는 화면입니다.",
      },
      {
        id: "trash",
        label: "Trash",
        description: "삭제한 메모를 확인하고 복원하는 공간입니다.",
      },
    ],
  },
];


export const moreNavigationItems: NavigationItem[] = [
  { id: "modeling", label: "3D 모델링", description: "앞으로 모델링할 것과 관련 메모를 모아둡니다." },
  { id: "question", label: "궁금증", description: "나중에 확인하거나 알아볼 궁금증을 모아둡니다." },
];
