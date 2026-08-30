# NoteRelay Audit — Interim Snapshot

이 ZIP은 최종본이 아니라, 전체 전수조사/수정 작업 중간 스냅샷입니다.

현재 반영된 주요 수정:
- 카드 액션 메뉴 공통화, 한글 라벨, iPad/touch 44px hit-area, 메뉴 stacking/viewport 보정
- 핵심 액션 inline / 나머지 더보기, 삭제는 더보기 최하단
- Undo 실행 취소 버튼 가시성 보강
- Project 목록/할당 후보/중복/한국어 UX 재정리 및 카드에서 project_id 지정 지원
- Purchase 편집 통합(상품명 + 국내/해외 + URL), Purchase due UI 제거
- 3D 모델링/궁금증을 Notes형 UI로 통일, Reference 내부 용어 제거 방향 반영
- reference subtype count 연결
- Print Queue 숫자 포맷, 색상 chip, 모델 링크, drag 피드백, 숫자 입력 검증 보강
- 휴지통 비우기 API/UI 및 realtime 이벤트 추가
- Today 주간 캘린더 추가
- 목록 LIMIT 100 제거 방향 반영
- 브랜드 glyph congenital 반영

검증 상태:
- 전체 TS/TSX syntax transpile: 통과
- App.css brace balance: 통과
- 실제 npm ci / Vite build / Wrangler typecheck / lint: 이 환경에서는 아직 최종 재검증 전

이 스냅샷은 테스트 브랜치/로컬 확인용으로만 사용하세요. main 병합/배포용 최종본은 아닙니다.
