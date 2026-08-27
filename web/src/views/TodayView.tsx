import type { ComponentProps } from "react";
import { NotesView } from "./NotesView";

type TodayViewProps = Omit<
  ComponentProps<typeof NotesView>,
  "viewTitle" | "viewDescription" | "emptyDescription" | "onPurchase" | "isPurchasing" | "onSendToPrintQueue" | "isSendingToPrintQueue" | "onSetToday" | "isSettingToday"
>;

export function TodayView(props: TodayViewProps) {
  return (
    <NotesView
      {...props}
      viewTitle="Today"
      viewDescription="Items due today, based on your local time."
      emptyDescription="오늘 처리할 메모가 없습니다."
    />
  );
}
