/**
 * CSV streaming utility.
 *
 * Produces a `ReadableStream` of CSV text from an async iterable of row arrays.
 * Prepends a UTF-8 BOM for Excel compatibility and implements RFC 4180 field escaping.
 */

const encoder = new TextEncoder();
const BOM = "\uFEFF";

/**
 * Escape a single CSV field per RFC 4180.
 * - Fields containing commas, double-quotes, or newlines are wrapped in double-quotes.
 * - Any double-quote characters within the field are doubled (" → "").
 */
function escapeField(field: string): string {
  if (field.includes(",") || field.includes('"') || field.includes("\n") || field.includes("\r")) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

/**
 * Convert a row (string array) into a CSV line (with trailing CRLF).
 */
function rowToLine(row: string[]): string {
  return row.map(escapeField).join(",") + "\r\n";
}

/**
 * Stream CSV data from an async iterable of row arrays.
 *
 * @param headers - Column header names for the first row.
 * @param rows - Async iterable of string arrays (one per data row).
 * @returns A `ReadableStream<Uint8Array>` producing the full CSV text.
 *
 * @example
 * ```ts
 * const stream = streamCsv(
 *   ["Name", "Age"],
 *   (async function* () {
 *     yield ["Alice", "30"];
 *     yield ['Bob "The Builder"', "25"];
 *   })(),
 * );
 *
 * const response = new Response(stream, {
 *   headers: { "Content-Type": "text/csv; charset=utf-8" },
 * });
 * ```
 */
export function streamCsv(headers: string[], rows: AsyncIterable<string[]>): ReadableStream<Uint8Array> {
  const headerLine = rowToLine(headers);
  const bomBytes = encoder.encode(BOM);
  const headerBytes = encoder.encode(headerLine);

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // BOM + header row first
        controller.enqueue(bomBytes);
        controller.enqueue(headerBytes);

        // Stream data rows
        for await (const row of rows) {
          const line = rowToLine(row);
          controller.enqueue(encoder.encode(line));
        }

        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}
