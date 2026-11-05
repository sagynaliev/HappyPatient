import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminOperationsPage from "./AdminOperationsPage";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({ api: vi.fn() }));
afterEach(cleanup);

const rule = (over: Record<string, unknown>) => ({ id: "r1", kind: "visit", amountKzt: 15000, ratePerHourKzt: null, freeMinutes: 0, rounding: "per_started_hour", dailyCapKzt: null, effectiveFrom: "2026-11-01T00:00:00Z", effectiveTo: null, active: true, doctorId: null, categoryId: "c1", consultationType: null, serviceCode: null, serviceName: null, category: { name: "Pediatrics" }, office: null, createdBy: null, audits: [], ...over });
const audit = (id: string, createdAt: string, action: string) => ({ id, action, createdAt, actor: { firstName: "System", lastName: "Admin" }, oldValue: null, newValue: null });

function mockPricing(rules: unknown[]) {
  vi.mocked(api).mockImplementation(async (path: string, options?: RequestInit) => {
    if (options?.method === "POST" && path === "/admin/pricing") throw new Error("An active rule already overlaps this scope and date range.");
    if (options?.method) return { rule: {} };
    if (path === "/admin/pricing") return { rules };
    if (path === "/admin/reference/categories") return { categories: [] };
    if (path === "/admin/doctors") return { doctors: [] };
    if (path === "/admin/reference/locations") return { locations: [] };
    return {};
  });
}

describe("admin pricing", () => {
  beforeEach(() => vi.mocked(api).mockReset());

  it("lists price changes newest first with a time", async () => {
    mockPricing([rule({ id: "r1", audits: [audit("a1", "2026-11-05T04:00:00Z", "created")] }), rule({ id: "r2", kind: "parking", audits: [audit("a2", "2026-11-05T06:30:00Z", "deactivated")] })]);
    render(<AdminOperationsPage view="pricing" />);
    const list = (await screen.findByRole("heading", { name: "Price change audit" })).closest("section")!;
    const items = within(list).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("deactivated");
    expect(items[0]).toHaveTextContent("11:30");
    expect(items[1]).toHaveTextContent("created");
  });

  it("shows the server's overlap error next to the form", async () => {
    mockPricing([]);
    render(<AdminOperationsPage view="pricing" />);
    fireEvent.change(await screen.findByLabelText("Amount (KZT)"), { target: { value: "16000" } });
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
    const form = screen.getByRole("heading", { name: "Add a pricing rule" }).closest("form")!;
    expect(await within(form).findByRole("alert")).toHaveTextContent("already overlaps");
  });

  it("saves a parking rule with only the hourly rate", async () => {
    vi.mocked(api).mockImplementation(async (path: string, options?: RequestInit) => (options?.method ? { rule: {} } : path === "/admin/pricing" ? { rules: [] } : String(path).includes("categories") ? { categories: [] } : String(path).includes("doctors") ? { doctors: [] } : { locations: [] }));
    render(<AdminOperationsPage view="pricing" />);
    fireEvent.change((await screen.findAllByLabelText("Type"))[0], { target: { value: "parking" } });
    expect(screen.queryByLabelText("Amount (KZT)")).toBeNull();
    fireEvent.change(screen.getByLabelText("Hourly rate (KZT)"), { target: { value: "400" } });
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
    await waitFor(() => expect(vi.mocked(api).mock.calls.some(([path, options]) => path === "/admin/pricing" && options?.method === "POST" && JSON.parse(String(options.body)).ratePerHourKzt === 400 && JSON.parse(String(options.body)).amountKzt === 0)).toBe(true));
  });

  it("keeps the service code on a new version and asks before deactivating", async () => {
    mockPricing([rule({ kind: "treatment", categoryId: null, category: null, serviceCode: "ECG-1", serviceName: "ECG" })]);
    render(<AdminOperationsPage view="pricing" />);
    fireEvent.click(await screen.findByRole("button", { name: "New version" }));
    expect(screen.getByLabelText("Service code")).toHaveValue("ECG-1");
    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    expect(screen.getByText("Deactivate this rule?")).toBeTruthy();
    expect(vi.mocked(api).mock.calls.some(([, options]) => options?.method === "PATCH")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Yes, deactivate" }));
    await waitFor(() => expect(vi.mocked(api).mock.calls.some(([, options]) => options?.method === "PATCH")).toBe(true));
  });
});

describe("admin data quality", () => {
  it("lists every run newest first and never calls an empty run all clear", async () => {
    const checks = [{ id: "c1", name: "Check one", description: "", count: 0, severity: "info", sampleIds: [] }];
    vi.mocked(api).mockResolvedValue({ runs: [
      { id: "new", startedAt: "2026-11-05T06:00:00Z", finishedAt: "2026-11-05T06:00:01Z", status: "complete", results: checks },
      { id: "broken", startedAt: "2026-11-04T10:00:00Z", finishedAt: null, status: "running", results: null },
      { id: "old", startedAt: "2026-11-02T10:00:00Z", finishedAt: "2026-11-02T10:00:01Z", status: "complete", results: checks },
    ] });
    render(<AdminOperationsPage view="integrity" />);
    const history = (await screen.findByRole("heading", { name: "Run history" })).closest("section")!;
    const items = within(history).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("5 Nov 2026");
    expect(items[0]).toHaveTextContent("Latest");
    expect(items[1]).toHaveTextContent("Running or interrupted");
    expect(items[1]).not.toHaveTextContent("All clear");
  });
});
