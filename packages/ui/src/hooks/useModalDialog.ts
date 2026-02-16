import { useCallback, useEffect, useRef, useState } from "react";

type DialogTone = "primary" | "danger";

type ConfirmOptions = {
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: DialogTone;
};

type PromptOptions = {
  confirmLabel?: string;
  cancelLabel?: string;
  placeholder?: string;
};

type ConfirmDialogState = {
  type: "confirm";
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  tone: DialogTone;
};

type PromptDialogState = {
  type: "prompt";
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  placeholder?: string;
  value: string;
};

export type ModalDialogState = ConfirmDialogState | PromptDialogState | null;

export type DialogApi = {
  confirm: (message: string, options?: ConfirmOptions) => Promise<boolean>;
  prompt: (
    message: string,
    defaultValue?: string,
    options?: PromptOptions,
  ) => Promise<string | null>;
};

export function useModalDialog() {
  const [dialog, setDialog] = useState<ModalDialogState>(null);
  const resolverRef = useRef<((value: boolean | string | null) => void) | null>(null);

  const resolveAndClose = useCallback((result: boolean | string | null) => {
    const resolver = resolverRef.current;
    resolverRef.current = null;
    setDialog(null);
    resolver?.(result);
  }, []);

  useEffect(() => {
    return () => {
      if (resolverRef.current) {
        resolverRef.current(null);
        resolverRef.current = null;
      }
    };
  }, []);

  const confirm = useCallback(
    (message: string, options?: ConfirmOptions) => {
      return new Promise<boolean>((resolve) => {
        resolverRef.current = (value) => resolve(Boolean(value));
        setDialog({
          type: "confirm",
          message,
          confirmLabel: options?.confirmLabel ?? "Confirm",
          cancelLabel: options?.cancelLabel ?? "Cancel",
          tone: options?.tone ?? "primary",
        });
      });
    },
    [],
  );

  const prompt = useCallback(
    (message: string, defaultValue = "", options?: PromptOptions) => {
      return new Promise<string | null>((resolve) => {
        resolverRef.current = (value) =>
          resolve(typeof value === "string" ? value : null);
        setDialog({
          type: "prompt",
          message,
          value: defaultValue,
          placeholder: options?.placeholder,
          confirmLabel: options?.confirmLabel ?? "Apply",
          cancelLabel: options?.cancelLabel ?? "Cancel",
        });
      });
    },
    [],
  );

  const cancel = useCallback(() => {
    if (!dialog) {
      return;
    }

    resolveAndClose(dialog.type === "confirm" ? false : null);
  }, [dialog, resolveAndClose]);

  const confirmDialog = useCallback(() => {
    if (!dialog) {
      return;
    }

    resolveAndClose(dialog.type === "confirm" ? true : dialog.value);
  }, [dialog, resolveAndClose]);

  const updatePromptValue = useCallback((value: string) => {
    setDialog((prev) =>
      prev && prev.type === "prompt" ? { ...prev, value } : prev,
    );
  }, []);

  return {
    dialog,
    confirm,
    prompt,
    cancel,
    confirmDialog,
    updatePromptValue,
  };
}
