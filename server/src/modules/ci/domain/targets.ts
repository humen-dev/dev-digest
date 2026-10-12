import type { CiTargetOption } from '@devdigest/shared';

/**
 * SPEC-07 AC-3 — the targets that have a real generator. Only `gha` today;
 * other `CiTarget` enum members render nowhere. `label_key` is relative to the
 * client's `ci` i18n namespace.
 */
export const CI_TARGETS: CiTargetOption[] = [{ target: 'gha', label_key: 'exportWizard.targets.gha' }];
