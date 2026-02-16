import { useCallback, useEffect, useState } from "react";
import type { UiLanguage, UiMessageKey } from "./i18n";
import { translate } from "./i18n";
import {
  AddKeyForm,
  DuplicateValuesPanel,
  FileUsageTree,
  FooterActions,
  HeroHeader,
  ModalDialog,
  StatusBar,
  Toolbar,
  TranslationTable,
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
  const [activeView, setActiveView] = useState<"translations" | "duplicates">(
    "translations",
  );
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

  const modalDialog = useModalDialog();
  const translations = useTranslations({ t, dialog: modalDialog });
  const { focusKey } = translations;

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const deepLinkKey = query.get("key")?.trim();
    if (!deepLinkKey) {
      return;
    }

    focusKey(deepLinkKey);
  }, [focusKey]);

  const {
    activeCell,
    setActiveCell,
    registerCellRef,
    handleCellKeyDown,
  } = useKeyboardNavigation({
    visibleKeys: translations.visibleKeys,
    locales: translations.locales,
  });

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
        communityLinks={COMMUNITY_LINKS}
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
          lastSavedAt={translations.lastSavedAt}
          onRefresh={translations.refreshFromDisk}
        />

        <div className="editor-tabs">
          <button
            type="button"
            className={
              activeView === "translations"
                ? "btn btn--ghost btn--small is-active"
                : "btn btn--ghost btn--small"
            }
            onClick={() => setActiveView("translations")}
          >
            {t("tabTranslations")}
          </button>
          <button
            type="button"
            className={
              activeView === "duplicates"
                ? "btn btn--ghost btn--small is-active"
                : "btn btn--ghost btn--small"
            }
            onClick={() => setActiveView("duplicates")}
          >
            {t("tabDuplicateValues")}
          </button>
        </div>

        {activeView === "translations" ? (
          <>
            <div className="translations-workspace">
              <div className="editor-controls">
                <Toolbar
                  t={t}
                  filterValue={translations.filterValue}
                  onFilterChange={translations.setFilterValue}
                  gitBaseRef={translations.gitBaseRef}
                  onGitBaseRefChange={translations.setGitBaseRef}
                  gitDiffAvailable={translations.gitDiffAvailable}
                  gitDiffError={translations.gitDiffError}
                  showOnlyGitChanged={translations.showOnlyGitChanged}
                  onShowOnlyGitChangedChange={translations.setShowOnlyGitChanged}
                  usagePages={translations.usagePages}
                  selectedPage={translations.selectedPage}
                  onSelectedPageChange={translations.setSelectedPage}
                  showOnlyMissing={translations.showOnlyMissing}
                  onShowOnlyMissingChange={translations.setShowOnlyMissing}
                  locales={translations.locales}
                  filterRules={translations.filterRules}
                  sortConfig={translations.sortConfig}
                  onAddFilterRule={translations.addFilterRule}
                  onUpdateFilterRule={translations.updateFilterRule}
                  onRemoveFilterRule={translations.removeFilterRule}
                  onClearFilterRules={translations.clearFilterRules}
                  onUpdateSortConfig={translations.updateSortConfig}
                  onClearSort={translations.clearSort}
                />

                <AddKeyForm
                  t={t}
                  value={translations.newKey}
                  error={translations.newKeyError}
                  onChange={translations.updateNewKey}
                  onSubmit={translations.addKey}
                  disabled={!translations.newKey.trim() || translations.locales.length === 0}
                />
              </div>

              <div className="editor-main">
                <FileUsageTree
                  t={t}
                  files={translations.fileUsages}
                  selectedFile={translations.selectedFile}
                  onSelectFile={translations.setSelectedFile}
                />

                <div className="editor-content">
                  {translations.allKeys.length === 0 ? (
                    <p className="empty-state">{t("noKeysFound")}</p>
                  ) : translations.keys.length === 0 ? (
                    <p className="empty-state">{t("noKeysMatchFilter")}</p>
                  ) : translations.selectedFile !== "all" &&
                    translations.visibleKeys.length === 0 ? (
                    <p className="empty-state">{t("noKeysForFile")}</p>
                  ) : translations.visibleKeys.length === 0 ? (
                    <p className="empty-state">{t("noKeysForPage")}</p>
                  ) : (
                    <TranslationTable
                      t={t}
                      model={{
                        locales: translations.locales,
                        visibleKeys: translations.visibleKeys,
                        data: translations.data,
                        usage: translations.usage,
                        gitBaseRef: translations.gitBaseRef,
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
                        onToggleExpanded: translations.toggleExpandedKey,
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
            </div>
          </>
        ) : (
          <DuplicateValuesPanel
            t={t}
            groups={translations.duplicateValueGroups}
            onUnify={translations.unifyDuplicateGroup}
          />
        )}

        <FooterActions
          t={t}
          saving={translations.saving}
          disabled={translations.saving || !!translations.loadingError}
          onSave={translations.save}
        />
      </section>
      <ModalDialog
        dialog={modalDialog.dialog}
        onCancel={modalDialog.cancel}
        onConfirm={modalDialog.confirmDialog}
        onPromptValueChange={modalDialog.updatePromptValue}
      />
    </div>
  );
}
