# Fortress

Fortress는 Ollama 로컬 LLM을 기반으로 문서 작성, 비즈니스 로직 구현, 시각화를 지원하는 로컬 AI 에이전트 데스크탑 워크스테이션입니다.

## 🛠 개발 환경 요구사항

- **Node.js**: v20.x 이상 (v22.x 권장)
- **pnpm**: 9.x / 10.x 이상
- **Rust**: 1.77.2 이상 (stable toolchain)
- **Ollama**: 최신 버전 (기본 로컬 주소: `http://127.0.0.1:11434`)
  - 권장 모델: `qwen2.5-coder:7b`, `llama3.1:8b` 등

## 🚀 빠른 시작

```bash
# 의존성 설치
pnpm install

# 웹 개발 서버 실행 (프런트엔드 단독)
pnpm dev

# Tauri 데스크탑 앱 개발 모드 실행
pnpm tauri dev

# 코드 검증
pnpm lint
pnpm typecheck
pnpm test
```

## 📖 문서 및 가이드

- [사용자 가이드 (User Guide)](./Docs/UserGuide.md)
- [품질 검증 체크리스트 (QA Checklist)](./Docs/QA-Checklist.md)
- [아키텍처 설계서 (Architecture)](./Docs/Architecture.md)
- [단계별 구현 계획서 (Implementation Plan)](./Docs/ImplementationPlan.md)
- [진행상황 트래커 (TODO)](./Docs/TODO.md)
- [에이전트 작업 지침 (AGENTS)](./AGENTS.md)
