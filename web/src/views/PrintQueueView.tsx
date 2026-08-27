import type { ComponentProps } from "react";
import { NotesView } from "./NotesView";

type PrintQueueViewProps = Omit<
  ComponentProps<typeof NotesView>,
  "viewTitle" | "viewDescription" | "emptyDescription" | "onPurchase" | "isPurchasing" | "onSendToPrintQueue" | "isSendingToPrintQueue"
>;

export function PrintQueueView(props: PrintQueueViewProps) {
  return (
    <NotesView
      {...props}
      viewTitle="Print Queue"
      viewDescription="Keep notes that are ready to be printed in one place."
      emptyDescription="Inbox 또는 Notes의 메모를 Print Queue로 분류해 보세요."
    />
  );
}
