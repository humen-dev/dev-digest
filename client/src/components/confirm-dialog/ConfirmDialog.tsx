/* ConfirmDialog — the shared "are you sure?" modal for destructive actions.
   Callers pass their own translated strings, so the component stays free of a
   feature's i18n namespace. */
"use client";

import { Button, Modal } from "@devdigest/ui";
import { s } from "./styles";

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel,
  busy,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      width={440}
      title={title}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button kind="danger" icon="Trash" disabled={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div style={s.body}>{body}</div>
    </Modal>
  );
}
