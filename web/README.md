# NoteRelay Web

NoteRelay의 **React + TypeScript + Vite** 웹 클라이언트입니다. 이 패키지는 저장소 루트의 npm workspaces 중 `web/`이며, 독립된 별도 서비스가 아니라 [NoteRelay](../README.md)의 화면 구성 요소입니다.

## 역할

- Web Quick Capture와 Inbox, Todo, Today, Notes, Projects, Purchase, Print Queue, Archive, Trash 화면
- Cloudflare Worker REST API를 통한 항목 조회·수정
- TanStack Query 캐시와 WebSocket 변경 알림을 연동한 최신화
- 모바일 drawer 및 데스크톱 sidebar를 사용하는 반응형 인터페이스

서버·DB·인증 및 데이터 변경 규칙은 [루트 README](../README.md)와 [API 문서](../docs/API.md)를 우선 참고하세요.

## 개발 명령어

저장소 루트에서:

```bash
npm install
npm run dev:web
npm run build:web
npm run lint --workspace web
```

웹 패키지에서 직접:

```bash
npm run dev
npm run build
npm run lint
```

Worker는 별도 프로세스로 `npm run dev:worker`를 실행합니다. 운영 환경은 GitHub Pages Web 및 Cloudflare Workers API로 분리되어 있습니다. 운영 secrets·토큰을 소스에 기록하지 마세요.

## 코드 위치

- `src/App.tsx`: 상위 UI
- `src/views/`: Workspace 화면
- `src/api/`: Worker API 클라이언트
- `src/realtime.ts`: 변경 알림 처리
- `../shared/src/`: Worker와 공유하는 데이터 모델

> 이 파일은 Vite 기본 템플릿 문서를 대체합니다. 과거 템플릿의 React Compiler나 Oxlint 샘플 설명은 NoteRelay 구현 기능이 아닙니다.
