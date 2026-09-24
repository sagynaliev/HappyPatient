import { describe, expect, it } from "vitest";
import { getDoctorPhoto } from "./doctorImages";

describe("doctor image assignment", () => {
  it("keeps the same image for the same doctor identity", () => {
    expect(getDoctorPhoto("doctor-1")).toBe(getDoctorPhoto("doctor-1"));
  });

  it("uses the stable fallback identity when no doctor id is available", () => {
    expect(getDoctorPhoto("", "doctor@example.test")).toBe(getDoctorPhoto("", "doctor@example.test"));
  });
});
