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
    const list = (await screen.findByRole("heading", { name: "Price change history" })).closest("section")!;
    const items = within(list).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("deactivated a parking price");
    expect(items[0]).toHaveTextContent("11:30");
    expect(items[1]).toHaveTextContent("added a visit price");
  });

  it("explains parking terms in plain words and keeps long histories short", async () => {
    const audits = Array.from({ length: 7 }, (_, index) => audit("h" + index, `2026-11-0${index + 1}T04:00:00Z`, "created"));
    mockPricing([rule({ id: "p1", kind: "parking", amountKzt: 0, ratePerHourKzt: 500, freeMinutes: 15, dailyCapKzt: 3000, audits })]);
    render(<AdminOperationsPage view="pricing" />);
    expect(await screen.findByText("15 min free · max 3,000 KZT a day")).toBeTruthy();
    expect(screen.getByText("7 changes recorded")).toBeTruthy();
    const list = screen.getByRole("heading", { name: "Price change history" }).closest("section")!;
    expect(within(list).getAllByRole("listitem")).toHaveLength(5);
    fireEvent.click(within(list).getByRole("button", { name: "Show all 7 changes" }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(7);
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

  it("lists refused medical-record access attempts without record content", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => path === "/admin/security/access-attempts"
      ? { lastWeek: 2, attempts: [{ id: "a1", createdAt: "2026-11-10T10:00:00Z", actor: "Sam Doctor", actorRole: "DOCTOR", action: "get", patient: "Casey Patient" }] }
      : { runs: [] });
    render(<AdminOperationsPage view="integrity" />);
    const heading = await screen.findByRole("heading", { name: "Refused medical-record access" });
    const panel = heading.closest("section")!;
    expect(panel).toHaveTextContent("2 in the last 7 days");
    const row = within(panel).getAllByRole("row")[1];
    expect(row).toHaveTextContent("Sam Doctor");
    expect(row).toHaveTextContent("Doctor");
    expect(row).toHaveTextContent("Open a record");
    expect(row).toHaveTextContent("Casey Patient");
  });

  it("puts failing checks first and folds the passed ones away", async () => {
    const checks = [
      { id: "ok", name: "Passing check", description: "", count: 0, severity: "critical", sampleIds: [] },
      { id: "warn", name: "Warning check", description: "", count: 2, severity: "warning", sampleIds: [] },
      { id: "crit", name: "Critical check", description: "", count: 1, severity: "critical", sampleIds: ["x"] },
    ];
    vi.mocked(api).mockImplementation(async (path: string) => path === "/admin/integrity/runs" ? { runs: [{ id: "r", startedAt: "2026-11-05T06:00:00Z", finishedAt: "2026-11-05T06:00:01Z", status: "complete", results: checks }] } : { attempts: [], lastWeek: 0 });
    render(<AdminOperationsPage view="integrity" />);
    const latest = (await screen.findByRole("heading", { name: "Latest run" })).closest("section")!;
    const rows = within(latest).getAllByRole("row").slice(1).map((row) => row.textContent ?? "");
    expect(rows[0]).toContain("Critical check");
    expect(rows[1]).toContain("Warning check");
    expect(within(latest).getByText("1 passed check").closest("details")).not.toHaveAttribute("open");
  });
});

describe("parking daily cap", () => {
  it("sends the daily cap with a parking rule and leaves it empty for no cap", async () => {
    mockPricing([]);
    render(<AdminOperationsPage view="pricing" />);
    fireEvent.change((await screen.findAllByLabelText("Type"))[0], { target: { value: "parking" } });
    fireEvent.change(screen.getByLabelText("Hourly rate (KZT)"), { target: { value: "500" } });
    fireEvent.change(screen.getByLabelText("Free minutes"), { target: { value: "15" } });
    fireEvent.change(screen.getByLabelText("Daily cap (KZT)"), { target: { value: "3000" } });
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
    await waitFor(() => expect(vi.mocked(api).mock.calls.some(([, options]) => options?.method === "POST")).toBe(true));
    const sent = JSON.parse(String(vi.mocked(api).mock.calls.find(([, options]) => options?.method === "POST")![1]!.body));
    expect(sent).toMatchObject({ kind: "parking", ratePerHourKzt: 500, freeMinutes: 15, dailyCapKzt: 3000 });
  });
});

