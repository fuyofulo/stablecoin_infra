/** Lightweight CSV parse for preview (quoted fields, commas). */
export function parseCsvPreview(text: string, maxRows = 12): { headers: string[]; rows: string[][]; rowCount: number; parseError?: string } {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (!lines.length) {
    return { headers: [], rows: [], rowCount: 0, parseError: 'Paste CSV rows or upload content first.' };
  }

  function parseLine(line: string): string[] {
    const out: string[] = [];
    let cur = '';
    let i = 0;
    let inQuotes = false;
    while (i < line.length) {
      const c = line[i]!;
      if (inQuotes) {
        if (c === '"') {
          if (line[i + 1] === '"') {
            cur += '"';
            i += 2;
            continue;
          }
          inQuotes = false;
          i += 1;
          continue;
        }
        cur += c;
        i += 1;
        continue;
      }
      if (c === '"') {
        inQuotes = true;
        i += 1;
        continue;
      }
      if (c === ',') {
        out.push(cur.trim());
        cur = '';
        i += 1;
        continue;
      }
      cur += c;
      i += 1;
    }
    out.push(cur.trim());
    return out;
  }

  try {
    const headers = parseLine(lines[0]!);
    const dataLines = lines.slice(1);
    const rows = dataLines.slice(0, maxRows).map(parseLine);
    return { headers, rows, rowCount: dataLines.length };
  } catch {
    return { headers: [], rows: [], rowCount: 0, parseError: 'Could not parse CSV.' };
  }
}
