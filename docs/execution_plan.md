# plARes: Development Execution Plan (Task Breakdown)

[日本語版 (JP)](jp/execution_plan.md)

Last Updated: 2026-03-01
Period: 2026-03-02 - 2026-04-10 (6 Weeks)

---

## 1. Objectives

Transition from "Demo Quality" to "Sustainable Development Quality."

- **Focus 1**: Refine core experience (WebXR/FSM/Low-latency sync).
- **Focus 2**: Replace mocks with production implementations (Generative AI/Pipelines).
- **Focus 3**: Establish development workflows (`PROGRESS_SYNC.md`, testing, CI).

---

## 2. Phase Roadmap (Summary)

### Phase 0: Development Infrastructure (W1)

- Fix backend `ImportError` in tests.
- Expand CI to include Python quality gates.
- Initialize `PROGRESS_SYNC.md`.

### Phase 1: Frontend Experience (W1-W2)

- Wire Depth Occlusion props.
- Implement FSM debug panel.
- Enhance AR plane detection guidance.

### Phase 2: AI Core Stabilization (W3)

- Unified Live connection path.
- Voice judging logic tuning.
- Character generation API failure handling.

### Phase 3: Infrastructure Production (W4-W5)

- Replace `multimodal_pipeline.py` mocks with real Imagen/Veo calls.
- Verify MCP tool execution for Firestore.
- Add Context Cache hit rate monitoring.

### Phase 4: Integration & Release (W6)

- Expand E2E scenarios.
- Performance & Cost benchmarking.
- Final release checklist.

---

## 3. High-Priority Backlog (Next 10 Days)

1.  **P0**: `PROGRESS_SYNC.md` setup.
2.  **P0**: Fix test `ImportError`.
3.  **P1**: Depth Occlusion wiring.
4.  **P2**: Live path unification.

---

> Refer to [Master Design](master_design.md) for the high-level vision.
