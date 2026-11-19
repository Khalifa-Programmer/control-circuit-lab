// Shared helpers for the suites.
export async function api(runtime, path, role, method = 'GET', body) {
  const init = { role, method };
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  const res = await runtime.fetch(path, init);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

/** A small working diagram: supply, breaker, push button and lamp. */
export function lampDoc() {
  return {
    v: 1,
    parts: [
      { id: 'p1', type: 'supply3', x: 80, y: 80, rot: 0, label: 'SUP1', props: {} },
      { id: 'p2', type: 'mcb1', x: 280, y: 80, rot: 0, label: 'Q1', props: { curve: 'C', rating: 6 } },
      { id: 'p3', type: 'pb_no', x: 480, y: 80, rot: 0, label: 'S1', props: {} },
      { id: 'p4', type: 'lamp', x: 680, y: 80, rot: 0, label: 'H1', props: { color: 'green' } },
    ],
    wires: [
      { id: 'w1', from: { part: 'p1', term: 'L1' }, to: { part: 'p2', term: '1' } },
      { id: 'w2', from: { part: 'p2', term: '2' }, to: { part: 'p3', term: '13' } },
      { id: 'w3', from: { part: 'p3', term: '14' }, to: { part: 'p4', term: 'X1' } },
      { id: 'w4', from: { part: 'p4', term: 'X2' }, to: { part: 'p1', term: 'N' } },
    ],
    plc: { rungs: [] },
    supply: { voltagePct: 100 },
  };
}
