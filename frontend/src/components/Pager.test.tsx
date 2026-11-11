import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Pager, usePaged } from "./Pager";

afterEach(cleanup);

function List({ items }: { items: string[] }) {
  const paged = usePaged(items, 3);
  return (
    <>
      <ul>{paged.visible.map((item) => <li key={item}>{item}</li>)}</ul>
      <Pager page={paged.page} pages={paged.pages} from={paged.from} to={paged.to} total={paged.total} onPage={paged.setPage} label="Items" />
    </>
  );
}
const names = (count: number) => Array.from({ length: count }, (_, index) => `item-${index + 1}`);

describe("paged lists", () => {
  it("shows one page at a time with a plain count and moves with Previous and Next", () => {
    render(<List items={names(7)} />);
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["item-1", "item-2", "item-3"]);
    expect(screen.getByText("1–3 of 7")).toBeTruthy();
    expect(screen.getByRole("button", { name: "← Previous" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next →" }));
    fireEvent.click(screen.getByRole("button", { name: "Next →" }));
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["item-7"]);
    expect(screen.getByText("Page 3 of 3")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next →" })).toBeDisabled();
  });
  it("returns to the first page when the list changes and hides itself when empty", () => {
    const { rerender } = render(<List items={names(7)} />);
    fireEvent.click(screen.getByRole("button", { name: "Next →" }));
    rerender(<List items={names(4)} />);
    expect(screen.getByText("1–3 of 4")).toBeTruthy();
    rerender(<List items={[]} />);
    expect(screen.queryByRole("navigation", { name: "Items pages" })).toBeNull();
  });
});
