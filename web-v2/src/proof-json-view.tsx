import type { ReactNode } from 'react';

function JsonNode({ name, value, depth }: { name: string; value: unknown; depth: number }): ReactNode {
  if (value === null || value === undefined) {
    return (
      <div className="proof-json-line" style={{ paddingLeft: depth * 12 }}>
        <span className="proof-json-key">{name}</span>
        <span className="proof-json-val"> {String(value)}</span>
      </div>
    );
  }
  if (Array.isArray(value)) {
    if (!value.length) {
      return (
        <div className="proof-json-line" style={{ paddingLeft: depth * 12 }}>
          <span className="proof-json-key">{name}</span>
          <span className="proof-json-val"> []</span>
        </div>
      );
    }
    return (
      <details open={depth < 2} className="proof-json-block">
        <summary>
          {name} <span className="proof-json-val">({value.length} items)</span>
        </summary>
        {value.map((item, i) => (
          <JsonNode key={i} name={`[${i}]`} value={item} depth={depth + 1} />
        ))}
      </details>
    );
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (!entries.length) {
      return (
        <div className="proof-json-line" style={{ paddingLeft: depth * 12 }}>
          <span className="proof-json-key">{name}</span>
          <span className="proof-json-val"> {'{}'}</span>
        </div>
      );
    }
    return (
      <details open={depth < 2} className="proof-json-block">
        <summary>{name}</summary>
        {entries.map(([k, v]) => (
          <JsonNode key={k} name={k} value={v} depth={depth + 1} />
        ))}
      </details>
    );
  }
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return (
    <div className="proof-json-line" style={{ paddingLeft: depth * 12 }}>
      <span className="proof-json-key">{name}</span>
      <span className="proof-json-val"> {text}</span>
    </div>
  );
}

export function ProofJsonView({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="proof-json-root">
      {Object.entries(data).map(([k, v]) => (
        <JsonNode key={k} name={k} value={v} depth={0} />
      ))}
    </div>
  );
}
