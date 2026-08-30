import type { ComponentProps } from "react";
import { NotesView } from "./NotesView";
import type { ReferenceType } from "../api/items";

type ReferenceViewProps = ComponentProps<typeof NotesView> & { referenceType: ReferenceType };
const labels: Record<ReferenceType,string> = { modeling:"3D 모델링", question:"궁금증" };
const descriptions: Record<ReferenceType,string> = { modeling:"앞으로 모델링할 것과 모델링 관련 메모를 모아둡니다.", question:"나중에 확인하거나 알아볼 궁금증을 모아둡니다." };
export function ReferenceView({ referenceType, ...notesProps }: ReferenceViewProps) {
  const label=labels[referenceType];
  return <NotesView {...notesProps} viewTitle={label} viewDescription={descriptions[referenceType]} emptyTitle={`${label}이 비어 있습니다.`} emptyDescription={`Inbox에서 ${label}으로 분류한 메모가 여기에 표시됩니다.`} errorTitle={`${label}을 불러오지 못했습니다.`} showDueControls={false} showCreatedAt={false}/>;
}
