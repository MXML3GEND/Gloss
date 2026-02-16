import { useCallback, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

type ActiveCell = { row: number; col: number } | null;

type UseKeyboardNavigationParams = {
  visibleKeys: string[];
  locales: string[];
};

export function useKeyboardNavigation({
  visibleKeys,
  locales,
}: UseKeyboardNavigationParams) {
  const [activeCell, setActiveCell] = useState<ActiveCell>(null);
  const cellRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  const registerCellRef = useCallback(
    (key: string, locale: string, element: HTMLTextAreaElement | null) => {
      cellRefs.current[`${key}::${locale}`] = element;
    },
    [],
  );

  const focusCell = useCallback(
    (row: number, col: number) => {
      const key = visibleKeys[row];
      const locale = locales[col];

      if (!key || !locale) {
        return;
      }

      setActiveCell({ row, col });

      const refKey = `${key}::${locale}`;
      const tryFocus = (attempt = 0) => {
        const element = cellRefs.current[refKey];
        if (element) {
          element.focus();
          return;
        }

        if (attempt < 6) {
          requestAnimationFrame(() => tryFocus(attempt + 1));
        }
      };

      tryFocus();
    },
    [locales, visibleKeys],
  );

  const handleCellKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>, row: number, col: number) => {
      if (visibleKeys.length === 0 || locales.length === 0) {
        return;
      }

      if (
        event.key === "Enter" &&
        !event.shiftKey &&
        !event.altKey &&
        !event.metaKey &&
        !event.ctrlKey
      ) {
        event.preventDefault();
        const nextRow = (row + 1) % visibleKeys.length;
        focusCell(nextRow, col);
        return;
      }

      if (event.key === "Tab") {
        event.preventDefault();
        const totalCells = visibleKeys.length * locales.length;
        const currentIndex = row * locales.length + col;
        const nextIndex =
          (currentIndex + (event.shiftKey ? -1 : 1) + totalCells) % totalCells;
        const nextRow = Math.floor(nextIndex / locales.length);
        const nextCol = nextIndex % locales.length;
        focusCell(nextRow, nextCol);
      }
    },
    [focusCell, visibleKeys, locales],
  );

  return {
    activeCell,
    setActiveCell,
    cellRefs,
    registerCellRef,
    focusCell,
    handleCellKeyDown,
  };
}
