import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Popover, PopoverContent } from "@/shared/components/ui/popover";

describe("PopoverContent", () => {
  it("keeps its portal content out of desktop window drag regions", () => {
    render(
      <Popover open>
        <PopoverContent>菜单内容</PopoverContent>
      </Popover>,
    );

    const content = document.querySelector('[data-theme-overlay="popover"]');

    expect(content?.className).toContain("desktop-window-no-drag");
  });
});
