import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";

type TranslationPayload = Record<string, Record<string, unknown>>;
type UsagePayload = Record<string, { count: number; files: string[] }>;
type KeyUsagePayload = {
  pages: Array<{ id: string; file: string; keys: string[] }>;
  files: Array<{ id: string; file: string; keys: string[] }>;
};

const initialTranslations: TranslationPayload = {
  en: {
    auth: {
      login: { title: "Welcome" },
      logout: { title: "Bye" },
    },
  },
  nl: {
    auth: {
      login: { title: "Welkom" },
      logout: { title: "" },
    },
  },
};

const defaultUsage: UsagePayload = {
  "auth.login.title": { count: 2, files: ["src/pages/LoginPage.tsx"] },
  "auth.logout.title": { count: 1, files: ["src/pages/LoginPage.tsx"] },
};

const defaultKeyUsage: KeyUsagePayload = {
  pages: [],
  files: [
    {
      id: "src/pages/LoginPage.tsx",
      file: "src/pages/LoginPage.tsx",
      keys: ["auth.login.title", "auth.logout.title"],
    },
  ],
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const openAdvancedToolbar = () => {
  fireEvent.click(screen.getByRole("button", { name: /Filter & sort/ }));
};

const asPathname = (input: RequestInfo | URL): string => {
  if (typeof input === "string") {
    if (input.startsWith("http://") || input.startsWith("https://")) {
      return new URL(input).pathname;
    }
    return input;
  }

  if (input instanceof URL) {
    return input.pathname;
  }

  return new URL(input.url).pathname;
};

function createFetchMock(
  seed: TranslationPayload,
  options?: {
    usage?: UsagePayload;
    keyUsage?: KeyUsagePayload;
    renameStatus?: number;
  },
) {
  let current = clone(seed);
  const posts: TranslationPayload[] = [];
  const renameRequests: Array<{ oldKey: string; newKey: string }> = [];
  const usage = clone(options?.usage ?? defaultUsage);
  const keyUsage = clone(options?.keyUsage ?? defaultKeyUsage);
  const renameStatus = options?.renameStatus ?? 200;

  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const method = init?.method ?? "GET";
      const path = asPathname(input);

      if (method === "GET") {
        if (path === "/api/translations") {
          return new Response(JSON.stringify(current), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (path === "/api/usage") {
          return new Response(JSON.stringify(usage), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (path === "/api/key-usage") {
          return new Response(JSON.stringify(keyUsage), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response("not found", { status: 404 });
      }

      if (method === "POST") {
        if (path === "/api/translations") {
          const body = JSON.parse(String(init?.body ?? "{}")) as TranslationPayload;
          posts.push(body);
          current = clone(body);

          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (path === "/api/rename-key") {
          const body = JSON.parse(String(init?.body ?? "{}")) as {
            oldKey: string;
            newKey: string;
          };
          renameRequests.push(body);

          if (renameStatus !== 200) {
            return new Response(JSON.stringify({ ok: false }), {
              status: renameStatus,
              headers: { "Content-Type": "application/json" },
            });
          }

          const existingUsage = usage[body.oldKey];
          if (existingUsage) {
            usage[body.newKey] = existingUsage;
            delete usage[body.oldKey];
          }

          for (const page of keyUsage.pages) {
            page.keys = page.keys.map((key) => (key === body.oldKey ? body.newKey : key));
          }
          for (const file of keyUsage.files) {
            file.keys = file.keys.map((key) => (key === body.oldKey ? body.newKey : key));
          }

          return new Response(
            JSON.stringify({ ok: true, changedFiles: ["src/pages/LoginPage.tsx"] }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        return new Response("unsupported", { status: 500 });
      }

      return new Response("unsupported", { status: 500 });
    },
  );

  return { fetchMock, posts, renameRequests };
}

beforeEach(() => {
  window.localStorage.setItem("gloss-ui-language", "en");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("Gloss App", () => {
  it("adds a new key across all locales", async () => {
    const { fetchMock } = createFetchMock(initialTranslations);
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await screen.findByText("auth.login.title");

    fireEvent.change(screen.getByLabelText("New key (dot notation)"), {
      target: { value: "home.hero.title" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add key" }));

    expect(screen.getByText("home.hero.title")).toBeTruthy();
    expect(screen.getByLabelText("en:home.hero.title")).toBeTruthy();
    expect(screen.getByLabelText("nl:home.hero.title")).toBeTruthy();
  });

  it("filters keys by key text", async () => {
    const { fetchMock } = createFetchMock(initialTranslations);
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await screen.findByText("auth.login.title");

    fireEvent.change(screen.getByLabelText("Filter keys"), {
      target: { value: "logout" },
    });

    expect(screen.queryByText("auth.login.title")).toBeNull();
    expect(screen.getByText("auth.logout.title")).toBeTruthy();
  });

  it("shows only missing rows when toggled", async () => {
    const { fetchMock } = createFetchMock(initialTranslations);
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await screen.findByText("auth.login.title");

    fireEvent.click(screen.getByLabelText("Show only missing"));

    expect(screen.queryByText("auth.login.title")).toBeNull();
    expect(screen.getByText("auth.logout.title")).toBeTruthy();
  });

  it("groups rows by namespace and supports collapsing group rows", async () => {
    const { fetchMock } = createFetchMock(initialTranslations);
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await screen.findByText("auth.login.title");

    openAdvancedToolbar();
    fireEvent.click(screen.getByRole("button", { name: "Group by namespace" }));

    const namespaceButton = screen
      .getAllByRole("button")
      .find(
        (button) =>
          button.className.includes("namespace-group-toggle") &&
          button.textContent?.includes("auth"),
      );
    expect(namespaceButton).toBeTruthy();
    fireEvent.click(namespaceButton!);

    await waitFor(() => {
      expect(screen.queryByLabelText("en:auth.login.title")).toBeNull();
      expect(screen.queryByLabelText("en:auth.logout.title")).toBeNull();
    });

    const expandedNamespaceButton = screen
      .getAllByRole("button")
      .find(
        (button) =>
          button.className.includes("namespace-group-toggle") &&
          button.textContent?.includes("auth"),
      );
    expect(expandedNamespaceButton).toBeTruthy();
    fireEvent.click(expandedNamespaceButton!);

    await waitFor(() => {
      expect(screen.getByLabelText("en:auth.login.title")).toBeTruthy();
      expect(screen.getByLabelText("en:auth.logout.title")).toBeTruthy();
    });
  });

  it("supports keyboard shortcuts for search and missing filter token", async () => {
    const { fetchMock } = createFetchMock(initialTranslations);
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await screen.findByText("auth.login.title");

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const filterInput = screen.getByLabelText("Filter keys") as HTMLInputElement;
    expect(document.activeElement).toBe(filterInput);

    fireEvent.keyDown(window, { key: "M", ctrlKey: true, shiftKey: true });
    await waitFor(() => {
      expect(filterInput.value).toContain("missing:true");
    });

    expect(screen.queryByText("auth.login.title")).toBeNull();
    expect(screen.getByText("auth.logout.title")).toBeTruthy();
  });

  it("supports keyboard shortcut to open issues view", async () => {
    const { fetchMock } = createFetchMock(initialTranslations);
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await screen.findByText("auth.login.title");

    fireEvent.keyDown(window, { key: "I", ctrlKey: true, shiftKey: true });

    expect(await screen.findByText("What to fix first")).toBeTruthy();
  });

  it("supports keyboard shortcut to focus quick add input", async () => {
    const { fetchMock } = createFetchMock(initialTranslations);
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await screen.findByText("auth.login.title");

    fireEvent.keyDown(window, { key: "N", ctrlKey: true, shiftKey: true });

    const addInput = screen.getByLabelText("New key (dot notation)") as HTMLInputElement;
    await waitFor(() => {
      expect(document.activeElement).toBe(addInput);
    });
  });

  it("posts nested payload on save", async () => {
    const { fetchMock, posts } = createFetchMock(initialTranslations);
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await screen.findByText("auth.logout.title");

    fireEvent.change(screen.getByLabelText("nl:auth.logout.title"), {
      target: { value: "Tot ziens" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const saveDialog = screen.queryByRole("dialog");
    if (saveDialog) {
      fireEvent.click(within(saveDialog).getByRole("button", { name: "Save" }));
    }

    await waitFor(() => {
      expect(posts.length).toBe(1);
    });

    expect(posts[0]).toEqual({
      en: {
        auth: {
          login: { title: "Welcome" },
          logout: { title: "Bye" },
        },
      },
      nl: {
        auth: {
          login: { title: "Welkom" },
          logout: { title: "Tot ziens" },
        },
      },
    });
  });

  it("renames a key and calls backend refactor endpoint", async () => {
    const { fetchMock, renameRequests } = createFetchMock(initialTranslations);
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await screen.findByText("auth.login.title");

    const row = screen.getByText("auth.login.title").closest("tr");
    expect(row).toBeTruthy();
    fireEvent.click(within(row!).getByRole("button", { name: "Rename" }));

    fireEvent.change(screen.getByLabelText("Rename auth.login.title"), {
      target: { value: "auth.login.heading" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    const renameDialog = await screen.findByRole("dialog");
    fireEvent.click(within(renameDialog).getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      expect(screen.getByLabelText("en:auth.login.heading")).toBeTruthy();
    });
    expect(screen.queryByLabelText("en:auth.login.title")).toBeNull();
    expect(renameRequests).toEqual([
      { oldKey: "auth.login.title", newKey: "auth.login.heading" },
    ]);
  });

  it("shows inline error when rename refactor endpoint fails", async () => {
    const { fetchMock } = createFetchMock(initialTranslations, { renameStatus: 500 });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await screen.findByText("auth.login.title");

    const row = screen.getByText("auth.login.title").closest("tr");
    expect(row).toBeTruthy();
    fireEvent.click(within(row!).getByRole("button", { name: "Rename" }));

    fireEvent.change(screen.getByLabelText("Rename auth.login.title"), {
      target: { value: "auth.login.heading" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    const renameDialog = await screen.findByRole("dialog");
    fireEvent.click(within(renameDialog).getByRole("button", { name: "Apply" }));

    await screen.findByText("Failed to update key usage in source files (500)");
    expect(screen.getByText("auth.login.title")).toBeTruthy();
  });

  it("filters table rows based on selected file usage", async () => {
    const keyUsage: KeyUsagePayload = {
      pages: [],
      files: [
        {
          id: "src/pages/AdminPage.tsx",
          file: "src/pages/AdminPage.tsx",
          keys: ["auth.login.title", "auth.login.test2"],
        },
        {
          id: "src/pages/DashboardPage.tsx",
          file: "src/pages/DashboardPage.tsx",
          keys: ["auth.logout.title"],
        },
      ],
    };
    const usage: UsagePayload = {
      "auth.login.title": { count: 2, files: ["src/pages/AdminPage.tsx"] },
      "auth.logout.title": { count: 1, files: ["src/pages/DashboardPage.tsx"] },
      "auth.login.test2": { count: 1, files: ["src/pages/AdminPage.tsx"] },
    };

    const { fetchMock } = createFetchMock(initialTranslations, { usage, keyUsage });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await screen.findByText("auth.login.title");
    await screen.findByText("auth.login.test2");

    openAdvancedToolbar();
    fireEvent.click(screen.getByRole("button", { name: "Explorers" }));

    const fileButtonLabel = screen.getByText("AdminPage.tsx");
    fireEvent.click(fileButtonLabel.closest("button")!);

    await waitFor(() => {
      expect(screen.getByText("auth.login.title")).toBeTruthy();
      expect(screen.getByText("auth.login.test2")).toBeTruthy();
    });
    expect(screen.queryByText("auth.logout.title")).toBeNull();
  });

  it("opens usage details in the analysis drawer", async () => {
    const { fetchMock } = createFetchMock(initialTranslations);
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await screen.findByText("auth.login.title");

    const usageToggle = screen.getByRole("button", { name: "2" });
    fireEvent.click(usageToggle);

    const drawerTitle = await screen.findByText("Usage Details");
    const drawer = drawerTitle.closest("aside");
    expect(drawer).toBeTruthy();
    expect(within(drawer!).getByText("auth.login.title")).toBeTruthy();
    expect(within(drawer!).getByText("Files (1)")).toBeTruthy();
    expect(within(drawer!).getByText("src/pages/LoginPage.tsx")).toBeTruthy();
  });

  it("opens issue from inbox and focuses the related key", async () => {
    const { fetchMock } = createFetchMock(initialTranslations);
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await screen.findByText("auth.login.title");

    fireEvent.click(screen.getByRole("button", { name: "Issues Inbox" }));

    fireEvent.click(screen.getByRole("button", { name: "auth.logout.title" }));

    await waitFor(() => {
      expect(screen.getByLabelText("en:auth.logout.title")).toBeTruthy();
    });
    expect(
      (screen.getByLabelText("Filter keys") as HTMLInputElement).value,
    ).toBe("auth.logout.title");
  });

  it("shows a success toast after deleting a key", async () => {
    const { fetchMock } = createFetchMock(initialTranslations);
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await screen.findByText("auth.login.title");

    const row = screen.getByText("auth.login.title").closest("tr");
    expect(row).toBeTruthy();
    fireEvent.click(within(row!).getByRole("button", { name: "Delete" }));

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await screen.findByText('Deleted key "auth.login.title".');
  });

  it("fills missing issue values from default locale", async () => {
    const { fetchMock } = createFetchMock(initialTranslations);
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await screen.findByText("auth.logout.title");

    fireEvent.click(screen.getByRole("button", { name: "Issues Inbox" }));
    fireEvent.click(screen.getByRole("button", { name: "Fill missing" }));
    fireEvent.click(screen.getByRole("button", { name: "Translations" }));

    await waitFor(() => {
      const input = screen.getByLabelText(
        "nl:auth.logout.title",
      ) as HTMLTextAreaElement;
      expect(input.value).toBe("Bye");
    });
  });

  it("normalizes placeholder mismatch values from issues inbox", async () => {
    const translations: TranslationPayload = {
      en: {
        profile: { greeting: "Hello {name}" },
      },
      nl: {
        profile: { greeting: "Hallo {naam}" },
      },
    };
    const usage: UsagePayload = {
      "profile.greeting": { count: 1, files: ["src/pages/ProfilePage.tsx"] },
    };
    const { fetchMock } = createFetchMock(translations, { usage });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await screen.findByText("profile.greeting");

    fireEvent.click(screen.getByRole("button", { name: "Issues Inbox" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Normalize placeholders" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Translations" }));

    await waitFor(() => {
      const input = screen.getByLabelText(
        "nl:profile.greeting",
      ) as HTMLTextAreaElement;
      expect(input.value).toBe("Hallo {name}");
    });
  });

  it("supports deprecating unused key from issues inbox", async () => {
    const usage: UsagePayload = {
      "auth.login.title": { count: 2, files: ["src/pages/LoginPage.tsx"] },
      "auth.logout.title": { count: 0, files: [] },
    };
    const { fetchMock } = createFetchMock(initialTranslations, { usage });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await screen.findByText("auth.logout.title");

    fireEvent.click(screen.getByRole("button", { name: "Issues Inbox" }));
    const unusedMeta = screen.getByText("No source usage found");
    const unusedRow = unusedMeta.closest("li");
    expect(unusedRow).toBeTruthy();
    fireEvent.click(within(unusedRow!).getByRole("button", { name: "Deprecate" }));

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Deprecate" }));
    fireEvent.click(screen.getByRole("button", { name: "Translations" }));

    await waitFor(() => {
      const input = screen.getByLabelText(
        "en:auth.logout.title",
      ) as HTMLTextAreaElement;
      expect(input.value).toContain("[DEPRECATED]");
    });
  });

  it("supports bulk fill all missing from issues inbox", async () => {
    const translations: TranslationPayload = {
      en: {
        auth: {
          login: { title: "Welcome" },
          logout: { title: "Bye" },
        },
      },
      nl: {
        auth: {
          login: { title: "" },
          logout: { title: "" },
        },
      },
    };
    const usage: UsagePayload = {
      "auth.login.title": { count: 1, files: ["src/pages/LoginPage.tsx"] },
      "auth.logout.title": { count: 1, files: ["src/pages/LoginPage.tsx"] },
    };
    const { fetchMock } = createFetchMock(translations, { usage });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await screen.findByText("auth.login.title");

    fireEvent.click(screen.getByRole("button", { name: "Issues Inbox" }));
    fireEvent.click(screen.getByRole("button", { name: "Fill all missing" }));
    fireEvent.click(screen.getByRole("button", { name: "Translations" }));

    await waitFor(() => {
      expect(
        (screen.getByLabelText("nl:auth.login.title") as HTMLTextAreaElement).value,
      ).toBe("Welcome");
      expect(
        (screen.getByLabelText("nl:auth.logout.title") as HTMLTextAreaElement).value,
      ).toBe("Bye");
    });
  });

  it("supports bulk deprecate all unused from issues inbox", async () => {
    const usage: UsagePayload = {
      "auth.login.title": { count: 0, files: [] },
      "auth.logout.title": { count: 0, files: [] },
    };
    const { fetchMock } = createFetchMock(initialTranslations, { usage });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await screen.findByText("auth.logout.title");

    fireEvent.click(screen.getByRole("button", { name: "Issues Inbox" }));
    fireEvent.click(screen.getByRole("button", { name: "Deprecate all unused" }));

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Deprecate all unused" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Translations" }));

    await waitFor(() => {
      expect(
        (screen.getByLabelText("en:auth.login.title") as HTMLTextAreaElement).value,
      ).toContain("[DEPRECATED]");
      expect(
        (screen.getByLabelText("en:auth.logout.title") as HTMLTextAreaElement).value,
      ).toContain("[DEPRECATED]");
    });
  });
});
