import { describe, it, expect } from "vitest";
import {
  getNotificationBadgeClass,
  getNotificationBadgeVariant,
  getSidebarTriggerClass
} from "./app-sidebar";

describe("getNotificationBadgeVariant", () => {
  it("returns none when unread count is zero", () => {
    expect(getNotificationBadgeVariant(0, "expanded")).toBe("none");
    expect(getNotificationBadgeVariant(0, "collapsed")).toBe("none");
  });

  it("returns dot when collapsed and unread exists", () => {
    expect(getNotificationBadgeVariant(3, "collapsed")).toBe("dot");
  });

  it("returns count when expanded and unread exists", () => {
    expect(getNotificationBadgeVariant(3, "expanded")).toBe("count");
  });
});

describe("getNotificationBadgeClass", () => {
  it("positions dot badge inside the icon container", () => {
    const className = getNotificationBadgeClass("dot");
    expect(className).toContain("right-0");
    expect(className).toContain("top-0");
  });
});

describe("getSidebarTriggerClass", () => {
  it("expands trigger width when collapsed", () => {
    expect(getSidebarTriggerClass("collapsed")).toContain("w-full");
  });

  it("keeps compact trigger width when expanded", () => {
    expect(getSidebarTriggerClass("expanded")).toContain("w-9");
  });
});
