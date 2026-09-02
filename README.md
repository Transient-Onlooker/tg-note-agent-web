# NoteRelay

> Telegram으로 빠르게 기록하고, Web에서 정리하는 개인용 Capture & Workspace.

NoteRelay는 입력 원문을 안전하게 보존하면서 Inbox, Todo, Projects, Purchase, Print Queue 등으로 정리하는 가벼운 개인 노트 시스템입니다.

- **Telegram**: 가장 빠른 Capture 및 구조화된 `/print` 입력
- **Web**: 정리·분류·편집을 위한 Workspace
- **Cloudflare Worker + Hono**: API, 인증, Telegram webhook
- **Cloudflare D1**: 단일 데이터 원본
- **Durable Object + WebSocket**: 변경 알림

## 현재 기능

### Capture와 Item

- Web Quick Capture와 Telegram 텍스트 Capture
- Telegram webhook secret 및 허용 사용자 검증
- Telegram `chat_id + message_id` 기준 중복 방지
- 원본은 `captures`에 보존하고, 관리용 레코드는 `items`에 생성
- 저장 후 원본 Telegram 메시지에 ✅ reaction을 best-effort로 요청
- reaction 실패는 저장을 rollback하거나 webhook을 실패시키지 않음
- 일반 Telegram 텍스트는 Inbox Item으로 저장

### Workspace

- Inbox, Todo, Today, Notes
- 3D 모델링·궁금증 reference views
- Projects, Purchase, Print Queue, Archive, Trash
- 데스크톱 sidebar와 모바일 drawer navigation
- 카드의 inline action + `…` 메뉴, 터치 환경 first-tap guard
- 메뉴는 viewport safe area를 고려하며 공간이 부족하면 메뉴 내부만 스크롤
- 모든 view의 loading, empty, error, sync 상태
- WebSocket event 수신 시 TanStack Query 기반 최신화

### Item 관리

- `kind`, `status`, `project_id`, `due_at`, `properties_json` PATCH
- 이동/분류의 optimistic UI와 실패 rollback
- 최근 액션 snackbar 및 Undo
- 편집 실패 시 작성 중이던 draft를 복원
- 연속 편집 시 이전 요청이 다른 Item editor를 닫거나 덮어쓰지 않도록 보호
- soft delete, Trash restore, Trash 비우기
- soft delete와 Trash 비우기는 Capture 원본을 삭제하지 않음

## 주요 화면 규칙

### Inbox와 미정리

Inbox는 `kind=inbox AND status=active` Item입니다. `triaged_at`은 Inbox 필터가 아니라 독립적인 미정리 상태 데이터입니다.

명시적으로 Todo, Notes, Purchase, Print Queue, reference view 등으로 이동하면 `triaged_at`을 기록합니다. due date 변경이나 Today 지정만으로는 `triaged_at`을 바꾸지 않습니다.

### Todo와 Today

- Todo: `kind=task AND status=active`
- Todo는 overdue → 오늘/미래 due → due 없음 순으로 정렬됩니다.
- 오늘 마감 Todo는 Todo 화면에서 별도 섹션으로 표시됩니다.
- Today는 kind가 아닌 `due_at` 기반 화면입니다.
- Today에는 active Item 중 브라우저 로컬 기준 다음날 00:00 이전 due를 가진 Item이 표시되며, overdue도 포함합니다.
- `오늘로 지정`은 분류를 바꾸지 않고 `due_at`만 오늘로 설정합니다.

### Projects

- `projects` table과 `items.project_id`를 사용합니다.
- 프로젝트 생성·이름 변경·삭제, 프로젝트별 Item 목록, Item 연결·해제를 지원합니다.
- 카드의 프로젝트 선택 메뉴에서 `+ 새 프로젝트 만들기` 후 즉시 연결할 수 있습니다.
- 프로젝트 삭제 시 연결 Item은 삭제하지 않습니다. 연결된 active Item은 `project_id`를 해제하고 Archive로 이동합니다.

### Purchase

`properties_json`의 값을 사용합니다.

- `purchase_source`: `domestic` 또는 `overseas`
- `purchase_url`: 상품 URL
- 전체 탭에는 legacy Item도 보이며, 국내·해외 탭은 해당 source만 표시합니다.
- `http`/`https` URL만 새 탭 링크로 렌더링하고 그 외 값은 일반 텍스트로 보존합니다.

## Print Queue

Print Queue는 `kind=print_job`, `status=active` Item의 독립 Workspace입니다. 별도 print_jobs table은 사용하지 않습니다.

| 저장 위치 | 값 |
| --- | --- |
| `items.body` | 출력물 |
| `items.due_at` | 출력 예정일 |
| `properties_json.customer` | 의뢰인 |
| `properties_json.colors` | 색상 배열 |
| `properties_json.grams` | 무게 |
| `properties_json.price` | 금액 |
| `properties_json.payment` | 입금 정보 |
| `properties_json.queue_status` | Queue 상태 |
| `properties_json.model_url` | 모델 URL |
| `properties_json.note` | 비고 |

Queue 상태는 Item lifecycle과 분리됩니다.

- `missing` — 미상
- `waiting` — 대기
- `printing` — 출력중
- `done` — 완료
- `paused` — 보류

기존 비표준 상태는 사용자가 새 표준 값을 명시적으로 선택하기 전까지 원문으로 표시·보존합니다.

- `position ASC → created_at ASC → id ASC`로 실제 출력 순서를 정합니다.
- 드래그는 순번 셀에서 시작하며, 포인터가 다른 열로 이동해도 행의 Y 위치로 drop target을 계산합니다.
- 출력물·비고 textarea는 내용에 맞게 자동 확장되고 max height 이후 내부 스크롤을 사용합니다.
- 셀 편집은 blur, Enter, Tab/Shift+Tab으로 저장하고 Escape로 취소합니다.
- 셀 저장은 항목별 백그라운드 큐로 처리되어 다른 셀 입력을 기다리게 하지 않습니다.
- 색상은 한국어/영문 주요 색상명에 대해 실제 swatch chip으로 표시합니다.

## Telegram `/print`

`/print`는 AI 추론 없이 명시적으로 전달한 값만 Print Queue Item으로 만듭니다.

```text
/print item="케이스" customer="홍길동" colors="black,white" grams=250 price=5000 payment=paid status=waiting date=2026-09-03 model="https://..." note="급함"
```

- `item`은 필수이며 `items.body`로 저장됩니다.
- `date`는 `due_at`, 나머지 구조화 값은 `properties_json`으로 저장됩니다.
- 숫자·날짜·상태 값은 검증하며 잘못된 입력에는 한국어 사용법 메시지를 보냅니다.
- 새 작업은 active Print Queue의 마지막 다음 `position`을 받습니다.
- 일반 Telegram Capture 흐름은 `/print`와 분리되어 유지됩니다.

## API

`/api/*`는 Bearer Access Key가 필요합니다.

```http
Authorization: Bearer <WEB_API_TOKEN>
```

주요 endpoint:

```text
GET    /health
GET    /api/health
GET    /api/counts?today_to=<ISO>

GET    /api/items
POST   /api/items
PATCH  /api/items/:id
DELETE /api/items/:id              # soft delete
POST   /api/items/:id/restore

GET    /api/trash
DELETE /api/trash                  # Item만 영구 삭제

GET    /api/projects
POST   /api/projects
PATCH  /api/projects/:id
DELETE /api/projects/:id

POST   /telegram/webhook
GET    /ws
```

`GET /api/items`는 `kind`, `status`, `project_id`, `due_from`, `due_to` 필터를 지원합니다.

## Local development

### 요구 사항

- Node.js 24+
- npm
- Wrangler login은 remote D1 또는 deploy 시에만 필요

```bash
npm install
```

`worker/.dev.vars`를 로컬에서만 생성합니다.

```dotenv
TELEGRAM_BOT_TOKEN=replace-me
TELEGRAM_WEBHOOK_SECRET=local-test-secret
TELEGRAM_ALLOWED_USER_ID=123456789
WEB_API_TOKEN=replace-me
```

`worker/.dev.vars`와 실제 token·secret은 Git에 커밋하지 않습니다.

Worker와 Web을 각각 실행합니다.

```bash
npm run dev:worker
npm run dev:web
```

기본 local Worker URL은 `http://127.0.0.1:8787`입니다. 필요하면 `web/.env.local`에서 API URL을 지정합니다.

```dotenv
VITE_API_BASE_URL=http://127.0.0.1:8787
```

### Database

```bash
# local
npx wrangler d1 migrations apply DB --local --config worker/wrangler.jsonc

# production
npx wrangler d1 migrations apply DB --remote --config worker/wrangler.jsonc
```

## Validation

```bash
npm run typecheck:worker
npm run build:web
npm run lint --workspace web
git diff --check
```

## Deployment

GitHub Actions workflow가 다음을 수행합니다.

- `main` push: GitHub Pages Web build/deploy
- `worker/**`, `shared/**`, root package file 변경 main push: Worker typecheck/deploy

GitHub Pages base path:

```text
/tg-note-agent-web/
```

Production API URL은 Pages build workflow에서 다음 값으로 주입됩니다.

```text
https://tg-note-agent-web-api.junuh145858.workers.dev
```

Worker deploy에는 repository secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`가 필요합니다. Worker runtime secret은 Cloudflare에 별도로 등록합니다.

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN --config worker/wrangler.jsonc
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET --config worker/wrangler.jsonc
npx wrangler secret put TELEGRAM_ALLOWED_USER_ID --config worker/wrangler.jsonc
npx wrangler secret put WEB_API_TOKEN --config worker/wrangler.jsonc
```

## Data model

핵심 entity는 `captures`, `items`, `projects`입니다. `captures`는 입력 원문, `items`는 분류·편집·삭제되는 관리 레코드입니다.

주요 Item 필드:

```text
id, capture_id, project_id, kind, status, body, due_at,
properties_json, position, triaged_at, created_at, updated_at,
deleted_at, version
```

현재 사용 kind:

```text
inbox
note
task
purchase
print_job
reference
```

## Product direction

NoteRelay는 범용 Notion clone이 아니라 빠른 개인 Inbox 중심 도구입니다.

1. Capture가 빨라야 합니다.
2. 원본 데이터는 안전하게 보존해야 합니다.
3. Web에서 분류와 관리가 명확해야 합니다.
4. 새 도메인 데이터는 우선 `items + properties_json`으로 단순하게 모델링합니다.
5. AI 없이 핵심 흐름이 완성되어야 하며, AI는 향후 보조 역할만 합니다.

## License

개인 프로젝트입니다. 외부 재사용을 위한 라이선스는 필요 시 추가합니다.