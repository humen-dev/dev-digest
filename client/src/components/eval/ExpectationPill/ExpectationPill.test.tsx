import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/en/eval.json";
import { ExpectationPill } from "./ExpectationPill";

afterEach(cleanup);

describe("ExpectationPill", () => {
  it("reads MUST FIND / MUST NOT FLAG", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
        <ExpectationPill type="must_find" />
        <ExpectationPill type="must_not_flag" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("MUST FIND")).toBeInTheDocument();
    expect(screen.getByText("MUST NOT FLAG")).toBeInTheDocument();
  });
});
