/**
 * Re-export only (SPEC-03 D6). The patterns and `containsSecretValue` moved
 * to `modules/_shared/secrets.ts` because the onboarding module needs them
 * too and `no-cross-module-internals` forbids importing another module's
 * `domain/`. Kept here so `project-context/service.ts` and its tests do not
 * need to change.
 */
export { containsSecretValue } from '../../_shared/secrets.js';
