// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LanguageSwitcher } from "./language-switcher";

const LINKS = [
  { locale: "en" as const, label: "English", href: "/en/demo/02-beta" },
  { locale: "zh" as const, label: "简体中文", href: "/zh/demo/02-beta" },
];

afterEach(cleanup);

describe("LanguageSwitcher", () => {
  it("renders a button named by the current locale local name", () => {
    render(<LanguageSwitcher links={LINKS} current="zh" ariaLabel="切换语言" />);
    const button = screen.getByRole("button", { name: /切换语言.*简体中文/ });
    expect(button.getAttribute("aria-haspopup")).toBe("menu");
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("opens a menu with exact-page links and a non-link current row", () => {
    render(<LanguageSwitcher links={LINKS} current="zh" ariaLabel="切换语言" />);
    fireEvent.click(screen.getByRole("button"));

    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-expanded")).toBe("true");

    const menu = screen.getByRole("menu");
    const english = within(menu).getByRole("menuitem", { name: "English" });
    expect(english.tagName).toBe("A");
    expect(english.getAttribute("href")).toBe("/en/demo/02-beta");

    // Current locale is shown as selected state, never as a duplicate link.
    const currentRow = within(menu).getByText("简体中文").closest('[role="menuitem"]');
    expect(currentRow).not.toBeNull();
    expect(currentRow!.tagName).not.toBe("A");
    expect(currentRow!.getAttribute("aria-current")).toBe("page");
  });

  it("closes on Escape and on outside pointer down", () => {
    render(<LanguageSwitcher links={LINKS} current="en" ariaLabel="Switch language" />);
    const button = screen.getByRole("button");

    fireEvent.click(button);
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.keyDown(button, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(button.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(button);
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("moves focus into the menu with ArrowDown", () => {
    render(<LanguageSwitcher links={LINKS} current="zh" ariaLabel="切换语言" />);
    const button = screen.getByRole("button");
    fireEvent.keyDown(button, { key: "ArrowDown" });
    const menu = screen.getByRole("menu");
    const first = within(menu).getAllByRole("menuitem")[0];
    expect(document.activeElement).toBe(first);
  });
});
