// Executed inside the Yahoo page; reads rendered tables, never cookies or tokens.
export function capture() {
  return {
    url: location.href,
    title: document.title,
    filters: Object.fromEntries(
      Array.from(
        document.querySelectorAll<HTMLSelectElement>("#yspmain select"),
      ).map((s) => [s.name, s.value]),
    ),
    tables: Array.from(
      document.querySelectorAll<HTMLTableElement>("#yspmain table"),
    ).map((t) => ({
      caption: t.caption?.innerText || t.getAttribute("aria-label") || "",
      headers: Array.from(
        t.querySelectorAll("thead tr:last-child th,thead tr:last-child td"),
      ).map((x) => ({
        text: (x as HTMLElement).innerText,
        title: x.getAttribute("title") || "",
      })),
      rows: Array.from(t.querySelectorAll("tbody tr")).map((r) => ({
        cells: Array.from(r.querySelectorAll(":scope > td")).map(
          (c) => (c as HTMLElement).innerText,
        ),
        links: Array.from(r.querySelectorAll("a")).map((a) => ({
          text: a.innerText,
          url: a.href,
          id: a.id,
        })),
      })),
    })),
    links: Array.from(document.querySelectorAll("#yspmain a")).map((a) => ({
      text: (a as HTMLAnchorElement).innerText,
      url: (a as HTMLAnchorElement).href,
    })),
    text: (document.querySelector("#yspmain") as HTMLElement)?.innerText || "",
  };
}
