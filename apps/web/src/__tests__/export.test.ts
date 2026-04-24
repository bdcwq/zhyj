import { describe, it, expect } from "vitest";
import { streamCsv } from "@/lib/csv-stream";
import {
  exportResidentsQuerySchema,
  exportAppointmentsQuerySchema,
  exportMonitoringQuerySchema,
} from "@zhyj/shared";

// ── Helper: consume a ReadableStream into a string ──
async function streamToString(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  return result;
}

// ── Async iterable helper ──
async function* rowsFrom(data: string[][]): AsyncIterable<string[]> {
  for (const row of data) {
    yield row;
  }
}

describe("streamCsv", () => {
  it("should prepend UTF-8 BOM", async () => {
    const stream = streamCsv(["Col"], rowsFrom([]));
    // Collect raw bytes and check for UTF-8 BOM (EF BB BF)
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const combined = new Uint8Array(chunks.reduce((acc, c) => acc + c.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    expect(combined[0]).toBe(0xef);
    expect(combined[1]).toBe(0xbb);
    expect(combined[2]).toBe(0xbf);
  });

  it("should include header row after BOM", async () => {
    const stream = streamCsv(["Name", "Age", "City"], rowsFrom([]));
    const text = await streamToString(stream);
    // BOM + "Name,Age,City\r\n"
    expect(text).toContain("Name,Age,City\r\n");
  });

  it("should stream row data correctly", async () => {
    const stream = streamCsv(
      ["Name", "Age"],
      rowsFrom([
        ["Alice", "30"],
        ["Bob", "25"],
      ]),
    );
    const text = await streamToString(stream);
    expect(text).toContain("Alice,30\r\n");
    expect(text).toContain("Bob,25\r\n");
  });

  it("should escape fields containing commas per RFC 4180", async () => {
    const stream = streamCsv(
      ["Name", "Tags"],
      rowsFrom([["Alice", "a,b,c"]]),
    );
    const text = await streamToString(stream);
    expect(text).toContain('"a,b,c"\r\n');
  });

  it("should escape fields containing double-quotes per RFC 4180", async () => {
    const stream = streamCsv(
      ["Name", "Note"],
      rowsFrom([['Bob "The Builder"', "normal"]]),
    );
    const text = await streamToString(stream);
    // Double-quotes are doubled and the field is wrapped in quotes
    expect(text).toContain('"Bob ""The Builder""",normal\r\n');
  });

  it("should escape fields containing newlines per RFC 4180", async () => {
    const stream = streamCsv(
      ["Name", "Bio"],
      rowsFrom([["Carol", "Line1\nLine2"]]),
    );
    const text = await streamToString(stream);
    expect(text).toContain('"Line1\nLine2"\r\n');
  });

  it("should handle carriage returns in fields", async () => {
    const stream = streamCsv(
      ["Name", "Bio"],
      rowsFrom([["Dave", "Line1\rLine2"]]),
    );
    const text = await streamToString(stream);
    expect(text).toContain('"Line1\rLine2"\r\n');
  });

  it("should produce valid CSV with mixed escaping needs", async () => {
    const stream = streamCsv(
      ["Name", "Description"],
      rowsFrom([
        ["Simple", "no escaping needed"],
        ['Has "quotes" and, commas', "normal"],
        ["Has\nnewline", 'and "quotes"'],
      ]),
    );
    const text = await streamToString(stream);
    // First row - plain
    expect(text).toContain("Simple,no escaping needed\r\n");
    // Second row - commas and quotes
    expect(text).toContain('"Has ""quotes"" and, commas",normal\r\n');
    // Third row - newline and quotes
    expect(text).toContain('"Has\nnewline","and ""quotes"""\r\n');
  });

  it("should handle empty rows gracefully", async () => {
    const stream = streamCsv(
      ["A", "B"],
      rowsFrom([["", ""]]),
    );
    const text = await streamToString(stream);
    expect(text).toContain(",\r\n");
  });
});

describe("Export query schemas", () => {
  describe("exportResidentsQuerySchema", () => {
    it("should accept empty object", () => {
      const result = exportResidentsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("should accept search parameter", () => {
      const result = exportResidentsQuerySchema.safeParse({ search: "张三" });
      expect(result.success).toBe(true);
    });

    it("should reject numeric search", () => {
      const result = exportResidentsQuerySchema.safeParse({ search: 123 });
      expect(result.success).toBe(false);
    });
  });

  describe("exportAppointmentsQuerySchema", () => {
    it("should accept empty object", () => {
      const result = exportAppointmentsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("should accept all valid parameters", () => {
      const result = exportAppointmentsQuerySchema.safeParse({
        residentId: "res-001",
        status: "completed",
        dateFrom: "2024-01-01",
        dateTo: "2024-12-31",
      });
      expect(result.success).toBe(true);
    });

    it("should reject invalid status type", () => {
      const result = exportAppointmentsQuerySchema.safeParse({ status: 123 });
      expect(result.success).toBe(false);
    });

    it("should reject invalid dateFrom type", () => {
      const result = exportAppointmentsQuerySchema.safeParse({ dateFrom: 20240101 });
      expect(result.success).toBe(false);
    });
  });

  describe("exportMonitoringQuerySchema", () => {
    it("should accept empty object", () => {
      const result = exportMonitoringQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("should accept residentId", () => {
      const result = exportMonitoringQuerySchema.safeParse({ residentId: "res-001" });
      expect(result.success).toBe(true);
    });

    it("should reject numeric residentId", () => {
      const result = exportMonitoringQuerySchema.safeParse({ residentId: 123 });
      expect(result.success).toBe(false);
    });
  });
});
