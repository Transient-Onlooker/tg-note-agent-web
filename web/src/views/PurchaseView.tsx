import type { ComponentProps } from "react";
import { NotesView } from "./NotesView";

type PurchaseViewProps = Omit<ComponentProps<typeof NotesView>, "viewTitle" | "viewDescription" | "emptyDescription" | "onPurchase" | "isPurchasing">;

export function PurchaseView(props: PurchaseViewProps) {
  return (
    <NotesView
      {...props}
      viewTitle="Purchase"
      viewDescription="Keep items you plan to purchase in one place."
      emptyDescription="Inbox 또는 Notes의 메모를 Purchase로 분류해 보세요."
    />
  );
}
