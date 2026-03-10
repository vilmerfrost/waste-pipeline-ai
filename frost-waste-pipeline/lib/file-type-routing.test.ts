import { describe, it, expect } from "vitest";
import { getFileTypeRoute } from "@/lib/file-type-routing";

describe("getFileTypeRoute", () => {
  it("routes .csv to excel path", () => {
    expect(getFileTypeRoute("report.csv")).toBe("excel");
    expect(getFileTypeRoute("data.CSV")).toBe("excel");
  });

  it("routes .png, .jpg, .jpeg to image path", () => {
    expect(getFileTypeRoute("scan.png")).toBe("image");
    expect(getFileTypeRoute("photo.jpg")).toBe("image");
    expect(getFileTypeRoute("photo.JPEG")).toBe("image");
  });

  it("routes .pdf to pdf path", () => {
    expect(getFileTypeRoute("document.pdf")).toBe("pdf");
    expect(getFileTypeRoute("report.PDF")).toBe("pdf");
  });

  it("routes .xlsx and .xls to excel path", () => {
    expect(getFileTypeRoute("spreadsheet.xlsx")).toBe("excel");
    expect(getFileTypeRoute("legacy.xls")).toBe("excel");
  });

  it("unknown extension falls through to pdf", () => {
    expect(getFileTypeRoute("file.doc")).toBe("pdf");
    expect(getFileTypeRoute("file.txt")).toBe("pdf");
  });
});
