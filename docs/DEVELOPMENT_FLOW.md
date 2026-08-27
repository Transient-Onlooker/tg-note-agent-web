# NoteRelay Development Flow

> Repository: `Transient-Onlooker/tg-note-agent-web`
>
> Telegram으로 빠르게 Capture하고,
> Web에서 정리·관리하며,
> 이후 검색·프로젝트·자동화·AI까지 확장하는
> 개인용 Capture & Notes 시스템의 개발 지도.
>
> 이 문서는 특정 버전만을 위한 계획이 아니라
> NoteRelay 전체 생명주기를 추적한다.

---

# 1. Product Evolution

```mermaid
flowchart LR
    IDEA[Initial Idea]

    V0[V0<br/>Capture Foundation]
    V1[V1<br/>Usable Personal Workspace]
    V2[V2<br/>Structured Knowledge & Tasks]
    V3[V3<br/>Automation & Intelligence]
    FUTURE[Future<br/>Personal Knowledge Agent]

    IDEA --> V0
    V0 --> V1
    V1 --> V2
    V2 --> V3
    V3 --> FUTURE
```

---

# 2. Version Overview

```mermaid
flowchart TB

    subgraph V0["V0 — Capture Foundation"]
        V0A[Telegram Capture]
        V0B[Web Quick Capture]
        V0C[D1 Persistence]
        V0D[Inbox]
        V0E[Edit]
        V0F[Soft Delete]
        V0G[Trash / Restore]
        V0H[Access Key Authentication]
        V0I[Realtime Sync]
        V0J[Production Deployment]
    end

    subgraph V1["V1 — Personal Workspace"]
        V1A[Stable Inbox Workflow]
        V1B[Today View]
        V1C[Projects]
        V1D[Search]
        V1E[Improved Navigation]
        V1F[Error / Empty / Loading UX]
        V1G[Reliability Hardening]
    end

    subgraph V2["V2 — Structured Knowledge"]
        V2A[Tasks]
        V2B[Due Dates]
        V2C[Tags]
        V2D[Attachments]
        V2E[Revision History]
        V2F[Advanced Filtering]
    end

    subgraph V3["V3 — Automation & Intelligence"]
        V3A[OCR]
        V3B[AI Classification]
        V3C[AI Search]
        V3D[Summarization]
        V3E[Automation]
        V3F[Specialized Queues]
    end

    V0 --> V1
    V1 --> V2
    V2 --> V3
```

> V1 이후의 버전 경계는 고정된 계약이 아니다.
> 실제 사용 경험과 우선순위에 따라 기능은 앞뒤 버전으로 이동할 수 있다.

---

# 3. Current Architecture

```mermaid
flowchart LR

    USER[User]

    USER --> TG[Telegram]
    USER --> WEB[Web Workspace]

    TG -->|Webhook| WORKER[Cloudflare Worker]
    WEB -->|REST API| WORKER

    WORKER --> D1[(Cloudflare D1)]

    WORKER -->|Mutation event| RT[RealtimeHub<br/>Durable Object]

    WEB <-->|Authenticated WebSocket| RT

    WORKER -->|Reaction| TELEGRAM_API[Telegram Bot API]
```

---

# 4. Core Data Model

NoteRelay는 원본 입력과 사용자가 관리하는 데이터를 분리한다.

```mermaid
flowchart TD

    INPUT[Telegram / Web Input]

    CAPTURE[Capture<br/>Immutable-ish Original]
    ITEM[Item<br/>Managed Workspace Record]

    INPUT --> CAPTURE
    CAPTURE --> ITEM

    ITEM --> EDIT[Edit]
    ITEM --> PROJECT[Project]
    ITEM --> TAG[Tags]
    ITEM --> TASK[Task Metadata]

    ITEM -->|Soft Delete| TRASH[Trash]

    TRASH -->|Restore| ITEM

    CAPTURE --> ORIGINAL[Original Input Preserved]
```

핵심 원칙:

- Capture는 입력 원본을 보존한다.
- Item은 사용자가 정리하고 수정하는 작업 대상이다.
- Item 삭제는 기본적으로 soft delete다.
- 기능 확장 시에도 원본 Capture 보존 원칙을 유지한다.

---

# 5. Data Flow

## Telegram Capture

```mermaid
sequenceDiagram
    participant U as User
    participant TG as Telegram
    participant W as Worker
    participant DB as D1
    participant RT as RealtimeHub
    participant WEB as Web Client

    U->>TG: Send message
    TG->>W: Webhook

    W->>W: Validate webhook secret
    W->>W: Validate allowed user
    W->>DB: Check duplicate message

    alt New capture
        W->>DB: Create Capture
        W->>DB: Create Item
        W->>RT: Broadcast item_created
        RT-->>WEB: Realtime event
        WEB->>W: Refetch items
        W->>TG: Reaction
    else Duplicate
        W-->>TG: Ignore duplicate persistence
    end
```

## Web Mutation

```mermaid
sequenceDiagram
    participant WEB as Web Client
    participant W as Worker API
    participant DB as D1
    participant RT as RealtimeHub

    WEB->>W: Create / Edit / Delete / Restore
    W->>W: Validate access key
    W->>DB: Persist mutation
    DB-->>W: Success

    W->>RT: Broadcast change
    RT-->>WEB: Change notification

    WEB->>W: Refetch affected queries
    W->>DB: Read current state
    DB-->>WEB: Latest state
```

WebSocket의 역할은 데이터 전달 자체가 아니라
**변경 사실을 빠르게 전달하는 notification channel**이다.

---

# 6. V0 — Capture Foundation

V0의 목적:

> Telegram과 Web 어디에서 입력하더라도
> 데이터가 안전하게 D1에 저장되고,
> Web Workspace에서 기본적인 관리가 가능한 상태.

```mermaid
flowchart LR
    A[Capture] --> B[Persist]
    B --> C[View]
    C --> D[Edit]
    D --> E[Delete]
    E --> F[Restore]
    F --> G[Secure]
    G --> H[Realtime]
    H --> I[Deploy]
```

현재 구현된 V0 baseline:

- Telegram Capture
- Telegram webhook validation
- Allowed Telegram user validation
- Duplicate protection
- Capture → Item 생성
- Successful capture reaction
- Web Quick Capture
- Inbox
- Item Editing
- Soft Delete
- Trash
- Restore
- Capture preservation
- Web API Access Key
- Durable Object WebSocket
- Realtime query invalidation
- Cloudflare Worker production deployment
- GitHub Pages deployment

```mermaid
flowchart LR
    V0A[Telegram] --> V0B[D1]
    V0B --> V0C[Web]
    V0C --> V0D[Editing]
    V0D --> V0E[Trash]
    V0E --> V0F[Auth]
    V0F --> V0G[Realtime]
    V0G --> V0H[V0 Baseline]

    classDef done fill:#d4edda,stroke:#22863a,color:#111;
    class V0A,V0B,V0C,V0D,V0E,V0F,V0G,V0H done;
```

---

# 7. V1 — Personal Workspace

V1의 핵심 목표:

> 단순 Capture 저장소를 넘어,
> 매일 실제로 사용할 수 있는 개인 Workspace로 만든다.

```mermaid
flowchart TD

    BASE[V0 Stable Baseline]

    BASE --> REL[Reliability]
    BASE --> NAV[Workspace Navigation]
    BASE --> TODAY[Today]
    BASE --> PROJECTS[Projects]
    BASE --> SEARCH[Search]

    REL --> UX[UX Hardening]
    NAV --> UX
    TODAY --> UX
    PROJECTS --> UX
    SEARCH --> UX

    UX --> TEST[Integration Verification]
    TEST --> PROD[Production Verification]

    PROD --> V1[V1]
```

V1 후보 작업 영역:

### Foundation Hardening

- API validation
- Error handling
- Loading states
- Empty states
- WebSocket reconnect handling
- Realtime consistency
- Multi-client behavior
- Duplicate behavior
- Production smoke tests

### Workspace

- Today
- Projects
- Search
- Navigation
- Better item organization
- Mobile usability

### Release Quality

- Build verification
- Worker typecheck
- Database migration safety
- Production API verification
- Pages verification
- Regression verification

---

# 8. V2 — Structured Knowledge & Action

V2부터 Item이 단순 메모를 넘어
구조화된 정보와 행동 단위로 발전한다.

```mermaid
flowchart TD

    ITEM[Item]

    ITEM --> PROJECT[Project]
    ITEM --> TAG[Tags]
    ITEM --> TASK[Task]
    ITEM --> DUE[Due Date]
    ITEM --> ATTACH[Attachment]
    ITEM --> REVISION[Revision]

    TASK --> ACTION[Action Management]
    DUE --> ACTION

    PROJECT --> ORGANIZE[Structured Knowledge]
    TAG --> ORGANIZE

    ATTACH --> KNOWLEDGE[Rich Knowledge]
    REVISION --> KNOWLEDGE
```

후보 기능:

- Tasks
- Due dates
- Tags
- Attachments
- Revision history
- Advanced filtering
- Archive concepts
- Saved views

---

# 9. V3 — Automation & Intelligence

AI는 Capture의 필수 경로가 아니다.

기본 Capture는 AI 없이도 항상 동작해야 한다.

```mermaid
flowchart TD

    DATA[NoteRelay Data]

    DATA --> OCR[OCR]
    DATA --> CLASSIFY[AI Classification]
    DATA --> SEARCH[Semantic / AI Search]
    DATA --> SUMMARY[Summarization]

    OCR --> ASSIST[Assistant Layer]
    CLASSIFY --> ASSIST
    SEARCH --> ASSIST
    SUMMARY --> ASSIST

    ASSIST --> USER[User Decision]

    USER --> AUTOMATION[Optional Automation]
```

가능한 기능:

- OCR
- Automatic classification
- Suggested projects / tags
- Semantic search
- Summarization
- Related-item discovery
- Natural-language retrieval
- Optional automation

AI 원칙:

> AI는 정리와 검색을 보조한다.
> Capture 자체의 성공 여부는 AI에 의존하지 않는다.

---

# 10. Specialized Workflows

일반 Item 모델 위에 목적별 Queue를 추가할 수 있다.

```mermaid
flowchart LR

    ITEM[Items]

    ITEM --> PRINT[Print Queue]
    ITEM --> PURCHASE[Purchase Tracking]
    ITEM --> TASKS[Tasks]
    ITEM --> READ[Reading Queue]
    ITEM --> CUSTOM[Future Queues]
```

가능한 확장:

- Print Queue
- Purchase Tracking
- Reading Queue
- Waiting / Follow-up Queue
- Custom saved workflows

---

# 11. Development Process

모든 기능 개발은 아래 루프를 따른다.

```mermaid
flowchart LR

    INSPECT[Inspect] --> DEFINE[Define Scope]
    DEFINE --> IMPLEMENT[Implement]
    IMPLEMENT --> CHECK[Typecheck / Build]
    CHECK --> TEST[Test]

    TEST --> PASS{Pass?}

    PASS -- No --> IMPLEMENT

    PASS -- Yes --> COMMIT[Commit]
    COMMIT --> DEPLOY[Deploy]
    DEPLOY --> VERIFY[Production Verify]
    VERIFY --> DOCS[Update Docs]
    DOCS --> INSPECT
```

---

# 12. Feature Lifecycle

```mermaid
stateDiagram-v2

    [*] --> TODO

    TODO --> DOING
    DOING --> VERIFY

    VERIFY --> DOING: Failed
    VERIFY --> DONE: Passed

    TODO --> BLOCKED
    DOING --> BLOCKED

    BLOCKED --> TODO: Unblocked

    DONE --> [*]
```

상태 정의:

| Status | Meaning |
|---|---|
| `TODO` | 아직 시작하지 않음 |
| `DOING` | 구현 중 |
| `VERIFY` | 구현 완료, 검증 필요 |
| `DONE` | 구현 + 검증 완료 |
| `BLOCKED` | 외부 조건 또는 선행 작업 필요 |

---

# 13. Release Gates

```mermaid
flowchart TD

    FEATURE[Feature Complete]

    FEATURE --> TYPES[Typecheck]
    TYPES --> BUILD[Production Build]
    BUILD --> API[API Verification]
    API --> UI[UI Verification]
    UI --> RT[Realtime Verification]
    RT --> REG[Regression Check]

    REG --> READY{Ready?}

    READY -- No --> FIX[Fix]
    FIX --> TYPES

    READY -- Yes --> COMMIT[Commit / Merge]
    COMMIT --> DEPLOY[Production Deploy]
    DEPLOY --> SMOKE[Smoke Test]

    SMOKE --> RELEASE[Release Baseline]
```

---

# 14. Version Progress

```mermaid
timeline
    title NoteRelay Evolution

    V0 : Capture foundation
       : Telegram
       : Web Workspace
       : D1
       : Editing
       : Trash / Restore
       : Authentication
       : Realtime
       : Production deployment

    V1 : Daily-use workspace
       : Reliability hardening
       : Today
       : Projects
       : Search
       : Navigation / UX

    V2 : Structured knowledge
       : Tasks
       : Due dates
       : Tags
       : Attachments
       : Revisions

    V3 : Intelligence
       : OCR
       : AI classification
       : Semantic search
       : Summarization
       : Automation
```

---

# 15. Current Position

```mermaid
flowchart LR

    V0_START[V0 Start] --> CAPTURE[Capture]
    CAPTURE --> WORKSPACE[Workspace]
    WORKSPACE --> CRUD[Edit / Trash]
    CRUD --> SECURITY[Authentication]
    SECURITY --> REALTIME[Realtime]
    REALTIME --> CURRENT((CURRENT))
    CURRENT --> HARDEN[V0 Final Audit]
    HARDEN --> V1_START[V1 Development]
```

현재 위치:

**V0 기능 구현은 대부분 완료되었고,
V1 개발에 들어가기 전에 현재 baseline을 검증하고 정리하는 단계.**

---

# 16. Immediate Development Flow

```mermaid
flowchart TD

    CURRENT[Current main]

    CURRENT --> AUDIT[Architecture / Code Audit]

    AUDIT --> BUGS{Regression or technical debt?}

    BUGS -- Yes --> FIX[Fix V0 baseline]
    FIX --> VERIFY[Verify baseline]

    BUGS -- No --> VERIFY

    VERIFY --> SCOPE[Define concrete V1 scope]

    SCOPE --> BACKLOG[V1 Backlog]

    BACKLOG --> FEATURE[Implement smallest feature]

    FEATURE --> TEST[Test]
    TEST --> COMMIT[Commit]
    COMMIT --> DEPLOY[Deploy]
    DEPLOY --> NEXT[Next Feature]

    NEXT --> FEATURE
```

---

# 17. Guiding Principles

1. Capture must remain fast.
2. Original Capture data should be preserved.
3. D1 is the source of truth.
4. WebSocket is a synchronization signal, not the primary datastore.
5. Core Capture must not depend on AI.
6. Features should be implemented in small independently verifiable steps.
7. Production behavior must be verified after meaningful changes.
8. Documentation should evolve with the implementation.
9. Version boundaries may evolve based on actual usage.
10. Existing stable functionality should not be rewritten without a concrete reason.

---

# 18. Roadmap Status

```mermaid
flowchart LR

    V0[V0<br/>Capture Foundation]
    V1[V1<br/>Personal Workspace]
    V2[V2<br/>Structured Knowledge]
    V3[V3<br/>Automation & Intelligence]

    V0 -->|Current| V1
    V1 --> V2
    V2 --> V3

    classDef current fill:#fff3cd,stroke:#856404,color:#111;
    class V1 current;
```

현재 개발 방향:

**V0 baseline 검증 → V1 scope 확정 → V1 기능 개발 → V1 release**

이후 실제 사용 경험을 바탕으로 V2/V3의 범위를 재조정한다.
