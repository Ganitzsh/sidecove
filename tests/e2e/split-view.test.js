import { createServer } from 'node:http';
import { launchBrowserWithExtension, openSidebar } from './helpers/extension-helper.js';
import { dragOnto } from './helpers/drag.js';

// Issue #72: two tabs side by side, using Chrome's own split view (Chrome 155 and later).
// On an older Chrome the entries must be absent; on a newer one the whole path is driven:
// split from the tab's menu or from a selection, see the pair in the list, separate it.
let browser, page, server, base, supported, ids;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const rows = '.space.active .tab[data-tab-id]';
const rowSelector = id => `.space.active .tab[data-tab-id="${id}"]`;

const chromeTab = id => page.evaluate(id => chrome.tabs.get(id), id);
const splitIdOf = async id => (await chromeTab(id)).splitViewId ?? -1;
const listedIds = () => page.$$eval(rows, els => els.map(el => Number(el.dataset.tabId)));

const openMenu = id =>
    page.evaluate(id => {
        const row = document.querySelector(`.space.active .tab[data-tab-id="${id}"]`);
        const r = row.getBoundingClientRect();
        row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.left + 40, clientY: r.top + 8 }));
    }, id);
const menuLabels = () =>
    page.$$eval('#tab-context-menu > .context-menu-item', items => items.map(i => i.firstChild.textContent));
const clickInMenu = (selector, text) =>
    page.evaluate(
        (selector, text) =>
            [...document.querySelectorAll(selector)].find(item => item.firstChild.textContent === text).click(),
        selector,
        text
    );
const closeMenu = () => page.evaluate(() => document.getElementById('tab-context-menu')?.remove());

async function openTabs(names) {
    return page.evaluate(
        async (base, names) => {
            const request = async (action, args = {}) => {
                const response = await chrome.runtime.sendMessage({ type: 'spaceStore', action, ...args });
                if (!response.success) throw new Error(response.error);
                return response.spaces;
            };
            const { id: windowId } = await chrome.windows.getCurrent();
            const made = [];
            for (const name of names) {
                made.push((await chrome.tabs.create({ url: `${base}/${name}`, windowId, active: false })).id);
            }
            for (let i = 0; i < 50; i++) {
                const spaces = await request('get');
                if (made.every(id => spaces.some(space => space.temporaryTabs.includes(id)))) break;
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            // The list shows a tab's title from when it was drawn, so let every page load first.
            for (let i = 0; i < 100; i++) {
                const tabs = await Promise.all(made.map(id => chrome.tabs.get(id)));
                if (tabs.every(tab => tab.status === 'complete' && tab.title)) break;
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            return made;
        },
        base,
        names
    );
}

// Waits until the list shows the two tabs next to each other as one block, in either order.
const waitForPair = (a, b) =>
    page.waitForFunction(
        (a, b) => {
            const rowA = document.querySelector(`.space.active .tab[data-tab-id="${a}"]`);
            const rowB = document.querySelector(`.space.active .tab[data-tab-id="${b}"]`);
            if (!rowA || !rowB) return false;
            const [upper, lower] = rowA.nextElementSibling === rowB ? [rowA, rowB] : [rowB, rowA];
            return (
                upper.nextElementSibling === lower &&
                upper.classList.contains('split-first') &&
                lower.classList.contains('split-second')
            );
        },
        { polling: 100, timeout: 10000 },
        a,
        b
    );
const waitForNoPair = () =>
    page.waitForFunction(
        () => !document.querySelector('.space.active .tab.split-first, .space.active .tab.split-second'),
        {
            polling: 100,
            timeout: 10000
        }
    );

beforeAll(async () => {
    server = createServer((req, res) => {
        res.setHeader('Content-Type', 'text/html');
        res.end(`<title>${req.url.slice(1)}</title>`);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    const result = await launchBrowserWithExtension();
    browser = result.browser;
    page = await openSidebar(browser, result.extensionId);
    page.on('pageerror', error => console.error('Sidebar error:', error.message));
    supported = await page.evaluate(() => typeof chrome.tabs.createSplit === 'function');
    const [one, two, three, four] = await openTabs(['one', 'two', 'three', 'four']);
    ids = { one, two, three, four };
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector(rowSelector(four));
});

afterAll(async () => {
    await browser?.close();
    server?.close();
});

test('where Chrome has no split view the tab menu offers none', async () => {
    if (supported) return;
    await openMenu(ids.one);
    await page.waitForSelector('#tab-context-menu');
    expect(await menuLabels()).not.toContain('Split View with…');
});

test('a tab can be split with another tab of its space from its menu, and the pair shows as one block', async () => {
    if (!supported) return;
    await openMenu(ids.one);
    await page.waitForSelector('#tab-context-menu');
    expect(await menuLabels()).toContain('Split View with…');
    // The submenu lists a new tab and the other tabs of the space by the title the list shows,
    // never the tab itself.
    const titles = await page.$$eval('#tab-context-menu .submenu .context-menu-item', items =>
        items.map(item => item.textContent)
    );
    expect(titles[0]).toBe('New Tab');
    expect(titles).toEqual(expect.arrayContaining(['two', 'three', 'four']));
    expect(titles).not.toContain('one');
    const before = await listedIds();
    await clickInMenu('#tab-context-menu .submenu .context-menu-item', 'three');
    await waitForPair(ids.one, ids.three);

    const [first, partner] = await Promise.all([splitIdOf(ids.one), splitIdOf(ids.three)]);
    expect(first).not.toBe(-1);
    expect(partner).toBe(first);
    // The partner moved up beside the tab; every other tab keeps its place relative to the rest.
    const after = await listedIds();
    expect(Math.abs(after.indexOf(ids.one) - after.indexOf(ids.three))).toBe(1);
    expect(after.filter(id => id !== ids.three)).toEqual(before.filter(id => id !== ids.three));
    expect(await splitIdOf(ids.two)).toBe(-1);
});

test('a tab in a split view is offered Separate, and Separate gives the two tabs back', async () => {
    if (!supported) return;
    await openMenu(ids.three);
    await page.waitForSelector('#tab-context-menu');
    const labels = await menuLabels();
    expect(labels).toContain('Separate Split View');
    expect(labels).not.toContain('Split View with…');
    await clickInMenu('#tab-context-menu > .context-menu-item', 'Separate Split View');
    await waitForNoPair();
    expect(await splitIdOf(ids.one)).toBe(-1);
    expect(await splitIdOf(ids.three)).toBe(-1);
    // Both tabs are still open and still listed.
    expect(await listedIds()).toEqual(expect.arrayContaining([ids.one, ids.three]));
});

test('two selected tabs can be opened in a split view, and the pair has its own Separate button', async () => {
    if (!supported) return;
    await closeMenu();
    const click = (id, extra) =>
        page.$eval(
            rowSelector(id),
            (el, extra) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, ...extra })),
            extra
        );
    await click(ids.two, { ctrlKey: true });
    await click(ids.four, { ctrlKey: true });
    await page.evaluate(id => {
        const row = document.querySelector(`.space.active .tab[data-tab-id="${id}"]`);
        const r = row.getBoundingClientRect();
        row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.left + 40, clientY: r.top + 8 }));
    }, ids.two);
    await page.waitForSelector('#tab-context-menu');
    await clickInMenu('#tab-context-menu > .context-menu-item', 'Open in Split View');
    await waitForPair(ids.two, ids.four);
    expect(await splitIdOf(ids.two)).toBe(await splitIdOf(ids.four));

    await page.$eval('.space.active .tab.split-first .tab-split-separate', button => button.click());
    await waitForNoPair();
    expect(await splitIdOf(ids.two)).toBe(-1);
    expect(await splitIdOf(ids.four)).toBe(-1);
});

test('dragging one half of a pair away from the other separates the pair, as in Arc', async () => {
    if (!supported) return;
    await openMenu(ids.two);
    await page.waitForSelector('#tab-context-menu');
    await clickInMenu('#tab-context-menu .submenu .context-menu-item', 'four');
    await waitForPair(ids.two, ids.four);

    // The row furthest from the pair, so the drop cannot land back beside it.
    const far = await page.$$eval(rows, els => els.at(-1).dataset.tabId);
    await dragOnto(page, '.space.active .tab.split-first', rowSelector(far));
    await waitForNoPair();
    expect(await splitIdOf(ids.two)).toBe(-1);
    expect(await splitIdOf(ids.four)).toBe(-1);
});

test('a tab can be split with a new tab, which joins the same space beside it', async () => {
    if (!supported) return;
    const before = await listedIds();
    await openMenu(ids.one);
    await page.waitForSelector('#tab-context-menu');
    await clickInMenu('#tab-context-menu .submenu .context-menu-item', 'New Tab');
    await page.waitForFunction(
        count => document.querySelectorAll('.space.active .tab[data-tab-id]').length > count,
        {
            polling: 100,
            timeout: 10000
        },
        before.length
    );
    await sleep(300);
    const after = await listedIds();
    const created = after.find(id => !before.includes(id));
    expect(created).toBeDefined();
    expect(await splitIdOf(created)).toBe(await splitIdOf(ids.one));
    expect(await splitIdOf(ids.one)).not.toBe(-1);
    expect(Math.abs(after.indexOf(created) - after.indexOf(ids.one))).toBe(1);
});
