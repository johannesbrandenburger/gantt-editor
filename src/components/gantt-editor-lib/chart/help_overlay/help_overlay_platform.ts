/**
 * Detect Apple platforms where multi-select uses Meta (⌘) rather than Ctrl.
 * Matches {@link MouseEvent.metaKey} vs {@link MouseEvent.ctrlKey} usage on primary click.
 */
export function helpOverlayIsApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const platform = navigator.platform ?? "";
  const ua = navigator.userAgent ?? "";
  return (
    /Mac|iPhone|iPad|iPod/i.test(platform) ||
    /Mac OS|iPhone|iPad|iPod/i.test(ua)
  );
}

/** Short label for help overlay badges and preview animations (⌘ vs Ctrl). */
export function helpOverlayPrimaryModifierShortLabel(): string {
  return helpOverlayIsApplePlatform() ? "⌘" : "Ctrl";
}
