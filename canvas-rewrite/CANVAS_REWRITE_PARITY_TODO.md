You are working in the canvas rewrite project.  
Your source backlog is CANVAS_REWRITE_PARITY_TODO.md.

Execution rules:
1. Work strictly one feature at a time, in the exact order from the checklist.
2. For each feature, do full implementation, wiring, and validation before moving to the next.
3. Use the existing D3 implementation but do a complete rewrite as already started.
4. After each feature is complete, mark its checkbox as done in CANVAS_REWRITE_PARITY_TODO.md.
5. After each feature, perform compaction before starting the next feature to not bloat the context window.
6. Do not skip validation. Run relevant build after each feature and fix regressions immediately.
7. Do a commit after each feature with a short but clear commit message. DO NOT PUSH!
8. Continue until all checklist items are done.


# Canvas Rewrite Parity Backlog

Use this list to drive implementation work in small, sequential commit steps.

- [x] Implement deadline marker rendering in canvas, including STD/ETD lines, colors, and correct layer ordering.
- [x] Implement vertical markers in canvas, including rendering, drag interaction, and marker callbacks.
- [x] Implement marked region highlighting in canvas, including destination-focused region scroll behavior.
- [x] Implement suggestion UI in canvas, including suggestion affordance/button and apply-suggestion interaction.
- [x] Implement slot hover tooltip rendering in canvas so hoverData is shown as a visual tooltip.
- [x] Implement current-time indicator line rendering in canvas.
- [x] Implement weekday/background overlay layer rendering in canvas.
- [x] Implement topic collapse and expand interaction from the left label area in canvas.
- [ ] Implement missing keyboard shortcut parity in canvas, including Escape-to-clear-clipboard.
- [ ] Implement missing pan parity in canvas, including middle-mouse drag pan.
