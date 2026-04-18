'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * Spatial navigation for Fire TV / D-pad remotes.
 *
 * All focusable elements must have `data-focusable="true"` and optionally
 * `data-focus-group="<name>"` to restrict navigation within a group.
 *
 * Keys: ArrowUp/Down/Left/Right = navigate, Enter = select, Backspace/Escape = back
 */

const FOCUSABLE_SELECTOR = '[data-focusable="true"]';

interface Rect { x: number; y: number; w: number; h: number; cx: number; cy: number }

function getRect(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
}

function getAllFocusable(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null && !el.hasAttribute('disabled')
  );
}

function findBestCandidate(
  current: Rect,
  candidates: HTMLElement[],
  direction: 'up' | 'down' | 'left' | 'right'
): HTMLElement | null {
  let best: HTMLElement | null = null;
  let bestScore = Infinity;

  for (const el of candidates) {
    const r = getRect(el);

    // Filter by direction
    const isValid =
      direction === 'up'    ? r.cy < current.cy - 2 :
      direction === 'down'  ? r.cy > current.cy + 2 :
      direction === 'left'  ? r.cx < current.cx - 2 :
      direction === 'right' ? r.cx > current.cx + 2 :
      false;

    if (!isValid) continue;

    // Score: prefer elements along the movement axis with minimal perpendicular offset
    const axial =
      direction === 'up' || direction === 'down'
        ? Math.abs(r.cy - current.cy)
        : Math.abs(r.cx - current.cx);

    const perpendicular =
      direction === 'up' || direction === 'down'
        ? Math.abs(r.cx - current.cx)
        : Math.abs(r.cy - current.cy);

    const score = axial + perpendicular * 3; // Penalize off-axis more

    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }

  return best;
}

export interface SpatialNavOptions {
  onBack?: () => void;
  onSelect?: (el: HTMLElement) => void;
  active?: boolean;
}

export function useSpatialNav({ onBack, onSelect, active = true }: SpatialNavOptions = {}) {
  const lastFocusedId = useRef<string | null>(null);

  const focusElement = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    el.focus({ preventScroll: false });
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    if (el.id) lastFocusedId.current = el.id;
  }, []);

  const focusFirst = useCallback(() => {
    const items = getAllFocusable();
    if (items.length > 0) focusElement(items[0]);
  }, [focusElement]);

  useEffect(() => {
    if (!active) return;

    function handleKeyDown(e: KeyboardEvent) {
      const key = e.key;
      const currentEl = document.activeElement as HTMLElement | null;

      // Back
      if (key === 'Backspace' || key === 'Escape' || key === 'XF86Back') {
        e.preventDefault();
        onBack?.();
        return;
      }

      // Enter / Select
      if (key === 'Enter' || key === ' ') {
        e.preventDefault();
        if (currentEl) {
          onSelect?.(currentEl);
          currentEl.click();
        }
        return;
      }

      // Arrow navigation
      const dir =
        key === 'ArrowUp'    ? 'up' :
        key === 'ArrowDown'  ? 'down' :
        key === 'ArrowLeft'  ? 'left' :
        key === 'ArrowRight' ? 'right' :
        null;

      if (!dir) return;
      e.preventDefault();

      if (!currentEl || !currentEl.matches(FOCUSABLE_SELECTOR)) {
        focusFirst();
        return;
      }

      const candidates = getAllFocusable().filter((el) => el !== currentEl);
      const next = findBestCandidate(getRect(currentEl), candidates, dir);
      if (next) focusElement(next);
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [active, onBack, onSelect, focusElement, focusFirst]);

  return { focusFirst, focusElement };
}
