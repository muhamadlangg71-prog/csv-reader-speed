// Fast drop-in for csv-reader 1.0.0 (make.fun's own CSV reader).
// run(input) returns exactly csv-reader's answer for {text, header}:
// {columns, rows, errors}. The reference reads one character at a time;
// this one scans with indexOf and slices fields in bulk, and only falls
// back to a character loop for the rare broken-field cases (a stray CR in
// an unquoted field, an unterminated quote, junk after a closing quote).
//
// Semantics (csv-reader's, kept exactly):
// - a U+FEFF at the very start is dropped;
// - a record ends at LF or CRLF; a line left with no characters is no record;
// - outside quotes a CR not followed by LF is dropped (stray_cr);
// - a field opening with a quote runs to the next quote that is not doubled
//   ("" inside is one quote; each CRLF or lone CR inside is read as LF);
//   what follows its closing quote, up to the next comma or line break, is
//   appended as it stands (quote_junk, when the field ends); a quote that
//   never closes is a literal character and the text after it is read again
//   as unquoted (unterminated_quote);
// - a quote inside an unquoted field is a literal character;
// - fields stay strings, never trimmed or converted;
// - columns is the first record when header is true, else null; rows holds
//   the records after it, each padded with "" (short_row, with fields: its
//   count) or cut (long_row, with extra: the cut fields) to the first
//   record's width;
// - each error is {code, line, row}, in the order met; line is the 1-based
//   line its record starts on (every LF, CRLF and lone CR inside quotes
//   counted), row its record's index in rows (null for the header).
//
// Pure: no clock, no randomness, no locale, nothing kept from one call
// to the next. Deterministic: the same input always gives the same answer.

const COMMA = 0; // a field ended at a comma: the record goes on
const BREAK = 1; // a field ended at a line break: the record ends
const END = 2; // a field ended at the end of the text: the record ends

/** csv-reader 1.0.0's answer for one case's input, {text, header}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  const n = text.length;
  let pos = 0;
  let line = 1;
  if (n > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it
  // takes (null: the header). Error helpers read these as they stand.
  let recordLine = 1;
  let recordRow = null;

  // Reads unquoted characters onto `init` up to the next comma or line
  // break, one character at a time: a CR not followed by LF is dropped
  // (stray_cr). Only used when the fast path finds a stray CR in the
  // field; `added` counts the characters kept.
  function readUnquotedSlow(init) {
    let value = init;
    let added = 0;
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 44) {
        pos += 1;
        return { value, ended: COMMA, added };
      }
      if (c === 10) {
        pos += 1;
        line += 1;
        return { value, ended: BREAK, added };
      }
      if (c === 13) {
        if (text.charCodeAt(pos + 1) === 10) {
          pos += 2;
          line += 1;
          return { value, ended: BREAK, added };
        }
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        pos += 1;
        continue;
      }
      value += text[pos];
      added += 1;
      pos += 1;
    }
    return { value, ended: END, added };
  }

  // Reads an unquoted field starting at pos. Fast path: the next comma or
  // LF bounds the field, so the field is one slice; a CR in it is either
  // the trailing half of a CRLF (stripped, no error) or a stray CR, which
  // goes to the slow character loop above.
  function readUnquoted(init) {
    const cIdx = text.indexOf(',', pos);
    const nIdx = text.indexOf('\n', pos);
    let end;
    let ended;
    if (cIdx === -1 && nIdx === -1) {
      end = n;
      ended = END;
    } else if (cIdx === -1) {
      end = nIdx;
      ended = BREAK;
    } else if (nIdx === -1) {
      end = cIdx;
      ended = COMMA;
    } else if (cIdx < nIdx) {
      end = cIdx;
      ended = COMMA;
    } else {
      end = nIdx;
      ended = BREAK;
    }
    const slice = text.slice(pos, end);
    const r = slice.indexOf('\r');
    if (r === -1) {
      pos = end + (ended === END ? 0 : 1);
      if (ended === BREAK) line += 1;
      return { value: init + slice, ended, added: slice.length };
    }
    if (ended === BREAK && r === slice.length - 1) {
      // The only CR is the trailing half of a CRLF.
      pos = end + 1;
      line += 1;
      return { value: init + slice.slice(0, -1), ended: BREAK, added: slice.length - 1 };
    }
    return readUnquotedSlow(init);
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    // The closing quote is the next quote that is not doubled.
    let q = text.indexOf('"', pos + 1);
    while (q !== -1 && text.charCodeAt(q + 1) === 34) {
      q = text.indexOf('"', q + 2);
    }
    if (q === -1) {
      // The quote never closes: it is a literal character, and the text
      // after it is read again as unquoted.
      pos = open + 1;
      line = openLine;
      errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
      return readUnquoted('"');
    }
    const content = text.slice(pos + 1, q);
    const hasDQ = content.indexOf('"') !== -1;
    const hasCR = content.indexOf('\r') !== -1;
    const hasLF = content.indexOf('\n') !== -1;
    let value;
    if (!hasDQ && !hasCR && !hasLF) {
      value = content;
    } else if (!hasDQ && !hasCR) {
      // Only embedded LFs: they stay, and each one is a line.
      value = content;
      let c = 0;
      let i = content.indexOf('\n');
      while (i !== -1) {
        c += 1;
        i = content.indexOf('\n', i + 1);
      }
      line += c;
    } else if (!hasCR && !hasLF) {
      // Only doubled quotes: one replace, no line change.
      value = content.replace(/""/g, '"');
    } else {
      // Doubled quotes and/or CRs and LFs: one replace does the whole
      // transform ("" -> ", CRLF or lone CR -> LF) and counts the lines.
      let inc = 0;
      value = content.replace(/""|\r\n|\r|\n/g, (m) => {
        if (m === '""') return '"';
        inc += 1;
        return '\n';
      });
      line += inc;
    }
    const after = q + 1;
    if (after >= n) {
      pos = n;
      return { value, ended: END };
    }
    const c = text.charCodeAt(after);
    if (c === 44) {
      pos = after + 1;
      return { value, ended: COMMA };
    }
    if (c === 10) {
      pos = after + 1;
      line += 1;
      return { value, ended: BREAK };
    }
    if (c === 13 && text.charCodeAt(after + 1) === 10) {
      pos = after + 2;
      line += 1;
      return { value, ended: BREAK };
    }
    // What follows the closing quote is appended as it stands, up to the
    // next comma or line break.
    pos = after;
    const junk = readUnquoted(value);
    if (junk.added > 0) {
      errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
    }
    return junk;
  }

  // Applies a record's fields: the first record sets the width (and is the
  // header when header is true); later records are padded with "" (short_row)
  // or cut (long_row) to that width. A record that held only stray CRs is
  // left with no characters and is no record; that is checked by the caller.
  function finishRecord(fields) {
    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      return;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // Fast path: a record with no quotes and no stray CR is one whole line.
    // Find its end (the next LF, or the end of the text), and if the line
    // holds no quote and no CR other than a trailing CRLF, split it into
    // fields in bulk. A quote or a stray CR falls through to the
    // field-by-field reader below, which handles broken rows exactly.
    const lineEnd = text.indexOf('\n', pos);
    const lineEndPos = lineEnd === -1 ? n : lineEnd;
    const rawLine = text.slice(pos, lineEndPos);
    if (rawLine.indexOf('"') === -1) {
      const crIdx = rawLine.indexOf('\r');
      if (crIdx === -1) {
        const fields = rawLine.split(',');
        pos = lineEnd === -1 ? n : lineEnd + 1;
        if (lineEnd !== -1) line += 1;
        finishRecord(fields);
        continue;
      }
      if (lineEnd !== -1 && crIdx === rawLine.length - 1) {
        // Only a trailing CRLF.
        const fields = rawLine.slice(0, -1).split(',');
        pos = lineEnd + 1;
        line += 1;
        finishRecord(fields);
        continue;
      }
    }

    const fields = [];
    let field;
    let quoted;
    do {
      quoted = text.charCodeAt(pos) === 34;
      field = quoted ? readQuoted() : readUnquoted('');
      fields.push(field.value);
    } while (field.ended === COMMA);

    // A line that held only stray CRs is left with no characters: no
    // record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    finishRecord(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
