import {
  Children,
  cloneElement,
  isValidElement,
  useState,
  type ReactElement,
  type ReactNode,
  type TableHTMLAttributes,
} from "react";
import { compareValues, sortValue, type TableSort } from "../shared/tableSort";

type Element = ReactElement<Record<string, any>>;
const elements = (children: ReactNode) =>
  Children.toArray(children).filter(isValidElement) as Element[];
function text(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number")
        return String(child);
      return isValidElement<{ children?: ReactNode }>(child)
        ? text(child.props.children)
        : "";
    })
    .join("");
}
export function SortableTable({
  children,
  pageSize,
  page = 0,
  onPageChange,
  ...props
}: TableHTMLAttributes<HTMLTableElement> & {
  pageSize?: number;
  page?: number;
  onPageChange?: (page: number) => void;
}) {
  const [sort, setSort] = useState<TableSort | null>(null);
  function select(column: number) {
    setSort((old) => ({
      column,
      direction:
        old?.column === column && old.direction === "ascending"
          ? "descending"
          : "ascending",
    }));
    onPageChange?.(0);
  }
  return (
    <table {...props}>
      {elements(children).map((section) => {
        if (section.type === "thead")
          return cloneElement(
            section,
            {},
            elements(section.props.children).map((row) =>
              cloneElement(
                row,
                {},
                elements(row.props.children).map((cell, column) =>
                  cloneElement(
                    cell,
                    {
                      scope: "col",
                      "aria-sort":
                        sort?.column === column ? sort.direction : "none",
                    },
                    <button
                      type="button"
                      className="table-sort"
                      onClick={() => select(column)}
                      aria-label={`Sort by ${Children.toArray(cell.props.children).map(text).join(" ")}${sort?.column === column && sort.direction === "ascending" ? " descending" : " ascending"}`}
                    >
                      <span>{cell.props.children}</span>
                      <span className="sort-indicator" aria-hidden="true">
                        {sort?.column === column
                          ? sort.direction === "ascending"
                            ? "↑"
                            : "↓"
                          : "↕"}
                      </span>
                    </button>,
                  ),
                ),
              ),
            ),
          );
        if (section.type !== "tbody") return section;
        let rows = elements(section.props.children);
        if (sort)
          rows = rows
            .map((row, index) => {
              const cell = elements(row.props.children)[sort.column];
              const value =
                cell && Object.hasOwn(cell.props, "data-sort-value")
                  ? cell.props["data-sort-value"]
                  : text(cell?.props.children);
              return { row, index, value: sortValue(value) };
            })
            .sort(
              (a, b) =>
                compareValues(a.value, b.value, sort.direction) ||
                a.index - b.index,
            )
            .map(({ row }) => row);
        // Sort the entire filtered set before choosing a page.
        if (pageSize) rows = rows.slice(page * pageSize, (page + 1) * pageSize);
        return cloneElement(section, {}, rows);
      })}
    </table>
  );
}
