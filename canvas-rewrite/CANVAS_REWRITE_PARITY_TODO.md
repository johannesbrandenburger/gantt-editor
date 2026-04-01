You are working in the canvas rewrite project.  
Your source backlog is CANVAS_REWRITE_PARITY_TODO.md.
 
Execution rules:
1. Work strictly one feature at a time, in the exact order from the checklist.
2. For each feature, do full implementation, wiring, and validation before moving to the next.
3. Use the existing D3 implementation as reference but do a complete rewrite as already started.
4. After each feature is complete, mark its checkbox as done in CANVAS_REWRITE_PARITY_TODO.md.
5. After each feature, perform compaction before starting the next feature to not bloat the context window.
6. Do not skip validation. Run relevant build after each feature and fix regressions immediately.
7. Do a commit after each feature with a short but clear commit message. DO NOT PUSH!
8. Do not stop (do not send the completion signal) until all items are implemented and ticked. 

# Canvas Rewrite Parity Backlog

- [x] Colored departure lines
- [x] Hover is only available on the slot and not also on the area between the slot and the last deadline/departure marker
- [ ] Hover menu for suggestions
- [ ] Clickable Flight-Numbers on the left (at the destination)
- [ ] Paste field for slots in the clipboard (preview slots)