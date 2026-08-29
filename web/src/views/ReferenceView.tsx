import { useState, type ComponentProps, type FormEvent } from "react";
import { NotesView } from "./NotesView";
import type { ReferenceType } from "../api/items";

type ReferenceViewProps = ComponentProps<typeof NotesView> & {
  referenceType: ReferenceType;
  onCreate: (body: string) => Promise<unknown>;
  isCreating: boolean;
  createError: boolean;
};

const labels: Record<ReferenceType, string> = {
  modeling: "3D 모델링",
  question: "궁금증",
};

export function ReferenceView({
  referenceType,
  onCreate,
  isCreating,
  createError,
  ...notesProps
}: ReferenceViewProps) {
  const [draft, setDraft] = useState("");
  const label = labels[referenceType];

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || isCreating) return;
    await onCreate(trimmed);
    setDraft("");
  };

  return (
    <>
      <form className="reference-capture" onSubmit={(event) => void handleSubmit(event)}>
        <div>
          <p className="eyebrow">REFERENCE</p>
          <h2>{label}</h2>
        </div>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={`${label} 메모를 입력하세요`}
          rows={2}
          disabled={isCreating}
        />
        <button type="submit" disabled={!draft.trim() || isCreating}>
          {isCreating ? "저장 중..." : "저장"}
        </button>
        {createError && <p className="inline-error" role="alert">저장하지 못했습니다.</p>}
      </form>
      <NotesView
        {...notesProps}
        viewTitle={label}
        viewDescription={`${label} reference를 모아봅니다.`}
        emptyDescription={`${label} 항목이 아직 없습니다.`}
        showDueControls={false}
      />
    </>
  );
}