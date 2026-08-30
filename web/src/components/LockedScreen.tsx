import {
  useState,
  type FormEvent,
} from "react";
import { Icon } from "./Icon";
export function LockedScreen({
  isChecking,
  error,
  onUnlock,
}: {
  isChecking: boolean;
  error: string | null;
  onUnlock: (key: string, remember: boolean) => Promise<void>;
}) {
  const [key, setKey] = useState("");
  const [remember, setRemember] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!key || isSubmitting || isChecking) {
      return;
    }

    setIsSubmitting(true);
    await onUnlock(key, remember);
    setIsSubmitting(false);
  };

  return (
    <main className="lock-screen">
      <form className="lock-card" onSubmit={handleSubmit}>
        <div className="lock-card__brand">
          <span className="brand__mark" aria-hidden="true">
            <span className="material-symbols-outlined">orthopedics</span>
          </span>
          <strong>NoteRelay</strong>
        </div>
        <div className="lock-card__heading">
          <span className="lock-card__icon" aria-hidden="true">
            <Icon name="lock" size={20} />
          </span>
          <div>
            <h1>Locked</h1>
            <p>Access key를 입력해 workspace를 여세요.</p>
          </div>
        </div>
        <label className="lock-card__label" htmlFor="access-key">
          Access key
        </label>
        <input
          id="access-key"
          className="lock-card__input"
          type="password"
          value={key}
          onChange={(event) => setKey(event.target.value)}
          autoComplete="current-password"
          autoFocus={!isChecking}
          disabled={isChecking || isSubmitting}
        />
        <label className="lock-card__remember">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
            disabled={isChecking || isSubmitting}
          />
          <span>이 기기에서 기억하기</span>
        </label>
        {error && (
          <p className="lock-card__error" role="alert">
            {error}
          </p>
        )}
        <button
          className="lock-card__submit"
          type="submit"
          disabled={!key || isChecking || isSubmitting}
        >
          {isChecking || isSubmitting ? "확인 중..." : "잠금 해제"}
        </button>
      </form>
    </main>
  );
}
