/** Python adapter barrel — the only entry point other layers import. */
export type * from './types.js';
export { scanPython } from './scan.js';
export { parsePythonSymbols, parsePythonReferences } from './symbols.js';
export {
  buildModuleIndex,
  resolveModule,
  resolveImport,
  buildPythonEdges,
  resolveNameToFile,
  resolveDottedString,
} from './imports.js';
export { extractPythonRegistrations, collectViewInfo, attributePythonFacts } from './facts.js';
export { isPythonFile, analyzePythonProject } from './project.js';
