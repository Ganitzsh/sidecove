import { createServer } from 'node:http';
import { launchBrowserWithExtension, createSpace } from './helpers/extension-helper.js';

// Clear leaves an untouched New Tab alone: it is not archived, the button is hidden while it is
// all the space has, and Clear on a mix archives only the real pages.
let server, base, browser, extensionId, page, spaceId;

const archivedUrls = () =>
    page.evaluate(async () => ((await chrome.storage.local.get('archivedTabs')).archivedTabs || []).map(t => t.url));
const clearVisible = () => page.$eval('.space.active .clean-tabs-btn', button => button.offsetParent !== null);
const addTab = url =>
    page.evaluate(
        async (url, spaceId) => {
            const tab = await chrome.tabs.create(url ? { url, active: false } : { active: false });
            await chrome.runtime.sendMessage({ type: 'spaceStore', action: 'assign', tabId: tab.id, spaceId });
            return tab.id;
        },
        url,
        spaceId
    );
const rowOf = id => `.space.active [data-tab-type="temporary"] .tab[data-tab-id="${id}"]`;

beforeAll(async () => {
    server = createServer((req, res) => {
        res.setHeader('Content-Type', 'text/html');
        res.end(`<title>${req.url.slice(1)}</title>`);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    ({ browser, extensionId } = await launchBrowserWithExtension());
    page = await createSpace(browser, extensionId, 'Lone');
    await page.setViewport({ width: 360, height: 800 });
    spaceId = await page.evaluate(
        async () =>
            (await chrome.runtime.sendMessage({ type: 'spaceStore', action: 'get' })).spaces.find(
                s => s.name === 'Lone'
            ).id
    );
});
afterAll(async () => {
    await browser?.close();
    await new Promise(resolve => server?.close(resolve));
});

test('a space with only an untouched New Tab hides Clear, and Clear does nothing', async () => {
    const blank = await addTab(null);
    await page.bringToFront();
    await page.waitForSelector(rowOf(blank));
    await page.waitForFunction(() => document.querySelector('.space.active .clean-tabs-btn').hidden, { polling: 100 });
    expect(await clearVisible()).toBe(false);
    await page.$eval('.space.active .clean-tabs-btn', button => button.click());
    await new Promise(resolve => setTimeout(resolve, 1000));
    expect(await archivedUrls()).toEqual([]);
    expect(await page.$('#undoToast')).toBeNull();
    expect(await page.$(rowOf(blank))).not.toBeNull();
});

test('Clear archives the real pages and keeps the New Tab', async () => {
    const real = await addTab(`${base}/real`);
    await page.bringToFront();
    await page.waitForSelector(rowOf(real));
    await page.waitForFunction(() => !document.querySelector('.space.active .clean-tabs-btn').hidden, {
        polling: 100
    });
    await page.$eval('.space.active .clean-tabs-btn', button => button.click());
    await page.waitForFunction(
        id => !document.querySelector(`.space.active .tab[data-tab-id="${id}"]`),
        { polling: 100 },
        real
    );
    const archived = await archivedUrls();
    expect(archived).toHaveLength(1);
    expect(archived[0]).toContain('/real');
    expect(await page.$$eval('.space.active [data-tab-type="temporary"] .tab[data-tab-id]', rows => rows.length)).toBe(
        1
    );
});
