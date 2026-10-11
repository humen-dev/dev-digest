import { defineConfig } from "vitest/config";
import TrendReporter from "./src/trend-reporter.js";
import { TEST_TIMEOUT_MS } from "./src/config.js";

export default defineConfig({
  test: {
    // *.eval.ts = model-backed evals; src/**/*.test.ts = the pure stats unit tests.
    include: ["**/*.eval.ts", "src/**/*.test.ts"],
    // Real sessions (and a subagent dispatch) are slow — give them room: 240 s on the
    // subscription, 600 s on OpenRouter (slower non-Claude models), EVAL_TEST_TIMEOUT overrides.
    testTimeout: TEST_TIMEOUT_MS,
    hookTimeout: TEST_TIMEOUT_MS,
    // One session per test; a few files can run concurrently. Keep it modest to stay cheap.
    fileParallelism: true,
    reporters: ["default", new TrendReporter()],
  },
});
