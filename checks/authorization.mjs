import { startRuntime, expect } from '/home/user/oss-new/control/runtime/index.mjs';
import { api, lampDoc } from './lib.mjs';

const runtime = await startRuntime();
try {
  // Anonymous and outsider are refused everywhere; members get in.
  await runtime.assertPrivateAccess(['/', '/learn', '/gallery', '/api/projects', '/api/gallery', '/api/examples']);

  // Member's private project and diagram
  const created = await api(runtime, '/api/projects', 'member', 'POST', { name: 'Private panel' });
  expect(created.status).toBe(201);
  const pid = created.json.project.id;
  const did = created.json.project.diagrams[0].id;
  const d = (await api(runtime, `/api/diagrams/${did}`, 'member')).json.diagram;
  expect((await api(runtime, `/api/diagrams/${did}`, 'member', 'PUT', { doc: lampDoc(), version: d.version })).status).toBe(200);

  // Another member (owner role) can neither read nor change it.
  expect((await api(runtime, `/api/projects/${pid}`, 'owner')).status).toBe(404);
  expect((await api(runtime, `/api/diagrams/${did}`, 'owner')).status).toBe(404);
  expect((await api(runtime, `/api/diagrams/${did}`, 'owner', 'PUT', { doc: lampDoc(), version: d.version + 1 })).status).toBe(404);
  expect((await api(runtime, `/api/projects/${pid}`, 'owner', 'DELETE')).status).toBe(404);
  expect((await api(runtime, '/api/gallery', 'owner', 'POST', { diagramId: did, title: 'Stolen', description: '' })).status).toBe(404);
  const ownerList = await api(runtime, '/api/projects', 'owner');
  expect(ownerList.text).not.toContain('Private panel');
  // Still there for its owner
  expect((await api(runtime, `/api/projects/${pid}`, 'member')).status).toBe(200);
  expect((await api(runtime, `/api/diagrams/${did}`, 'member')).json.diagram.doc.parts.length).toBe(4);

  // Outsiders reach no object
  expect([401, 403]).toContain((await api(runtime, `/api/diagrams/${did}`, 'outsider')).status);
  expect([401, 403]).toContain((await runtime.fetch(`/api/diagrams/${did}`)).status);

  // Gallery: author-only update/unpublish, admin may remove any post
  const ownerProj = await api(runtime, '/api/projects', 'owner', 'POST', { name: 'Owner bench' });
  const ownerDid = ownerProj.json.project.diagrams[0].id;
  const ownerPost = await api(runtime, '/api/gallery', 'owner', 'POST', { diagramId: ownerDid, title: 'Owner circuit', description: 'x' });
  expect(ownerPost.status).toBe(201);
  const opid = ownerPost.json.post.id;
  expect((await api(runtime, `/api/gallery/${opid}`, 'member', 'DELETE')).status).toBe(403);
  expect((await api(runtime, `/api/gallery/${opid}`, 'member', 'PATCH', { title: 'Hijacked', description: '' })).status).toBe(403);
  expect((await api(runtime, `/api/gallery/${opid}`, 'member')).json.post.title).toBe('Owner circuit');

  const memberPost = await api(runtime, '/api/gallery', 'member', 'POST', { diagramId: did, title: 'Member circuit', description: 'y' });
  const mpid = memberPost.json.post.id;
  expect((await api(runtime, `/api/gallery/${mpid}`, 'member', 'PATCH', { title: 'Member circuit v2', description: 'y' })).status).toBe(200);
  // Admin (organization owner) removes another member's post
  expect((await api(runtime, `/api/gallery/${mpid}`, 'owner', 'DELETE')).status).toBe(200);
  expect((await api(runtime, `/api/gallery/${mpid}`, 'member')).status).toBe(404);
  // Gallery posts expose no private diagram or project ids
  const post = await api(runtime, `/api/gallery/${opid}`, 'member');
  expect(post.text).not.toContain(ownerDid);
  expect(post.text).not.toContain(ownerProj.json.project.id);
  // One vote per member; can't vote on own post
  expect((await api(runtime, `/api/gallery/${opid}/vote`, 'owner', 'POST', {})).status).toBe(403);
  expect((await api(runtime, `/api/gallery/${opid}/vote`, 'member', 'POST', {})).json.votes).toBe(1);
  expect((await api(runtime, `/api/gallery/${opid}/vote`, 'outsider', 'POST', {})).status).not.toBe(200);
  expect((await api(runtime, `/api/gallery/${opid}`, 'owner')).json.post.votes).toBe(1);

  // In the browser, another member's project is not found
  const ctx = await runtime.context('owner');
  const page = await ctx.newPage();
  await page.goto(`/projects/${pid}`);
  await expect(page.getByText('Private panel')).toHaveCount(0);
  await expect(page.getByTestId('not-found')).toBeVisible();
  await page.goto(`/projects/${pid}/diagrams/${did}`);
  await expect(page.getByTestId('canvas')).toHaveCount(0);
  await expect(page.getByTestId('not-found')).toBeVisible();
  await ctx.close();

  // No sign-in page of its own
  for (const path of ['/login', '/signin', '/sign-in', '/signup', '/register', '/logout']) {
    const res = await runtime.fetch(path, { role: 'member' });
    const body = await res.text();
    expect(res.status).not.toBe(200);
    expect(body).not.toMatch(/type=["']password["']/i);
  }
  console.log('authorization: ok');
} finally {
  await runtime.close();
}
