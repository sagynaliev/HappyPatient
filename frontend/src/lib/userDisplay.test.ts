import { describe, expect, it } from "vitest";
import { formatUserDisplayName, getUserInitials } from "./userDisplay";

describe("user display formatting", () => {
  it("formats a first and last name separately from avatar initials", () => {
    expect(getUserInitials("Alikhan", "Sagyn")).toBe("AS");
    expect(formatUserDisplayName("Alikhan", "Sagyn")).toBe("Alikhan S.");
  });

  it("normalizes extra spaces and abbreviates long last names", () => {
    expect(getUserInitials("  Alikhan  ", "  Sagyn   Khan ")).toBe("AS");
    expect(formatUserDisplayName("  Alikhan   Nur ", " Sagyn Khan ")).toBe("Alikhan Nur S.");
  });

  it("handles either name being unavailable", () => {
    expect(getUserInitials("Alikhan", "")).toBe("A");
    expect(formatUserDisplayName("Alikhan", "")).toBe("Alikhan");
    expect(getUserInitials("", "Sagyn")).toBe("S");
    expect(formatUserDisplayName("", "Sagyn")).toBe("Sagyn");
    expect(getUserInitials(undefined, null)).toBe("");
    expect(formatUserDisplayName(undefined, null)).toBe("Account");
  });
});
