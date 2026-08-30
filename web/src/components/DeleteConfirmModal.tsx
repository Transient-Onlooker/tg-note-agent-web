import { Icon } from "./Icon";

type DeleteConfirmModalProps = {
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
  confirmLabel?: string;
  pendingLabel?: string;
};

export function DeleteConfirmModal({
  isPending,
  onCancel,
  onConfirm,
  title = "메모를 삭제할까요?",
  description = "삭제한 메모는 휴지통으로 이동합니다.",
  confirmLabel = "삭제",
  pendingLabel = "삭제 중...",
}: DeleteConfirmModalProps) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-confirm-title" aria-describedby="delete-confirm-description" onClick={(event) => event.stopPropagation()}>
        <div className="confirm-modal__icon" aria-hidden="true"><Icon name="delete" size={20} /></div>
        <h2 id="delete-confirm-title">{title}</h2>
        <p id="delete-confirm-description">{description}</p>
        <div className="confirm-modal__actions">
          <button className="confirm-modal__cancel" type="button" onClick={onCancel} disabled={isPending}>취소</button>
          <button className="confirm-modal__delete" type="button" onClick={onConfirm} disabled={isPending}>{isPending ? pendingLabel : confirmLabel}</button>
        </div>
      </section>
    </div>
  );
}
