import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import StatusBar from "../src/components/StatusBar";
import type { TranslateFn } from "../src/types/translations";

const t: TranslateFn = (key, variables) => {
  if (key === "savedAt") {
    return `Saved at ${variables?.time}`;
  }
  if (key === "stalePrompt") {
    return "Data is stale, refresh?";
  }
  if (key === "refresh") {
    return "Refresh";
  }
  if (key === "unsavedChanges") {
    return "You have unsaved changes.";
  }
  if (key === "hardcodedTextStatus") {
    return `Hardcoded text: ${variables?.count ?? 0}`;
  }
  if (key === "hardcodedTextLocations") {
    return "Hardcoded locations";
  }
  if (key === "hardcodedTextShowLocations") {
    return "Show";
  }
  if (key === "hardcodedTextHideLocations") {
    return "Hide";
  }
  if (key === "hardcodedTextNoLocations") {
    return "No hardcoded text locations available.";
  }

  return String(key);
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("StatusBar", () => {
  it("prioritizes errors over stale and saved states", () => {
    const refresh = vi.fn();
    render(
      <StatusBar
        t={t}
        loadingError="Failed to load translations"
        saveError="Failed to save translations"
        staleData={true}
        hasUnsavedChanges={true}
        lastSavedAt={new Date("2026-01-01T10:00:00Z")}
        onRefresh={refresh}
      />,
    );

    expect(screen.getByText("Failed to load translations")).toBeTruthy();
    expect(screen.queryByText("Data is stale, refresh?")).toBeNull();
  });

  it("shows stale prompt with refresh action when stale and no error", () => {
    const refresh = vi.fn();
    render(
      <StatusBar
        t={t}
        loadingError={null}
        saveError={null}
        staleData={true}
        hasUnsavedChanges={false}
        lastSavedAt={null}
        onRefresh={refresh}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Data is stale, refresh?")).toBeTruthy();
  });

  it("shows saved state when there is no error or stale warning", () => {
    render(
      <StatusBar
        t={t}
        loadingError={null}
        saveError={null}
        staleData={false}
        hasUnsavedChanges={false}
        lastSavedAt={new Date("2026-01-01T10:00:00Z")}
        onRefresh={() => undefined}
      />,
    );

    expect(screen.getAllByText(/Saved at/).length).toBeGreaterThan(0);
  });

  it("shows hardcoded locations when count is available", () => {
    render(
      <StatusBar
        t={t}
        loadingError={null}
        saveError={null}
        hardcodedTextCount={2}
        hardcodedTextIssues={[
          {
            file: "src/App.tsx",
            line: 10,
            kind: "jsx_text",
            text: "test",
          },
        ]}
        staleData={false}
        hasUnsavedChanges={false}
        lastSavedAt={null}
        onRefresh={() => undefined}
      />,
    );

    expect(screen.getByText("Hardcoded text: 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Hardcoded text: 2/ }));
    expect(screen.getByText("Hardcoded locations")).toBeTruthy();
    expect(screen.getByText("test")).toBeTruthy();
  });
});
