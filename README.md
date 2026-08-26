# NoteRelay

Telegram + Web 기반 개인 노트 시스템.

Telegram은 빠른 Capture UI이고,
웹 앱은 실제 관리 Workspace다.

## Architecture

```text
Telegram ─┐
          ├──> Cloudflare Worker ───> D1
Web ──────┘              ↑
                         │
                    AI Assistant
                    (optional)
q

clear
/
cat > web/vite.config.ts <<'EOF'
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/tg-note-agent-web/"
});
