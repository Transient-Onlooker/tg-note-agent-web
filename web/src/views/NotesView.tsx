import { Fragment, useEffect, useState, type ReactNode } from "react";
import type { Item } from "../api/items";
import { CardActions, type CardAction, type ProjectOption } from "../components/CardActions";
import { Icon } from "../components/Icon";
import { formatCreatedAt, getDateTimeInputValue } from "../utils/date";
import { getItemKindLabel, getReferenceType } from "../utils/item";

type NotesViewProps = {
  viewTitle?: string; viewDescription?: string; emptyTitle?: string; errorTitle?: string; emptyDescription?: string;
  showDueControls?: boolean; showTodayAction?: boolean; showCreatedAt?: boolean; items: Item[]; overdueItems?: Item[]; notesCount: number | null;
  isPending: boolean; isError: boolean; isSuccess: boolean; isFetching: boolean; editingItemId: string | null;
  editDraft: string; editDueAt: string; editError: string | null; isUpdating: boolean; deleteError: boolean;
  onRetry: () => void; onStartEditing: (item: Item) => void; onEditDraftChange: (value: string) => void;
  onEditDueChange: (value: string) => void; onCancelEditing: () => void; onSaveEditing: () => void;
  onMoveToNotes?: (item: Item) => Promise<unknown>; onMoveToTodo?: (item: Item) => Promise<unknown>;
  onMoveToInbox?: (item: Item) => Promise<unknown>; onArchive: (item: Item) => Promise<unknown>;
  onPurchase?: (item: Item) => Promise<unknown>; onDeleteRequest: (item: Item) => void;
  onSendToPrintQueue?: (item: Item) => Promise<unknown>; onMoveToModeling?: (item: Item) => Promise<unknown>;
  onMoveToQuestion?: (item: Item) => Promise<unknown>; onSetToday?: (item: Item) => Promise<unknown>;
  onClearDue?: (item: Item) => Promise<unknown>; projects?: ProjectOption[];
  onProjectChange?: (item: Item, projectId: string | null) => Promise<unknown>;
  onProjectCreate?: (name: string) => Promise<ProjectOption>;
  renderItemDetails?: (item: Item) => ReactNode; renderEditorDetails?: (item: Item) => ReactNode; renderBeforeList?: ReactNode;
  sectionTitles?: { featured: string; remaining: string };
  sectionedItems?: Array<{ title: string; items: Item[] }> ;
};

export function NotesView({
  viewTitle = "Notes", viewDescription = "정리된 메모를 한곳에서 관리합니다.", emptyTitle, errorTitle,
  emptyDescription = "Inbox의 메모를 Notes로 분류해 보세요.", items, overdueItems, notesCount, isPending,
  isError, isSuccess, isFetching, editingItemId, editDraft, editDueAt, editError, isUpdating, deleteError,
  onRetry, onStartEditing, onEditDraftChange, onEditDueChange, onCancelEditing, onSaveEditing, onMoveToNotes,
  onMoveToTodo, onMoveToInbox, onArchive, onPurchase, onDeleteRequest, onSendToPrintQueue, onMoveToModeling,
  onMoveToQuestion, onSetToday, onClearDue, projects = [], onProjectChange, onProjectCreate, renderItemDetails, renderEditorDetails,
  renderBeforeList, sectionTitles, sectionedItems, showDueControls = true, showTodayAction = true, showCreatedAt = false,
}: NotesViewProps) {
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);
  useEffect(() => setOpenActionMenuId(null), [editingItemId]);
  const displayItems = sectionedItems
    ? sectionedItems.flatMap((section) => section.items)
    : overdueItems ? [...overdueItems, ...items] : items;
  const overdueCount = overdueItems?.length ?? 0;
  const sectionStarts = new Map<number, { title: string; count: number }>();
  let sectionOffset = 0;
  sectionedItems?.forEach((section) => {
    if (section.items.length > 0) {
      sectionStarts.set(sectionOffset, { title: section.title, count: section.items.length });
    }
    sectionOffset += section.items.length;
  });

  const getActions = (item: Item): CardAction[] => {
    const actions: CardAction[] = [];
    const referenceType = getReferenceType(item);
    const canSetToday = Boolean(showTodayAction && onSetToday);
    if (onMoveToInbox && item.kind !== "inbox") actions.push({ key:"inbox", className:"note-card__inbox", label:"Inbox로 이동", icon:<Icon name="inbox" size={17}/>, onClick:()=>onMoveToInbox(item), inline:true, menuCore:true });
    if (onMoveToTodo && item.kind !== "task") actions.push({ key:"todo", className:"note-card__todo", label:"Todo로 이동", icon:<Icon name="todo" size={17}/>, onClick:()=>onMoveToTodo(item), inline:true, menuCore:true });
    if (canSetToday && onSetToday) actions.push({ key:"today", className:"note-card__today", label:"오늘로 지정", icon:<Icon name="today" size={17}/>, onClick:()=>onSetToday(item), inline:true, menuCore:true });
    actions.push({ key:"edit", className:"note-card__edit", label:"수정", icon:<Icon name="edit" size={17}/>, onClick:()=>onStartEditing(item), inline:true, menuCore:true });
    if (onMoveToNotes && item.kind !== "note") actions.push({ key:"notes", className:"note-card__notes", label:"Notes로 이동", icon:<Icon name="notes" size={17}/>, onClick:()=>onMoveToNotes(item) });
    if (onMoveToModeling && referenceType !== "modeling") actions.push({ key:"modeling", className:"note-card__modeling", label:"3D 모델링으로 이동", icon:<Icon name="modeling" size={17}/>, onClick:()=>onMoveToModeling(item) });
    if (onMoveToQuestion && referenceType !== "question") actions.push({ key:"question", className:"note-card__question", label:"궁금증으로 이동", icon:<Icon name="question" size={17}/>, onClick:()=>onMoveToQuestion(item) });
    if (onSendToPrintQueue && item.kind !== "print_job") actions.push({ key:"print", className:"note-card__print-queue", label:"Print Queue로 이동", icon:<Icon name="print-queue" size={17}/>, onClick:()=>onSendToPrintQueue(item) });
    if (onPurchase && item.kind !== "purchase") actions.push({ key:"purchase", className:"note-card__purchase", label:"Purchase로 이동", icon:<Icon name="purchase" size={17}/>, onClick:()=>onPurchase(item) });
    if (showDueControls && onClearDue && item.due_at !== null) actions.push({ key:"clear-due", className:"note-card__today note-card__today-clear", label:"기한 제거", icon:<Icon name="close" size={17}/>, onClick:()=>onClearDue(item) });
    actions.push({ key:"archive", className:"note-card__archive", label:"Archive로 이동", icon:<Icon name="archive" size={17}/>, onClick:()=>onArchive(item) });
    actions.push({ key:"delete", className:"note-card__delete", label:"삭제", icon:<Icon name="delete" size={17}/>, onClick:()=>onDeleteRequest(item) });
    return actions;
  };

  return <section className="notes-view" aria-labelledby="notes-title">
    <header className="view-header"><div><p className="eyebrow">Workspace</p><div className="view-title-row"><h1 id="notes-title">{viewTitle}</h1>{notesCount !== null && <span className="count-pill">{notesCount}</span>}</div><p className="view-description">{viewDescription}</p></div></header>
    {renderBeforeList}
    {deleteError && <p className="inline-error delete-error" role="alert">메모를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.</p>}
    <div className="list-heading"><div><h2>{viewTitle}</h2><span>{notesCount === null ? viewTitle : `${notesCount}개의 메모`}</span></div><span className={`sync-status${isFetching && !isPending ? "" : " is-idle"}`} role={isFetching && !isPending ? "status" : undefined} aria-hidden={!(isFetching && !isPending)}><span className="sync-dot" aria-hidden="true"/><span className="sync-label">동기화 중</span></span></div>
    <div className="note-list" aria-live="polite">
      {isPending && <div className="loading-list" aria-label={`${viewTitle} 불러오는 중`}>{[0,1,2].map((x)=><div className="note-skeleton" key={x}><span className="skeleton-icon"/><div><span className="skeleton-line skeleton-line--wide"/><span className="skeleton-line skeleton-line--short"/></div></div>)}</div>}
      {isError && <div className="state-panel state-panel--error" role="alert"><span className="state-panel__icon"><Icon name="refresh" size={22}/></span><div><h3>{errorTitle ?? `${viewTitle}를 불러오지 못했습니다.`}</h3><p>Worker 연결 상태를 확인한 뒤 다시 시도해 주세요.</p></div><button type="button" onClick={onRetry}>다시 시도</button></div>}
      {isSuccess && displayItems.length===0 && <div className="state-panel state-panel--empty"><span className="state-panel__icon"><Icon name="notes" size={24}/></span><div><h3>{emptyTitle ?? `${viewTitle}가 비어 있습니다.`}</h3><p>{emptyDescription}</p></div></div>}
      {isSuccess && displayItems.map((item,index)=><Fragment key={item.id}>
        {sectionStarts.get(index) && <div className="today-section-heading"><h3>{sectionStarts.get(index)?.title}</h3><span>{sectionStarts.get(index)?.count}개</span></div>}
        {!sectionedItems && overdueCount>0 && index===0 && <div className="today-section-heading"><h3>{sectionTitles?.featured ?? "기한 지남"}</h3><span>{overdueCount}개</span></div>}
        {!sectionedItems && overdueCount>0 && index===overdueCount && <div className="today-section-heading"><h3>{sectionTitles?.remaining ?? "오늘"}</h3><span>{items.length}개</span></div>}
        <article className={`note-card${editingItemId===item.id?" note-card--editing":""}`}>
          <span className="note-card__marker" aria-hidden="true"><Icon name="notes" size={18}/></span>
          <div className="note-card__content">
            {editingItemId===item.id ? <div className="note-card__editor">
              <textarea className="note-card__textarea" value={editDraft} onChange={(e)=>onEditDraftChange(e.target.value)} aria-label="메모 수정" rows={4} autoFocus/>
              {renderEditorDetails?.(item)}
              {showDueControls && <div className="note-card__due-editor"><label htmlFor={`notes-due-${item.id}`}>기한</label><input id={`notes-due-${item.id}`} className="note-card__due-input" type="datetime-local" value={editDueAt} onChange={(e)=>onEditDueChange(e.target.value)}/><div className="note-card__due-quick-actions"><button type="button" onClick={()=>onEditDueChange(getDateTimeInputValue(0))}>오늘</button><button type="button" onClick={()=>onEditDueChange(getDateTimeInputValue(1))}>내일</button><button type="button" onClick={()=>onEditDueChange("")}>기한 없음</button></div></div>}
              <p className="note-card__created-info">작성 {formatCreatedAt(item.created_at)}</p>
              {editError && <p className="note-card__edit-error" role="alert">{editError}</p>}
              <div className="note-card__editor-actions"><button className="note-card__cancel" type="button" onClick={onCancelEditing} disabled={isUpdating}>취소</button><button className="note-card__save" type="button" onClick={onSaveEditing} disabled={!editDraft.trim()||isUpdating}>{isUpdating?"저장 중...":"저장"}</button></div>
            </div> : <><p className="note-card__body">{item.body}</p><div className="note-card__meta"><span className="kind-badge">{getItemKindLabel(item)}</span>{showDueControls && item.due_at!==null && <><span className="meta-separator" aria-hidden="true"/><time dateTime={item.due_at}>기한 {formatCreatedAt(item.due_at)}</time></>}{showCreatedAt && <><span className="meta-separator" aria-hidden="true"/><time dateTime={item.created_at}>{formatCreatedAt(item.created_at)}</time></>}</div>{renderItemDetails?.(item)}</>}
          </div>
          {editingItemId!==item.id && <CardActions isOpen={openActionMenuId===item.id} onOpenChange={(open)=>setOpenActionMenuId(open?item.id:null)} actions={getActions(item)} projectOptions={projects} projectId={item.project_id} onProjectChange={onProjectChange?(projectId)=>onProjectChange(item,projectId):undefined} onProjectCreate={onProjectCreate}/>}
        </article>
      </Fragment>)}
    </div>
  </section>;
}
