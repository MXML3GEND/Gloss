import { useCallback, useEffect, useState } from "react";
import type { UiLanguage, UiMessageKey } from "./i18n";
import { translate } from "./i18n";
import {
  ActionSidebar,
  AddKeyForm,
  DuplicateValuesPanel,
  FileUsageTree,
  FooterActions,
  HeroHeader,
  IssuesInboxPanel,
  ModalDialog,
  NamespaceTree,
  StatusBar,
  Toolbar,
  TranslationTable,
  UsageDetailsPanel,
} from "./components";
import { useKeyboardNavigation, useModalDialog, useTranslations } from "./hooks";
import "./App.css";

const envLink = (name: string, fallback: string) => {
  const value = (import.meta.env[name] as string | undefined)?.trim();
  return value || fallback;
};

const COMMUNITY_LINKS = {
  repo: envLink("VITE_GLOSS_REPO_URL", "https://github.com/MXML3GEND/Gloss.git"),
  issues: envLink(
    "VITE_GLOSS_ISSUES_URL",
    "https://github.com/MXML3GEND/Gloss/issues",
  ),
};

export default function App() {
  const [activeView, setActiveView] = useState<
    "translations" | "issues" | "duplicates" | "usage"
  >("translations");
  const [showExplorers, setShowExplorers] = useState(false);
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
  const [uiLanguage, setUiLanguage] = useState<UiLanguage>(() => {
    if (typeof window === "undefined") {
      return "en";
    }

    const storedLanguage = window.localStorage.getItem("gloss-ui-language");
    if (storedLanguage === "en" || storedLanguage === "nl") {
      return storedLanguage;
    }

    return window.navigator.language.toLowerCase().startsWith("nl") ? "nl" : "en";
  });

  const t = useCallback(
    (key: UiMessageKey, variables?: Record<string, string | number>) =>
      translate(uiLanguage, key, variables),
    [uiLanguage],
  );

  useEffect(() => {
    window.localStorage.setItem("gloss-ui-language", uiLanguage);
  }, [uiLanguage]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setToast((current) => (current?.id === toast.id ? null : current));
    }, 2800);

    return () => window.clearTimeout(timeoutId);
  }, [toast]);
  const handleNotify = useCallback((message: string) => {
    setToast({ id: Date.now(), message });
  }, []);

  const modalDialog = useModalDialog();
  const translations = useTranslations({
    t,
    dialog: modalDialog,
    onNotify: handleNotify,
  });
  const { focusKey } = translations;
  const handleWorkspaceModeChange = (mode: "translate" | "maintenance") => {
    translations.setWorkspaceMode(mode);
    if (mode === "translate") {
      setActiveView("translations");
      setShowExplorers(false);
    }
  };

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const deepLinkKey = query.get("key")?.trim();
    if (!deepLinkKey) {
      return;
    }

    focusKey(deepLinkKey);
  }, [focusKey]);

  const handleOpenIssueKey = (key: string) => {
    setActiveView("translations");
    focusKey(key);
  };

  const handleViewChange = (view: "translations" | "issues" | "duplicates") => {
    if (view !== "translations" && translations.workspaceMode !== "maintenance") {
      translations.setWorkspaceMode("maintenance");
    }
    setActiveView(view);
    if (view === "issues") {
      void translations.reloadCheckSummary();
    }
  };

  const handleOpenUsageDetails = (key: string) => {
    if (translations.workspaceMode !== "maintenance") {
      translations.setWorkspaceMode("maintenance");
    }

    if (activeView === "usage" && translations.expandedKey === key) {
      translations.toggleExpandedKey(key);
      setActiveView("translations");
      return;
    }

    if (translations.expandedKey !== key) {
      translations.toggleExpandedKey(key);
    }
    setActiveView("usage");
  };

  const closeAnalysisDrawer = () => {
    if (activeView === "usage" && translations.expandedKey) {
      translations.toggleExpandedKey(translations.expandedKey);
    }
    setActiveView("translations");
  };

  const focusInputByAriaLabel = (label: string) => {
    const escapedLabel =
      typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(label)
        : label.replace(/"/g, '\\"');
    const element = document.querySelector(
      `[aria-label="${escapedLabel}"]`,
    ) as HTMLInputElement | HTMLTextAreaElement | null;
    if (!element) {
      return;
    }
    element.focus();
    if (typeof element.select === "function") {
      element.select();
    }
  };

  const handleSidebarSearch = () => {
    if (activeView !== "translations") {
      setActiveView("translations");
      window.setTimeout(() => {
        focusInputByAriaLabel(t("filterKeys"));
      }, 0);
      return;
    }
    focusInputByAriaLabel(t("filterKeys"));
  };

  const handleSidebarAddKey = () => {
    if (activeView !== "translations") {
      setActiveView("translations");
    }
    handleWorkspaceModeChange("maintenance");
    window.setTimeout(() => {
      focusInputByAriaLabel(t("newKeyPlaceholder"));
    }, 0);
  };

  const toggleDslBooleanToken = (tokenName: string) => {
    const prefix = `${tokenName.toLowerCase()}:`;
    const activeToken = `${tokenName.toLowerCase()}:true`;
    const tokens = translations.filterValue
      .trim()
      .split(/\s+/)
      .filter((token) => token.length > 0);
    const hasToken = tokens.some(
      (token) => token.toLowerCase() === activeToken,
    );
    const nextTokens = tokens.filter(
      (token) => !token.toLowerCase().startsWith(prefix),
    );

    if (!hasToken) {
      nextTokens.push(`${tokenName}:true`);
    }

    translations.setFilterValue(nextTokens.join(" "));
  };

  useEffect(() => {
    const handleGlobalShortcuts = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || modalDialog.dialog) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "k" && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        handleSidebarSearch();
        return;
      }

      if (key === "s" && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        if (!translations.saving && !translations.loadingError) {
          void translations.save();
        }
        return;
      }

      if (event.shiftKey && !event.altKey && key === "n") {
        event.preventDefault();
        handleSidebarAddKey();
        return;
      }

      if (event.shiftKey && !event.altKey && key === "i") {
        event.preventDefault();
        handleViewChange("issues");
        return;
      }

      if (event.shiftKey && !event.altKey && key === "u") {
        event.preventDefault();
        handleViewChange("duplicates");
        return;
      }

      if (event.shiftKey && !event.altKey && key === "m") {
        event.preventDefault();
        toggleDslBooleanToken("missing");
      }
    };

    window.addEventListener("keydown", handleGlobalShortcuts);
    return () => window.removeEventListener("keydown", handleGlobalShortcuts);
  }, [
    handleViewChange,
    handleSidebarAddKey,
    handleSidebarSearch,
    modalDialog.dialog,
    toggleDslBooleanToken,
    translations,
  ]);

  const handleReviewChanges = () => {
    setActiveView("translations");
    translations.reviewChangedKeys();
  };

  const {
    activeCell,
    setActiveCell,
    registerCellRef,
    handleCellKeyDown,
  } = useKeyboardNavigation({
    visibleKeys: translations.visibleKeys,
    locales: translations.locales,
  });
  const hasRenderableTranslationRows =
    translations.visibleKeys.length > 0 ||
    (translations.groupByNamespace && translations.namespaceTableGroups.length > 0);
  const showAnalysisDrawer =
    translations.workspaceMode === "maintenance" && activeView !== "translations";

  if (translations.loading) {
    return <div className="loading-state">{t("loading")}</div>;
  }

  return (
    <div className="gloss-app">
      <HeroHeader
        t={t}
        uiLanguage={uiLanguage}
        onChangeLanguage={setUiLanguage}
        localeCount={translations.locales.length}
        keyCount={translations.allKeys.length}
        missingCount={translations.totalMissingCells}
      />

      <div className="workspace-shell">
        <ActionSidebar
          t={t}
          workspaceMode={translations.workspaceMode}
          activeView={activeView}
          onChangeView={handleViewChange}
          onSearch={handleSidebarSearch}
          onAddKey={handleSidebarAddKey}
          onSave={translations.save}
          saveDisabled={translations.saving || !!translations.loadingError}
          saving={translations.saving}
        />

        <section className="editor-shell">
          <StatusBar
            t={t}
            loadingError={translations.loadingError}
            saveError={translations.saveError}
            hardcodedTextCount={translations.hardcodedTextCount}
            hardcodedTextPreview={translations.hardcodedTextPreview}
            hardcodedTextIssues={translations.hardcodedTextIssues}
            staleData={translations.staleData}
            hasUnsavedChanges={translations.hasUnsavedChanges}
            changedKeyCount={translations.changedSinceBaseKeyCount}
            issueBaseline={translations.issueBaseline}
            lastSavedAt={translations.lastSavedAt}
            onRefresh={translations.refreshFromDisk}
            onReviewChanges={handleReviewChanges}
          />

          <div className="translations-workspace">
            <div className="editor-controls">
              <Toolbar
                t={t}
                workspaceMode={translations.workspaceMode}
                onWorkspaceModeChange={handleWorkspaceModeChange}
                filterValue={translations.filterValue}
                onFilterChange={translations.setFilterValue}
                groupByNamespace={translations.groupByNamespace}
                onGroupByNamespaceChange={translations.setGroupByNamespace}
                showExplorers={showExplorers}
                onShowExplorersChange={setShowExplorers}
                gitBaseRef={translations.gitBaseRef}
                onGitBaseRefChange={translations.setGitBaseRef}
                gitDiffAvailable={translations.gitDiffAvailable}
                gitDiffError={translations.gitDiffError}
                usagePages={translations.usagePages}
                selectedPage={translations.selectedPage}
                onSelectedPageChange={translations.setSelectedPage}
              />

              {translations.workspaceMode === "maintenance" ? (
                <AddKeyForm
                  t={t}
                  value={translations.newKey}
                  error={translations.newKeyError}
                  onChange={translations.updateNewKey}
                  onSubmit={translations.addKey}
                  disabled={!translations.newKey.trim() || translations.locales.length === 0}
                />
              ) : null}
            </div>

            <div
              className={
                showAnalysisDrawer
                  ? "workspace-content-shell workspace-content-shell--with-drawer"
                  : "workspace-content-shell"
              }
            >
              <div
                className={
                  translations.workspaceMode === "translate"
                    ? "editor-main editor-main--translate"
                    : "editor-main"
                }
              >
                {translations.workspaceMode === "maintenance" && showExplorers ? (
                  <div className="editor-explorers">
                    <NamespaceTree
                      t={t}
                      tree={translations.namespaceTree}
                      selectedNamespace={translations.selectedNamespace}
                      onSelectNamespace={translations.setSelectedNamespace}
                    />
                    <FileUsageTree
                      t={t}
                      files={translations.fileUsages}
                      selectedFile={translations.selectedFile}
                      onSelectFile={translations.setSelectedFile}
                    />
                  </div>
                ) : null}

                <div className="editor-content">
                  {translations.allKeys.length === 0 ? (
                    <p className="empty-state empty-state--workspace">{t("noKeysFound")}</p>
                  ) : translations.keys.length === 0 ? (
                    <p className="empty-state empty-state--workspace">
                      {t("noKeysMatchFilter")}
                    </p>
                  ) : translations.selectedFile !== "all" &&
                    !hasRenderableTranslationRows ? (
                    <p className="empty-state empty-state--workspace">{t("noKeysForFile")}</p>
                  ) : !hasRenderableTranslationRows ? (
                    <p className="empty-state empty-state--workspace">{t("noKeysForPage")}</p>
                  ) : (
                    <TranslationTable
                      t={t}
                      model={{
                        workspaceMode: translations.workspaceMode,
                        groupByNamespace: translations.groupByNamespace,
                        locales: translations.locales,
                        visibleKeys: translations.visibleKeys,
                        namespaceGroups: translations.namespaceTableGroups,
                        collapsedNamespaceGroupSet:
                          translations.collapsedNamespaceGroupSet,
                        data: translations.data,
                        usage: translations.usage,
                        changedSinceBaseKeySet: translations.changedSinceBaseKeySet,
                        gitDiffByKey: translations.gitDiffByKey,
                        selectedFileKeySet: translations.selectedFileKeySet,
                        expandedKey: translations.expandedKey,
                        highlightedKey: translations.highlightedKey,
                        renamingKey: translations.renamingKey,
                        renameValue: translations.renameValue,
                        renameError: translations.renameError,
                        placeholderMismatchByKey: translations.placeholderMismatchByKey,
                        activeCell,
                      }}
                      actions={{
                        isCellDirty: translations.isCellDirty,
                        textareaRows: translations.textareaRows,
                        onOpenUsageDetails: handleOpenUsageDetails,
                        onToggleNamespaceGroup: translations.toggleNamespaceGroup,
                        onCellFocus: (row, col) => setActiveCell({ row, col }),
                        onCellBlur: () => setActiveCell(null),
                        onCellKeyDown: handleCellKeyDown,
                        onCellChange: translations.handleChange,
                        onStartRename: translations.startRename,
                        onDeleteKey: translations.deleteKey,
                        onRenameValueChange: translations.updateRenameValue,
                        onApplyRename: translations.applyRename,
                        onCancelRename: translations.cancelRename,
                        registerCellRef,
                      }}
                    />
                  )}
                </div>
              </div>

              {showAnalysisDrawer ? (
                <aside className="analysis-drawer" aria-label={t("advancedQuery")}>
                  <div className="analysis-drawer__header">
                    <p className="analysis-drawer__title">
                      {activeView === "issues"
                        ? t("tabIssuesInbox")
                        : activeView === "duplicates"
                          ? t("tabDuplicateValues")
                          : t("tabUsageDetails")}
                    </p>
                    <button
                      type="button"
                      className="btn btn--ghost btn--small row-action-icon-btn"
                      aria-label={t("cancel")}
                      title={t("cancel")}
                      onClick={closeAnalysisDrawer}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path
                          d="M6.71 5.29a1 1 0 0 0-1.42 1.42L10.59 12l-5.3 5.29a1 1 0 1 0 1.42 1.42L12 13.41l5.29 5.3a1 1 0 0 0 1.42-1.42L13.41 12l5.3-5.29a1 1 0 0 0-1.42-1.42L12 10.59 6.71 5.29Z"
                          fill="currentColor"
                        />
                      </svg>
                    </button>
                  </div>

                  <div className="analysis-drawer__body">
                    {activeView === "issues" ? (
                      <IssuesInboxPanel
                        t={t}
                        items={translations.issuesInboxItems}
                        onOpenKey={handleOpenIssueKey}
                        onFillMissing={translations.fillMissingFromDefaultLocale}
                        onNormalizePlaceholders={translations.normalizeIssuePlaceholders}
                        onDeleteUnused={translations.deleteUnusedIssueKey}
                        onDeprecateUnused={translations.deprecateUnusedIssueKey}
                        onFillAllMissing={translations.fillAllMissingFromDefaultLocale}
                        onNormalizeAllPlaceholders={
                          translations.normalizeAllIssuePlaceholders
                        }
                        onDeprecateAllUnused={translations.deprecateAllUnusedIssueKeys}
                      />
                    ) : activeView === "duplicates" ? (
                      <DuplicateValuesPanel
                        t={t}
                        groups={translations.duplicateValueGroups}
                        onUnify={translations.unifyDuplicateGroup}
                      />
                    ) : (
                      <UsageDetailsPanel
                        t={t}
                        selectedKey={translations.expandedKey}
                        usageEntry={
                          translations.expandedKey
                            ? translations.usage[translations.expandedKey] ?? null
                            : null
                        }
                        gitDiff={
                          translations.expandedKey
                            ? translations.gitDiffByKey[translations.expandedKey] ?? null
                            : null
                        }
                        gitBaseRef={translations.gitBaseRef}
                      />
                    )}
                  </div>
                </aside>
              ) : null}
            </div>
          </div>

          <FooterActions
            t={t}
            locales={translations.locales}
            defaultLocale={translations.defaultLocale}
            onExportXliff={translations.exportXliff}
            onImportXliff={translations.importXliff}
            communityLinks={COMMUNITY_LINKS}
          />
        </section>
      </div>
      <ModalDialog
        dialog={modalDialog.dialog}
        onCancel={modalDialog.cancel}
        onConfirm={modalDialog.confirmDialog}
        onPromptValueChange={modalDialog.updatePromptValue}
      />
      {toast ? (
        <div className="toast-stack" role="status" aria-live="polite">
          <p className="toast toast--success">{toast.message}</p>
        </div>
      ) : null}
    </div>
  );
}
