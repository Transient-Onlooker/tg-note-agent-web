import {
  useState,
  type ComponentProps,
  type FormEvent,
} from "react";
import type {
  Item,
  PurchaseSource,
} from "../api/items";
import { NotesView } from "./NotesView";

type PurchaseFilter = "all" | PurchaseSource;
type PurchaseViewProps = Omit<
  ComponentProps<typeof NotesView>,
  | "viewTitle"
  | "viewDescription"
  | "emptyDescription"
  | "onPurchase"
  | "items"
  | "notesCount"
  | "renderBeforeList"
  | "renderItemDetails"
> & {
  items: Item[];
  notesCount: number | null;
  onCreate: (body: string, source: PurchaseSource, url: string) => Promise<unknown>;
  isCreating: boolean;
  createError: boolean;
  onUpdateProperties: (itemId: string, propertiesJson: string) => Promise<unknown>;
};

type PurchaseDetails = {
  source: PurchaseSource | null;
  url: string;
};

const sourceLabels: Record<PurchaseSource, string> = {
  domestic: "국내",
  overseas: "해외",
};

function readPurchaseDetails(item: Item): PurchaseDetails {
  try {
    const parsed: unknown = JSON.parse(item.properties_json);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { source: null, url: "" };
    }

    const properties = parsed as Record<string, unknown>;
    return {
      source:
        properties.purchase_source === "domestic" ||
        properties.purchase_source === "overseas"
          ? properties.purchase_source
          : null,
      url: typeof properties.purchase_url === "string"
        ? properties.purchase_url
        : "",
    };
  } catch {
    return { source: null, url: "" };
  }
}

function mergePurchaseDetails(
  item: Item,
  source: PurchaseSource,
  url: string,
) {
  let properties: Record<string, unknown> = {};

  try {
    const parsed: unknown = JSON.parse(item.properties_json);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      properties = { ...(parsed as Record<string, unknown>) };
    }
  } catch {
    // A new valid object is safer than carrying invalid JSON into the PATCH.
  }

  properties.purchase_source = source;
  const trimmedUrl = url.trim();

  if (trimmedUrl) {
    properties.purchase_url = trimmedUrl;
  } else {
    delete properties.purchase_url;
  }

  return JSON.stringify(properties);
}

function getLinkUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function PurchaseView({
  items,
  notesCount,
  onCreate,
  isCreating,
  createError,
  onUpdateProperties,
  ...notesProps
}: PurchaseViewProps) {
  const [filter, setFilter] = useState<PurchaseFilter>("all");
  const [newBody, setNewBody] = useState("");
  const [newSource, setNewSource] = useState<PurchaseSource>("domestic");
  const [newUrl, setNewUrl] = useState("");
  const [editingDetails, setEditingDetails] = useState<{
    itemId: string;
    source: PurchaseSource;
    url: string;
  } | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [isSavingDetails, setIsSavingDetails] = useState(false);

  const filteredItems = filter === "all"
    ? items
    : items.filter((item) => readPurchaseDetails(item).source === filter);

  const submitNewPurchase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedBody = newBody.trim();
    if (!trimmedBody || isCreating) return;

    try {
      await onCreate(trimmedBody, newSource, newUrl);
      setNewBody("");
      setNewUrl("");
    } catch {
      // The owning mutation provides the shared error feedback.
    }
  };

  const startEditingDetails = (item: Item) => {
    const details = readPurchaseDetails(item);
    setDetailsError(null);
    setEditingDetails({
      itemId: item.id,
      source: details.source ?? "domestic",
      url: details.url,
    });
  };

  const saveDetails = async (item: Item) => {
    if (!editingDetails || editingDetails.itemId !== item.id || isSavingDetails) {
      return;
    }

    setIsSavingDetails(true);
    setDetailsError(null);

    try {
      await onUpdateProperties(
        item.id,
        mergePurchaseDetails(item, editingDetails.source, editingDetails.url),
      );
      setEditingDetails(null);
    } catch {
      setDetailsError("구매 정보를 저장하지 못했습니다.");
    } finally {
      setIsSavingDetails(false);
    }
  };

  return (
    <NotesView
      {...notesProps}
      items={filteredItems}
      notesCount={notesCount === null ? null : filteredItems.length}
      viewTitle="Purchase"
      viewDescription="구매할 항목을 출처와 링크까지 함께 관리합니다."
      emptyDescription="구매할 항목이 아직 없습니다."
      renderBeforeList={
        <div className="purchase-tools">
          <div className="purchase-filter-tabs" role="tablist" aria-label="구매 출처 필터">
            {(["all", "domestic", "overseas"] as const).map((source) => (
              <button
                key={source}
                type="button"
                role="tab"
                aria-selected={filter === source}
                className={filter === source ? "is-active" : undefined}
                onClick={() => setFilter(source)}
              >
                {source === "all" ? "전체" : sourceLabels[source]}
              </button>
            ))}
          </div>

          <form className="purchase-create" onSubmit={(event) => void submitNewPurchase(event)}>
            <input
              value={newBody}
              onChange={(event) => setNewBody(event.target.value)}
              placeholder="구매할 항목을 입력하세요"
              aria-label="구매 항목"
              disabled={isCreating}
            />
            <select
              value={newSource}
              onChange={(event) => setNewSource(event.target.value as PurchaseSource)}
              aria-label="구매 출처"
              disabled={isCreating}
            >
              <option value="domestic">국내</option>
              <option value="overseas">해외</option>
            </select>
            <input
              value={newUrl}
              onChange={(event) => setNewUrl(event.target.value)}
              placeholder="상품 URL (선택)"
              aria-label="상품 URL"
              disabled={isCreating}
            />
            <button type="submit" disabled={!newBody.trim() || isCreating}>
              {isCreating ? "추가 중..." : "추가"}
            </button>
          </form>
          {createError && (
            <p className="inline-error" role="alert">
              구매 항목을 추가하지 못했습니다.
            </p>
          )}
        </div>
      }
      renderItemDetails={(item) => {
        const details = readPurchaseDetails(item);
        const linkUrl = getLinkUrl(details.url);
        const isEditing = editingDetails?.itemId === item.id;

        return (
          <div className="purchase-details">
            {isEditing ? (
              <div className="purchase-details__editor">
                <select
                  value={editingDetails.source}
                  onChange={(event) => setEditingDetails((current) =>
                    current
                      ? { ...current, source: event.target.value as PurchaseSource }
                      : current,
                  )}
                  aria-label="구매 출처"
                  disabled={isSavingDetails}
                >
                  <option value="domestic">국내</option>
                  <option value="overseas">해외</option>
                </select>
                <input
                  value={editingDetails.url}
                  onChange={(event) => setEditingDetails((current) =>
                    current
                      ? { ...current, url: event.target.value }
                      : current,
                  )}
                  placeholder="상품 URL (선택)"
                  aria-label="상품 URL"
                  disabled={isSavingDetails}
                />
                <button
                  type="button"
                  onClick={() => void saveDetails(item)}
                  disabled={isSavingDetails}
                >
                  {isSavingDetails ? "저장 중..." : "저장"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingDetails(null);
                    setDetailsError(null);
                  }}
                  disabled={isSavingDetails}
                >
                  취소
                </button>
              </div>
            ) : (
              <div className="purchase-details__summary">
                <span className="purchase-source">
                  {details.source ? sourceLabels[details.source] : "출처 미설정"}
                </span>
                {details.url && (
                  linkUrl ? (
                    <a href={linkUrl} target="_blank" rel="noreferrer">
                      {details.url}
                    </a>
                  ) : (
                    <span className="purchase-url--invalid">{details.url}</span>
                  )
                )}
                <button type="button" onClick={() => startEditingDetails(item)}>
                  출처/URL 수정
                </button>
              </div>
            )}
            {isEditing && detailsError && (
              <p className="inline-error" role="alert">{detailsError}</p>
            )}
          </div>
        );
      }}
    />
  );
}
