import type { NavigationItem } from "../config/navigation";
import { Icon } from "../components/Icon";

type PlaceholderViewProps = {
  item: NavigationItem;
  onGoInbox: () => void;
};

export function PlaceholderView({
  item,
  onGoInbox,
}: PlaceholderViewProps) {
  return (
    <section className="placeholder-view" aria-labelledby="placeholder-title">
      <header className="view-header">
        <div>
          <p className="eyebrow">Workspace</p>
          <div className="view-title-row">
            <h1 id="placeholder-title">{item.label}</h1>
            <span className="soon-pill">준비 중</span>
          </div>
          <p className="view-description">{item.description}</p>
        </div>
      </header>

      <div className="placeholder-card">
        <span className="placeholder-card__icon">
          <Icon name={item.id} size={28} />
        </span>
        <h2>{item.label}</h2>
        <p>
          이 화면은 아직 준비 중입니다. 현재는 Inbox에서 메모를 관리해 주세요.
        </p>
        <button type="button" onClick={onGoInbox}>
          Inbox로 돌아가기
        </button>
      </div>
    </section>
  );
}