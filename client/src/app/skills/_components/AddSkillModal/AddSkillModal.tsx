/* AddSkillModal — "Add Skill" dialog with three ways in: write a skill from
   scratch, import a .md/.zip file, or import from a URL. Every tab only writes
   to the DB on its own confirm button, so an abandoned modal leaves nothing
   behind. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Modal, Tabs } from "@devdigest/ui";
import { ADD_MODAL_WIDTH, TAB_CREATE, TAB_FILE, TAB_URL } from "./constants";
import { CreateTab } from "./_components/CreateTab";
import { ImportTab } from "./_components/ImportTab";

export function AddSkillModal({
  initialTab = TAB_CREATE,
  onClose,
  onAdded,
}: {
  initialTab?: string;
  onClose: () => void;
  onAdded: (skillId: string) => void;
}) {
  const t = useTranslations("skills");
  const [tab, setTab] = React.useState(initialTab);

  return (
    <Modal width={ADD_MODAL_WIDTH} title={t("addModal.title")} onClose={onClose}>
      <Tabs
        pad="0 24px"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: TAB_CREATE, label: t("addModal.tabs.create") },
          { key: TAB_FILE, label: t("addModal.tabs.file") },
          { key: TAB_URL, label: t("addModal.tabs.url") },
        ]}
      />
      {tab === TAB_CREATE && <CreateTab onClose={onClose} onCreated={onAdded} />}
      {tab === TAB_FILE && <ImportTab key={TAB_FILE} mode="file" onClose={onClose} onImported={onAdded} />}
      {tab === TAB_URL && <ImportTab key={TAB_URL} mode="url" onClose={onClose} onImported={onAdded} />}
    </Modal>
  );
}
