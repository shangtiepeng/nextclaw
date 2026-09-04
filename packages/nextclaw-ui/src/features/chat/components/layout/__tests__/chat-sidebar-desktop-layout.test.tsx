import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatSidebarDesktopHeader } from "@/features/chat/components/layout/chat-sidebar-desktop-layout";

vi.mock("@/shared/components/common/brand-header", () => ({
  BrandHeader: ({ reserveMacWindowControls }: { reserveMacWindowControls?: boolean }) => (
    <div
      data-reserve-mac-window-controls={String(reserveMacWindowControls)}
      data-testid="brand-header"
    />
  ),
}));

vi.mock("@/shared/components/common/status-badge", () => ({
  StatusBadge: () => <div data-testid="status-badge" />,
}));

describe("ChatSidebarDesktopHeader", () => {
  afterEach(() => {
    window.nextclawDesktop = undefined;
  });

  it("places the macOS brand row below the traffic lights", () => {
    window.nextclawDesktop = { platform: "darwin" } as typeof window.nextclawDesktop;

    render(
      <ChatSidebarDesktopHeader
        connectionStatus={"connected" as never}
        isCollapsed={false}
      />,
    );

    const brandHeader = screen.getByTestId("brand-header");

    expect(brandHeader.parentElement?.className).toContain("pt-9");
    expect(brandHeader.dataset.reserveMacWindowControls).toBe("false");
  });
});
