import { useEffect, useState, type FormEvent } from "react";
import type { Item } from "../api/items";
import { CardActions, type CardAction, type ProjectOption } from "../components/CardActions";
import { Icon } from "../components/Icon";
import { formatCreatedAt, getDateTimeInputValue } from "../utils/date";
import { getItemKindLabel } from "../utils/item";

type InboxViewProps = {
  items: Item[]; inboxCount: number|null; isPending:boolean; isError:boolean; isSuccess:boolean; isFetching:boolean;
  draft:string; isCreating:boolean; createError:boolean; deleteError:boolean; editingItemId:string|null; editDraft:string; editDueAt:string; editError:string|null; isUpdating:boolean;
  onDraftChange:(value:string)=>void; onCreate:()=>void; onRetry:()=>void; onStartEditing:(item:Item)=>void; onEditDraftChange:(value:string)=>void; onEditDueChange:(value:string)=>void; onCancelEditing:()=>void; onSaveEditing:()=>void;
  onClassify:(item:Item)=>Promise<unknown>; onMoveToTodo:(item:Item)=>Promise<unknown>; onArchive:(item:Item)=>Promise<unknown>; onPurchase:(item:Item)=>Promise<unknown>; onSendToPrintQueue:(item:Item)=>Promise<unknown>; onMoveToModeling:(item:Item)=>Promise<unknown>; onMoveToQuestion:(item:Item)=>Promise<unknown>; onSetToday:(item:Item)=>Promise<unknown>; onDeleteRequest:(item:Item)=>void;
  projects?:ProjectOption[]; onProjectChange?:(item:Item,projectId:string|null)=>Promise<unknown>; onProjectCreate?:(name:string)=>Promise<ProjectOption>;
};

export function InboxView(props:InboxViewProps){
  const {items,inboxCount,isPending,isError,isSuccess,isFetching,draft,isCreating,createError,deleteError,editingItemId,editDraft,editDueAt,editError,isUpdating,onDraftChange,onCreate,onRetry,onStartEditing,onEditDraftChange,onEditDueChange,onCancelEditing,onSaveEditing,onClassify,onMoveToTodo,onArchive,onPurchase,onSendToPrintQueue,onMoveToModeling,onMoveToQuestion,onSetToday,onDeleteRequest,projects=[],onProjectChange,onProjectCreate}=props;
  const [openActionMenuId,setOpenActionMenuId]=useState<string|null>(null);
  useEffect(()=>setOpenActionMenuId(null),[editingItemId]);
  const handleSubmit=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();onCreate();};
  const actions=(item:Item):CardAction[]=>[
    {key:"todo",className:"note-card__todo",label:"Todo로 이동",icon:<Icon name="todo" size={17}/>,onClick:()=>onMoveToTodo(item),inline:true,menuCore:true},
    {key:"today",className:"note-card__today",label:"오늘로 지정",icon:<Icon name="today" size={17}/>,onClick:()=>onSetToday(item),inline:true,menuCore:true},
    {key:"edit",className:"note-card__edit",label:"수정",icon:<Icon name="edit" size={17}/>,onClick:()=>onStartEditing(item),inline:true,menuCore:true},
    {key:"notes",className:"note-card__notes",label:"Notes로 이동",icon:<Icon name="notes" size={17}/>,onClick:()=>onClassify(item)},
    {key:"modeling",className:"note-card__modeling",label:"3D 모델링으로 이동",icon:<Icon name="modeling" size={17}/>,onClick:()=>onMoveToModeling(item)},
    {key:"question",className:"note-card__question",label:"궁금증으로 이동",icon:<Icon name="question" size={17}/>,onClick:()=>onMoveToQuestion(item)},
    {key:"print",className:"note-card__print-queue",label:"Print Queue로 이동",icon:<Icon name="print-queue" size={17}/>,onClick:()=>onSendToPrintQueue(item)},
    {key:"purchase",className:"note-card__purchase",label:"Purchase로 이동",icon:<Icon name="purchase" size={17}/>,onClick:()=>onPurchase(item)},
    {key:"archive",className:"note-card__archive",label:"Archive로 이동",icon:<Icon name="archive" size={17}/>,onClick:()=>onArchive(item),inline:true,menuCore:true},
    {key:"delete",className:"note-card__delete",label:"삭제",icon:<Icon name="delete" size={17}/>,onClick:()=>onDeleteRequest(item)},
  ];
  return <section className="inbox-view" aria-labelledby="inbox-title">
    <header className="view-header"><div><p className="eyebrow">Workspace</p><div className="view-title-row"><h1 id="inbox-title">Inbox</h1>{inboxCount!==null&&<span className="count-pill">{inboxCount}</span>}</div><p className="view-description">떠오른 생각을 붙잡고, 나중에 천천히 정리하세요.</p></div></header>
    <form className="capture-card" onSubmit={handleSubmit}><div className="capture-card__heading"><span className="capture-icon" aria-hidden="true"><Icon name="relay" size={19}/></span><div><strong>Quick capture</strong><span>Inbox에 바로 추가</span></div></div><textarea className="capture-input" value={draft} onChange={(e)=>onDraftChange(e.target.value)} placeholder="메모를 입력하세요..." aria-label="새 메모" rows={3}/><div className="capture-card__footer"><button className="capture-submit" type="submit" disabled={!draft.trim()||isCreating}>{isCreating?<>저장 중...</>:<>저장<Icon name="send" size={16}/></>}</button></div>{createError&&<p className="inline-error" role="alert">저장하지 못했습니다. 잠시 후 다시 시도해 주세요.</p>}</form>
    {deleteError&&<p className="inline-error delete-error" role="alert">메모를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.</p>}
    <div className="list-heading"><div><h2>최근 메모</h2><span>{inboxCount===null?"Inbox":`${inboxCount}개의 메모`}</span></div><span className={`sync-status${isFetching&&!isPending ? "" : " is-idle"}`} role={isFetching&&!isPending ? "status" : undefined} aria-hidden={!(isFetching&&!isPending)}><span className="sync-dot"/><span className="sync-label">동기화 중</span></span></div>
    <div className="note-list" aria-live="polite">
      {isError&&<div className="state-panel state-panel--error" role="alert"><div><h3>메모를 불러오지 못했습니다.</h3></div><button type="button" onClick={onRetry}>다시 시도</button></div>}
      {isSuccess&&items.length===0&&<div className="state-panel state-panel--empty"><div><h3>Inbox가 비어 있습니다.</h3><p>위 입력창에서 첫 메모를 남겨 보세요.</p></div></div>}
      {isSuccess&&items.map(item=><article className={`note-card${editingItemId===item.id?" note-card--editing":""}`} key={item.id}><span className="note-card__marker" aria-hidden="true"><Icon name="notes" size={18}/></span><div className="note-card__content">{editingItemId===item.id?<div className="note-card__editor"><textarea className="note-card__textarea" value={editDraft} onChange={(e)=>onEditDraftChange(e.target.value)} aria-label="메모 수정" rows={4} autoFocus/><div className="note-card__due-editor"><label htmlFor={`inbox-due-${item.id}`}>기한</label><input id={`inbox-due-${item.id}`} className="note-card__due-input" type="datetime-local" value={editDueAt} onChange={(e)=>onEditDueChange(e.target.value)}/><div className="note-card__due-quick-actions"><button type="button" onClick={()=>onEditDueChange(getDateTimeInputValue(0))}>오늘</button><button type="button" onClick={()=>onEditDueChange(getDateTimeInputValue(1))}>내일</button><button type="button" onClick={()=>onEditDueChange("")}>기한 없음</button></div></div><p className="note-card__created-info">작성 {formatCreatedAt(item.created_at)}</p>{editError&&<p className="note-card__edit-error">{editError}</p>}<div className="note-card__editor-actions"><button type="button" onClick={onCancelEditing}>취소</button><button type="button" onClick={onSaveEditing} disabled={!editDraft.trim()||isUpdating}>저장</button></div></div>:<><p className="note-card__body">{item.body}</p><div className="note-card__meta"><span className="kind-badge">{getItemKindLabel(item)}</span>{item.due_at!==null&&<><span className="meta-separator"/><time dateTime={item.due_at}>기한 {formatCreatedAt(item.due_at)}</time></>}</div></>}</div>{editingItemId!==item.id&&<CardActions isOpen={openActionMenuId===item.id} onOpenChange={(open)=>setOpenActionMenuId(open?item.id:null)} actions={actions(item)} projectOptions={projects} projectId={item.project_id} onProjectChange={onProjectChange?(pid)=>onProjectChange(item,pid):undefined} onProjectCreate={onProjectCreate}/>}</article>)}
    </div>
  </section>;
}
