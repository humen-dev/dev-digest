/* FirstTasks — one card per suggested task: title, target path, the
   complexity badge (AC-23) and a "new file" badge when the target doesn't
   exist yet (AC-24). Cards sit in a responsive grid (EC-21). */
"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { TourTask } from "@devdigest/shared";
import { COMPLEXITY_TOKEN } from "./constants";
import { s } from "./styles";

export interface FirstTasksProps {
  tasks: TourTask[];
}

export function FirstTasks({ tasks }: FirstTasksProps) {
  const t = useTranslations("onboarding");
  return (
    <div style={s.grid}>
      {tasks.map((task, i) => {
        const token = COMPLEXITY_TOKEN[task.complexity];
        return (
          <article key={`${task.target}-${i}`} style={s.card}>
            <h4 style={s.title}>{task.title}</h4>
            <span className="mono" title={task.target} style={s.target}>
              {task.target}
            </span>
            <div style={s.footer}>
              <Badge color={token.color} bg={token.bg}>
                {t(`tasks.complexity.${task.complexity}`)}
              </Badge>
              {task.new_file && <Badge>{t("tasks.newFile")}</Badge>}
            </div>
          </article>
        );
      })}
    </div>
  );
}
