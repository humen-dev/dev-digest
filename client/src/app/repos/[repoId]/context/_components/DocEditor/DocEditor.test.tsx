import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/projectContext.json";
import { DocEditor } from "./DocEditor";

afterEach(cleanup);

function renderEditor(over: Partial<React.ComponentProps<typeof DocEditor>> = {}) {
  const onChange = vi.fn();
  const onSave = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ projectContext: messages }}>
      <DocEditor
        path="docs/a.md"
        value="# Hello"
        onChange={onChange}
        onSave={onSave}
        saving={false}
        errorMessage={null}
        {...over}
      />
    </NextIntlClientProvider>,
  );
  return { onChange, onSave };
}

describe("DocEditor", () => {
  it("holds the raw text, shows the local-edits warning, and sends Save — AC-64, AC-65, AC-70", () => {
    const { onSave } = renderEditor();
    expect(document.querySelector("textarea")).toHaveValue("# Hello");
    expect(
      screen.getByText(/Edits are saved to the local clone only and are not committed/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("Save"));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("on a save failure keeps the text and offers Retry, which sends the same save again — AC-68", () => {
    const { onSave } = renderEditor({ errorMessage: "500 Internal Server Error" });
    expect(document.querySelector("textarea")).toHaveValue("# Hello");
    expect(screen.getByText("500 Internal Server Error")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Retry"));
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
