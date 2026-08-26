# NoteRelay V0 Handoff

## 현재 완료된 기능

- Vite + React + TypeScript Web
- Cloudflare Worker + Hono
- Cloudflare D1 binding `DB`
- `captures`, `items` 등 초기 schema
- Web Quick Capture
- Inbox 목록
- Enter는 줄바꿈, 저장 버튼으로만 저장
- Inbox soft delete
- 삭제 시 Capture 원본 보존
- Telegram `/telegram/webhook`
- webhook secret 검증
- allowed Telegram user 검증
- duplicate Telegram message 방지
- Telegram Capture + Inbox Item 저장
- 저장 성공 후 Telegram reaction best-effort
- reaction 실패가 저장을 rollback하지 않음
- responsive Web UI
- GitHub Pages base `/tg-note-agent-web/`
- `orthopedics` 로고/favicon

## 현재 production 상태

- Cloudflare D1 `note-relay` 자체는 생성됨
- production D1 migration은 아직 적용하지 않음
- Worker production deploy 아직 안 함
- 실제 Telegram Bot secrets 아직 Worker production에 등록하지 않음
- 실제 Telegram `setWebhook` 아직 안 함
- GitHub Pages production 배포/최종 연결은 다음 세션에서 진행
- Web API production 인증도 다음 세션에서 처리 필요

## 다음 세션 시작 순서

1. production D1 migration
2. Worker production secrets 등록
3. Worker deploy
4. 실제 Telegram Bot webhook 전환
5. Telegram → Worker → D1 실제 E2E 검증
6. GitHub Pages 배포
7. production API URL 연결
8. Web API 인증 적용
9. 최종 V0 E2E 검증
