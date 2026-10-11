import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { TruncatedText } from "./TruncatedText";

afterEach(cleanup);

describe("TruncatedText", () => {
  it("keeps the full 200-char text as accessible text and title while clipping visually", () => {
    const long = "n".repeat(200);
    render(<TruncatedText text={long} maxWidth={120} />);
    const el = screen.getByText(long);
    expect(el).toHaveAttribute("title", long);
    expect(el).toHaveStyle({ textOverflow: "ellipsis", overflow: "hidden", maxWidth: "120px" });
  });
});
