import { readFile } from 'node:fs/promises';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startRuntime, expect } from '/home/user/oss-new/control/runtime/index.mjs';
import { api, lampDoc } from './lib.mjs';

const runtime = await startRuntime();
try {
  // ---- F005 + F001 request level: projects, diagrams, saving with a version check
  const created = await api(runtime, '/api/projects', 'member', 'POST', { name: 'Workshop bench' });
  expect(created.status).toBe(201);
  const project = created.json.project;
  expect(project.name).toBe('Workshop bench');
  expect(project.diagrams.length).toBe(1);
  const diagramId = project.diagrams[0].id;
  const listed = await api(runtime, '/api/projects', 'member');
  expect(listed.status).toBe(200);
  expect(listed.json.projects.map((p) => p.name)).toContain('Workshop bench');

  const got = await api(runtime, `/api/diagrams/${diagramId}`, 'member');
  expect(got.status).toBe(200);
  const saved = await api(runtime, `/api/diagrams/${diagramId}`, 'member', 'PUT', { doc: lampDoc(), version: got.json.diagram.version });
  expect(saved.status).toBe(200);
  const stale = await api(runtime, `/api/diagrams/${diagramId}`, 'member', 'PUT', { doc: lampDoc(), version: got.json.diagram.version });
  expect(stale.status).toBe(409);
  const invalid = await api(runtime, `/api/diagrams/${diagramId}`, 'member', 'PUT', { doc: { nonsense: true }, version: saved.json.diagram.version });
  expect(invalid.status).toBe(400);
  const reread = await api(runtime, `/api/diagrams/${diagramId}`, 'member');
  expect(reread.json.diagram.doc.parts.map((p) => p.label)).toEqual(['SUP1', 'Q1', 'S1', 'H1']);

  // ---- F004 request level: examples open as a new project; originals unchanged
  const examples = await api(runtime, '/api/examples', 'member');
  expect(examples.status).toBe(200);
  const slugs = examples.json.examples.map((e) => e.slug);
  for (const slug of ['dol-start', 'forward-reverse', 'star-delta-auto', 'plc-start-stop', 'mains-generator', 'liquid-level']) expect(slugs).toContain(slug);
  const opened = await api(runtime, '/api/examples/dol-start/open', 'member', 'POST', {});
  expect(opened.status).toBe(201);
  const copyDiagram = opened.json.project.diagrams[0].id;
  const copyDoc = (await api(runtime, `/api/diagrams/${copyDiagram}`, 'member')).json.diagram;
  await api(runtime, `/api/diagrams/${copyDiagram}`, 'member', 'PUT', { doc: { ...copyDoc.doc, parts: [] }, version: copyDoc.version });
  const again = await api(runtime, '/api/examples/dol-start/open', 'member', 'POST', {});
  const againDoc = (await api(runtime, `/api/diagrams/${again.json.project.diagrams[0].id}`, 'member')).json.diagram.doc;
  expect(againDoc.parts.length).toBeGreaterThan(4);

  // ---- F006 request level: publish, list, search, vote toggle, update
  const pub = await api(runtime, '/api/gallery', 'member', 'POST', { diagramId, title: 'Bench lamp test', description: 'One button lights a green lamp.' });
  expect(pub.status).toBe(201);
  const postId = pub.json.post.id;
  const ownVote = await api(runtime, `/api/gallery/${postId}/vote`, 'member', 'POST', {});
  expect(ownVote.status).toBe(403);
  const v1 = await api(runtime, `/api/gallery/${postId}/vote`, 'owner', 'POST', {});
  expect(v1.status).toBe(200);
  expect(v1.json).toMatchObject({ votes: 1, voted: true });
  const v2 = await api(runtime, `/api/gallery/${postId}/vote`, 'owner', 'POST', {});
  expect(v2.json).toMatchObject({ votes: 0, voted: false });
  await api(runtime, `/api/gallery/${postId}/vote`, 'owner', 'POST', {});
  const search = await api(runtime, '/api/gallery?q=lamp&sort=votes', 'owner');
  expect(search.json.posts.map((p) => p.title)).toContain('Bench lamp test');
  const none = await api(runtime, '/api/gallery?q=zzzz-nothing', 'owner');
  expect(none.json.posts.length).toBe(0);
  // Snapshot: later edits to the diagram don't change the post.
  const cur = (await api(runtime, `/api/diagrams/${diagramId}`, 'member')).json.diagram;
  await api(runtime, `/api/diagrams/${diagramId}`, 'member', 'PUT', { doc: { ...cur.doc, parts: cur.doc.parts.slice(0, 1), wires: [] }, version: cur.version });
  const post = await api(runtime, `/api/gallery/${postId}`, 'owner');
  expect(post.status).toBe(200);
  expect(post.json.post.doc.parts.length).toBe(4);
  expect(post.json.post.votes).toBe(1);

  // ---- Browser journey
  const ctx = await runtime.context('member');
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
  await runtime.assertBackLink(page);

  // F005: create a project, add / rename / duplicate / reorder / delete diagrams
  await page.getByTestId('new-project').click();
  await page.getByLabel('Project name').fill('Conveyor line 2');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { name: 'Conveyor line 2' })).toBeVisible();
  await expect(page.getByTestId('diagram-row')).toHaveCount(1);
  await page.getByTestId('add-diagram').click();
  await page.getByLabel('Diagram name').fill('Control circuit');
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByTestId('diagram-row')).toHaveCount(2);
  await page.getByRole('button', { name: 'Actions for Control circuit' }).click();
  await page.getByRole('menuitem', { name: 'Duplicate' }).click();
  await expect(page.getByTestId('diagram-row')).toHaveCount(3);
  await expect(page.getByTestId('diagram-row').nth(2)).toContainText('Control circuit (copy)');
  await page.getByRole('button', { name: 'Actions for Control circuit (copy)' }).click();
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  await page.getByLabel('Diagram name').fill('Spare circuit');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('diagram-row').nth(2)).toContainText('Spare circuit');
  await page.getByRole('button', { name: 'Actions for Spare circuit' }).click();
  await page.getByRole('menuitem', { name: 'Move up' }).click();
  await expect(page.getByTestId('diagram-row').nth(1)).toContainText('Spare circuit');
  await page.getByRole('button', { name: 'Actions for Spare circuit' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByTestId('diagram-row')).toHaveCount(2);

  // F001: build a lamp circuit in the editor
  await page.getByRole('link', { name: 'Control circuit' }).click();
  await expect(page.getByTestId('canvas')).toBeVisible();
  for (const type of ['supply3', 'mcb1', 'pb_no', 'lamp']) await page.getByTestId(`palette-${type}`).click();
  await expect(page.getByTestId('part-H1')).toBeVisible();
  const wire = async (a, b) => {
    await page.getByTestId(a).click();
    await page.getByTestId(b).click();
  };
  await wire('term-SUP1-L1', 'term-Q1-1');
  await wire('term-Q1-2', 'term-S1-13');
  await wire('term-S1-14', 'term-H1-X1');
  await wire('term-H1-X2', 'term-SUP1-N');
  await expect(page.getByTestId('wire')).toHaveCount(4);
  // properties and labels
  await page.getByTestId('part-H1').click();
  await page.getByTestId('prop-label').fill('H7');
  await page.getByTestId('prop-color').selectOption('red');
  await page.getByTestId('part-Q1').click();
  await page.getByTestId('prop-curve').selectOption('B');
  await page.getByTestId('prop-rating').fill('10');
  // rotate and delete
  await page.getByTestId('palette-terminal').click();
  await page.getByTestId('rotate-part').click();
  await expect(page.getByTestId('part-X1')).toHaveAttribute('data-rot', '90');
  await page.getByTestId('delete-part').click();
  await expect(page.getByTestId('part-X1')).toHaveCount(0);
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 10000 });
  await page.reload();
  await expect(page.getByTestId('part-H7')).toBeVisible();
  await expect(page.getByTestId('wire')).toHaveCount(4);
  await page.getByTestId('part-Q1').click();
  await expect(page.getByTestId('prop-curve')).toHaveValue('B');

  // F002: simulate: hold the button, the lamp lights; release, it goes out
  await page.getByTestId('sim-toggle').click();
  await expect(page.getByTestId('sim-toggle')).toHaveText(/Stop/);
  await page.getByTestId('part-S1').hover();
  await page.mouse.down();
  await expect(page.getByTestId('part-H7')).toHaveAttribute('data-lit', 'true');
  await expect(page.getByTestId('wire').first()).toHaveAttribute('data-phase', 'L1');
  await page.mouse.up();
  await expect(page.getByTestId('part-H7')).toHaveAttribute('data-lit', 'false');
  await page.getByTestId('sim-toggle').click();
  await expect(page.getByTestId('sim-toggle')).toHaveText(/Simulate/);

  // F007: export JSON, SVG, PNG and PDF
  const exportAs = async (name) => {
    await page.getByTestId('export-menu').click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name }).click()]);
    return download;
  };
  const jsonDl = await exportAs('Project file (.json)');
  expect(jsonDl.suggestedFilename()).toMatch(/\.json$/);
  const jsonText = await readFile(await jsonDl.path(), 'utf8');
  expect(JSON.parse(jsonText).doc.parts.map((p) => p.label)).toContain('H7');
  const svgDl = await exportAs('Image (.svg)');
  expect(svgDl.suggestedFilename()).toMatch(/\.svg$/);
  expect(await readFile(await svgDl.path(), 'utf8')).toContain('<svg');
  const pngDl = await exportAs('Image (.png)');
  expect((await readFile(await pngDl.path())).subarray(1, 4).toString()).toBe('PNG');
  const pdfDl = await exportAs('PDF');
  expect((await readFile(await pdfDl.path())).subarray(0, 5).toString()).toBe('%PDF-');

  // F007: import the file as a new diagram; a bad file is refused
  await page.getByTestId('back-to-project').click();
  await expect(page.getByTestId('diagram-row')).toHaveCount(2);
  const good = join(tmpdir(), 'imported-circuit.json');
  await writeFile(good, jsonText);
  await page.getByTestId('import-file').setInputFiles(good);
  await expect(page.getByTestId('diagram-row')).toHaveCount(3);
  const bad = join(tmpdir(), 'broken.json');
  await writeFile(bad, '{"hello": 1}');
  await page.getByTestId('import-file').setInputFiles(bad);
  await expect(page.getByTestId('import-error')).toBeVisible();
  await expect(page.getByTestId('diagram-row')).toHaveCount(3);

  // F006: publish from the editor, then another member votes and copies it
  await page.getByRole('link', { name: 'Control circuit', exact: true }).first().click();
  await page.getByTestId('publish').click();
  await page.getByLabel('Title').fill('Red pilot lamp with push button');
  await page.getByLabel('Description').fill('Hold S1 and H7 lights from phase L1.');
  await page.getByRole('button', { name: 'Publish' }).last().click();
  await expect(page.getByText('Published')).toBeVisible();

  const octx = await runtime.context('owner');
  const opage = await octx.newPage();
  await opage.goto('/gallery');
  await opage.getByLabel('Search gallery').fill('pilot lamp');
  await expect(opage.getByTestId('gallery-post')).toHaveCount(1);
  await opage.getByRole('link', { name: 'Red pilot lamp with push button' }).click();
  await expect(opage.getByTestId('part-H7')).toBeVisible();
  await expect(opage.getByTestId('vote')).toContainText('0');
  await opage.getByTestId('vote').click();
  await expect(opage.getByTestId('vote')).toContainText('1');
  await opage.getByTestId('sim-toggle').click();
  await opage.getByTestId('part-S1').hover();
  await opage.mouse.down();
  await expect(opage.getByTestId('part-H7')).toHaveAttribute('data-lit', 'true');
  await opage.mouse.up();
  await opage.getByTestId('copy-post').click();
  await expect(opage.getByTestId('canvas')).toBeVisible();
  await expect(opage.getByTestId('save-status')).toBeVisible();
  await opage.goto('/');
  await expect(opage.getByText('Red pilot lamp with push button')).toBeVisible();
  await octx.close();

  // F004: lessons and examples
  await page.goto('/learn');
  await expect(page.getByTestId('lesson-first-circuit')).toBeVisible();
  await page.getByTestId('lesson-first-circuit').click();
  await expect(page.getByTestId('lesson-body')).toBeVisible();
  await page.goto('/learn');
  await expect(page.getByTestId('example-star-delta-auto')).toBeVisible();

  // F003: PLC example: program drives the output, ladder shows live state; add a rung
  await page.getByTestId('open-plc-start-stop').click();
  await expect(page.getByTestId('canvas')).toBeVisible();
  await page.getByTestId('plc-toggle').click();
  await expect(page.getByTestId('rung')).toHaveCount(1);
  await page.getByTestId('sim-toggle').click();
  await page.getByTestId('part-S2').click();
  await expect(page.getByTestId('coil-0')).toHaveAttribute('data-active', 'true');
  await expect(page.getByTestId('part-H1')).toHaveAttribute('data-lit', 'true');
  await page.getByTestId('part-S1').click();
  await expect(page.getByTestId('part-H1')).toHaveAttribute('data-lit', 'false');
  await page.getByTestId('sim-toggle').click();
  await page.getByTestId('add-rung').click();
  await expect(page.getByTestId('rung')).toHaveCount(2);
  await page.getByTestId('rung-1-coil-kind').selectOption('ton');
  await page.getByTestId('rung-1-preset').fill('3');
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 10000 });
  await page.reload();
  await page.getByTestId('plc-toggle').click();
  await expect(page.getByTestId('rung')).toHaveCount(2);
  await expect(page.getByTestId('rung-1-preset')).toHaveValue('3');

  // F002: automatic star-delta: starts in star, the timer switches to delta
  await page.goto('/learn');
  await page.getByTestId('open-star-delta-auto').click();
  await expect(page.getByTestId('canvas')).toBeVisible();
  await page.getByTestId('sim-toggle').click();
  await page.getByTestId('part-S2').click();
  await expect(page.getByTestId('part-M1')).toHaveAttribute('data-mode', 'star');
  await expect(page.getByTestId('part-M1')).toHaveAttribute('data-mode', 'delta', { timeout: 8000 });
  await page.getByTestId('part-S1').click();
  await expect(page.getByTestId('part-M1')).toHaveAttribute('data-mode', 'stopped');
  await page.getByTestId('sim-toggle').click();

  // F002: direct-on-line start: contactor pulls in, motor runs, inrush shown; stop
  await page.goto('/learn');
  await page.getByTestId('open-dol-start').click();
  await expect(page.getByTestId('canvas')).toBeVisible();
  await page.getByTestId('sim-toggle').click();
  await expect(page.getByTestId('part-M1')).toHaveAttribute('data-running', 'false');
  await page.getByTestId('part-S2').click();
  await expect(page.getByTestId('part-K1')).toHaveAttribute('data-on', 'true');
  await expect(page.getByTestId('part-M1')).toHaveAttribute('data-running', 'true');
  await expect(page.getByTestId('part-M1')).toHaveAttribute('data-direction', 'forward');
  await expect(page.getByTestId('sim-readings')).toContainText('M1');
  await page.getByTestId('part-S1').click();
  await expect(page.getByTestId('part-K1')).toHaveAttribute('data-on', 'false');
  await page.getByTestId('part-S2').click();
  await expect(page.getByTestId('part-M1')).toHaveAttribute('data-running', 'true');
  await runtime.screenshot(page);
  await ctx.close();

  // Phone-sized smoke
  const phone = await runtime.context('member', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const ppage = await phone.newPage();
  await ppage.goto('/');
  await expect(ppage.getByRole('heading', { name: 'Projects' })).toBeVisible();
  await expect(ppage.getByText('Conveyor line 2')).toBeVisible();
  await ppage.goto('/gallery');
  await expect(ppage.getByTestId('gallery-post').first()).toBeVisible();
  await phone.close();
  console.log('behavior: ok');
} finally {
  await runtime.close();
}
