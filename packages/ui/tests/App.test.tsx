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

  it("posts nested payload on save", async () => {
    const { fetchMock, posts } = createFetchMock(initialTranslations);
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await screen.findByText("auth.logout.title");

    fireEvent.change(screen.getByLabelText("nl:auth.logout.title"), {
      target: { value: "Tot ziens" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

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

    const fileButtonLabel = screen.getByText("AdminPage.tsx");
    fireEvent.click(fileButtonLabel.closest("button")!);

    await waitFor(() => {
      expect(screen.getByText("auth.login.title")).toBeTruthy();
      expect(screen.getByText("auth.login.test2")).toBeTruthy();
    });
    expect(screen.queryByText("auth.logout.title")).toBeNull();
  });
});
