// Bounded, byte-oriented persistent-shell marker parser. Marker scanning is
// independent from retained output, so large UTF-8 output cannot hide it.
export function createSentinelOutputParser({ marker, maxOutputBytes }) {
  const markerBytes = Buffer.from(marker, 'utf8');
  let scanTail = Buffer.alloc(0);
  let markerTail = Buffer.alloc(0);
  let outputBytes = 0;
  let retainedBytes = 0;
  let chunks = [];
  let result = null;
  const append = chunk => {
    outputBytes += chunk.length;
    if (retainedBytes >= maxOutputBytes || maxOutputBytes <= 0) return;
    const part = chunk.subarray(0, maxOutputBytes - retainedBytes);
    chunks.push(part);
    retainedBytes += part.length;
  };
  const markerResult = bytes => {
    const newline = bytes.indexOf(0x0a);
    if (newline < 0) return null;
    const match = bytes.subarray(0, newline).toString('ascii').trim().match(/^-?\d+/);
    result = {
      stdout: decodeUtf8Prefix(Buffer.concat(chunks)),
      exitCode: match ? Number.parseInt(match[0], 10) : 0,
      truncated: outputBytes > maxOutputBytes,
      outputBytes,
    };
    return result;
  };
  return {
    push(chunk) {
      if (result) return result;
      const input = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (markerTail.length > 0) {
        markerTail = Buffer.concat([markerTail, input]);
        const parsed = markerResult(markerTail);
        if (parsed) return parsed;
        if (markerTail.length > 256) markerTail = markerTail.subarray(-256);
        return null;
      }
      const combined = Buffer.concat([scanTail, input]);
      const index = combined.indexOf(markerBytes);
      if (index < 0) {
        const keep = Math.max(markerBytes.length - 1, 0);
        const split = Math.max(0, combined.length - keep);
        append(combined.subarray(0, split));
        scanTail = combined.subarray(split);
        return null;
      }
      append(combined.subarray(0, index));
      scanTail = Buffer.alloc(0);
      markerTail = combined.subarray(index + markerBytes.length);
      const parsed = markerResult(markerTail);
      if (parsed) return parsed;
      if (markerTail.length > 256) markerTail = markerTail.subarray(-256);
      return null;
    },
    snapshot() {
      return { stdout: decodeUtf8Prefix(Buffer.concat(chunks)), outputBytes, truncated: outputBytes > maxOutputBytes };
    },
  };
}

export function createBoundedUtf8Collector(maxBytes) {
  let totalBytes = 0;
  let retainedBytes = 0;
  const chunks = [];
  return {
    push(chunk) {
      const input = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += input.length;
      if (maxBytes <= 0 || retainedBytes >= maxBytes) return;
      const part = input.subarray(0, maxBytes - retainedBytes);
      chunks.push(part);
      retainedBytes += part.length;
    },
    snapshot() { return { text: decodeUtf8Prefix(Buffer.concat(chunks)), totalBytes, truncated: totalBytes > maxBytes }; },
  };
}

export function decodeUtf8Prefix(buffer) {
  let end = buffer.length;
  if (end === 0) return '';
  let start = end - 1;
  while (start >= 0 && (buffer[start] & 0xc0) === 0x80) start--;
  if (start >= 0) {
    const lead = buffer[start];
    const expected = lead < 0x80 ? 1 : lead >= 0xf0 ? 4 : lead >= 0xe0 ? 3 : 2;
    if (end - start < expected) end = start;
  }
  return buffer.subarray(0, end).toString('utf8');
}
