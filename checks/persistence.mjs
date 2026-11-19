import { startRuntime, expect } from '/home/user/oss-new/control/runtime/index.mjs';
import { api, lampDoc } from './lib.mjs';

const runtime = await startRuntime();
try {
  const created = await api(runtime, '/api/projects', 'member', 'POST', { name: 'Durable panel' });
  const pid = created.json.project.id;
  const did = created.json.project.diagrams[0].id;
  const d = (await api(runtime, `/api/diagrams/${did}`, 'member')).json.diagram;
  const doc = lampDoc();
  doc.plc.rungs.push({ id: 'r1', branches: [[{ addr: 'I1', nc: false }]], coil: { kind: 'coil', target: 'Q1', preset: 0 } });
  expect((await api(runtime, `/api/diagrams/${did}`, 'member', 'PUT', { doc, version: d.version })).status).toBe(200);
  const post = await api(runtime, '/api/gallery', 'member', 'POST', { diagramId: did, title: 'Durable lamp', description: 'kept' });
  await api(runtime, `/api/gallery/${post.json.post.id}/vote`, 'owner', 'POST', {});

  await runtime.restart();

  const projects = await api(runtime, '/api/projects', 'member');
  expect(projects.json.projects.map((p) => p.name)).toContain('Durable panel');
  const back = await api(runtime, `/api/diagrams/${did}`, 'member');
  expect(back.json.diagram.doc.parts.map((p) => p.label)).toEqual(['SUP1', 'Q1', 'S1', 'H1']);
  expect(back.json.diagram.doc.plc.rungs.length).toBe(1);
  const p = await api(runtime, `/api/gallery/${post.json.post.id}`, 'owner');
  expect(p.json.post.title).toBe('Durable lamp');
  expect(p.json.post.votes).toBe(1);

  const page = await (await runtime.context('member')).newPage();
  await page.goto(`/projects/${pid}/diagrams/${did}`);
  await expect(page.getByTestId('part-H1')).toBeVisible();
  console.log('persistence: ok');
} finally {
  await runtime.close();
}
