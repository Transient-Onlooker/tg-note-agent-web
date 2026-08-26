# NoteRelay API

Base path: `/api`

## Health

### GET /health

Worker 상태 확인.

---

## Items

### GET /api/items

Query parameters:

- `kind`
- `status`
- `project_id`
- `triaged`
- `deleted`
- `limit`
- `cursor`

### POST /api/items

웹에서 새 Item 생성.

새 웹 입력은 기본적으로 Capture와 Inbox Item을 함께 만든다.

### GET /api/items/:id

Item 상세 조회.

### PATCH /api/items/:id

Item 수정.

Client는 현재 `version`을 함께 보내야 한다.

Worker는 optimistic concurrency control을 사용한다.

### DELETE /api/items/:id

Soft delete.

실제 row는 삭제하지 않고 `deleted_at`을 설정한다.

### POST /api/items/:id/split

여러 줄 Item을 여러 Item으로 수동 분리한다.

---

## Projects

### GET /api/projects

프로젝트 목록.

### POST /api/projects

프로젝트 생성.

### PATCH /api/projects/:id

프로젝트 수정.

---

## Search

### GET /api/search?q=

Item 검색.

초기 구현은 LIKE 검색.
향후 FTS5로 교체한다.

---

## Telegram

### POST /telegram/webhook

Telegram capture 전용 endpoint.

처리:

1. webhook secret 검증
2. allowed user 검증
3. duplicate message 검증
4. Capture 생성
5. Inbox Item 생성
6. Telegram acknowledgement

AI는 이 경로에 참여하지 않는다.

---

## AI

MVP 이후 활성화.

### POST /api/ai/ask

DB 검색 결과를 기반으로 질문에 답한다.

### POST /api/ai/suggest

분류 / 정리 결과를 제안한다.

AI 응답 자체는 데이터베이스를 변경하지 않는다.
