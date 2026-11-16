import { launchBrowserWithExtension, openSidebar } from './helpers/extension-helper.js';

// Every menu that offers Move to Space shows each space's icon and keeps its submenu inside the
// panel (issues 77 and 66; move-to-space-icon.test.js covers the ordinary menu's icon).
let browser, page, first, reading, own, own2, other;

const request = (action, args = {}) =>
    page.evaluate(
        async (action, args) => {
            const response = await chrome.runtime.sendMessage({ type: 'spaceStore', action, ...args });
            if (!response.success) throw new Error(response.error);
            return response.spaces;
        },
        action,
        args
    );
const rowOf = id => `.space.active .tab[data-tab-id="${id}"]`;
const switchTo = async id => {
    await page.evaluate(id => document.querySelector(`#spaceSwitcher button[data-space-id="${id}"]`).click(), id);
    await page.waitForSelector(`.space.active[data-space-id="${id}"]`);
    await new Promise(resolve => setTimeout(resolve, 300));
};
const click = (selector, modifiers = {}) =>
    page.$eval(
        selector,
        (el, modifiers) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, ...modifiers })),
        modifiers
    );
const openMenuOn = selector =>
    page.$eval(selector, el => {
        const r = el.getBoundingClientRect();
        el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.left + 40, clientY: r.top + 8 }));
    });
const closeMenu = () => page.evaluate(() => document.getElementById('tab-context-menu')?.remove());
const readingEntry = () =>
    page.$$eval('#tab-context-menu .submenu .context-menu-item', items => {
        const item = items.find(i => i.textContent.endsWith('Reading'));
        return item && { text: item.textContent, icon: item.querySelector('.context-menu-space-icon')?.textContent };
    });

beforeAll(async () => {
    const result = await launchBrowserWithExtension();
    browser = result.browser;
    page = await openSidebar(browser, result.extensionId);
    const spaces = await request('get');
    const [folder] = await page.evaluate(id => chrome.bookmarks.get(id), spaces[0].bookmarkFolderId);
    await page.evaluate(parentId => chrome.bookmarks.create({ parentId, title: 'Reading' }), folder.parentId);
    first = spaces[0].id;
    reading = (await request('get')).find(space => space.name === 'Reading').id;
    [own, own2, other] = await page.evaluate(async () => {
        const make = async properties => (await chrome.tabs.create({ active: false, ...properties })).id;
        return [
            await make({ url: 'https://example.com/#own' }),
            await make({ url: 'https://example.com/#own2' }),
            (await chrome.windows.create({ url: 'https://example.com/#other', focused: false })).tabs[0].id
        ];
    });
    await page.bringToFront();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#spaceSwitcher button');
    // Give Reading an icon through the same picker a user uses.
    await switchTo(reading);
    await page.$eval('.space.active .space-icon-button', button => button.click());
    await page.waitForSelector('#spaceIconPicker .space-icon-choice');
    await page.evaluate(() =>
        [...document.querySelectorAll('#spaceIconPicker .space-icon-choice')].find(b => b.textContent === '🎵').click()
    );
    await page.waitForFunction(
        () => document.querySelector('#spaceSwitcher button.active .space-chip-icon')?.textContent === '🎵',
        { polling: 100 }
    );
    await switchTo(first);
    await page.waitForSelector(rowOf(own));
});
afterAll(async () => {
    await browser?.close();
});

test('the menu of a tab in another window shows the space icon', async () => {
    await page.waitForSelector(rowOf(other));
    expect(await page.$eval(rowOf(other), row => row.classList.contains('other-window'))).toBe(true);
    await openMenuOn(rowOf(other));
    await page.waitForSelector('#tab-context-menu .submenu .context-menu-item');
    expect(await readingEntry()).toEqual({ text: '🎵Reading', icon: '🎵' });
    await closeMenu();
});

test('the menu of several selected tabs shows the space icon', async () => {
    await click(rowOf(own), { metaKey: true });
    await click(rowOf(own2), { metaKey: true });
    await openMenuOn(rowOf(own));
    await page.waitForSelector('#tab-context-menu .submenu .context-menu-item');
    expect(await readingEntry()).toEqual({ text: '🎵Reading', icon: '🎵' });
    await closeMenu();
    await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })));
});

test('the ordinary menu keeps its Move to Space submenu inside a 200px panel', async () => {
    await page.bringToFront();
    await page.setViewport({ width: 200, height: 700 });
    await openMenuOn(rowOf(own));
    await page.waitForSelector('#tab-context-menu .with-submenu');
    const item = await page.$('#tab-context-menu .with-submenu');
    await item.hover();
    await page.waitForFunction(
        () => getComputedStyle(document.querySelector('#tab-context-menu .submenu')).display === 'block',
        { polling: 100 }
    );
    // Placement runs on the next frame after the hover.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const box = await page.evaluate(() => {
        const { left, right, top, bottom } = document
            .querySelector('#tab-context-menu .submenu')
            .getBoundingClientRect();
        return { left, right, top, bottom, width: window.innerWidth, height: window.innerHeight };
    });
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(box.width);
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.bottom).toBeLessThanOrEqual(box.height);
    await closeMenu();
});
