import test from 'node:test';
import assert from 'node:assert/strict';
import { stepTabInSpace } from '../../../src/background/tab-step.js';

const home = { id: 'home', spaceBookmarks: [], temporaryTabs: [1, 2, 3], pinnedTabs: [8] };
const work = { id: 'work', spaceBookmarks: [], temporaryTabs: [10, 11], pinnedTabs: [9] };

// One window with the pinned tabs 8 and 9 first, then the tabs of both spaces.
function setup({ activeId, state = {} }) {
    const updates = [];
    const tabs = [8, 9, 1, 2, 3, 10, 11].map((id, index) => ({ id, index, pinned: id >= 8 && id <= 9 }));
    const chromeApi = {
        windows: { getLastFocused: async () => ({ id: 5 }) },
        tabs: {
            query: async () => tabs.map(tab => ({ ...tab, active: tab.id === activeId })),
            update: async id => updates.push(id)
        }
    };
    const readState = async () => ({
        spaces: [home, work],
        activeSpaces: { 5: 'work' },
        perSpaceFavorites: false,
        invertTabOrder: false,
        ...state
    });
    return { chromeApi, readState, updates };
}
const press = (context, direction) => stepTabInSpace({ ...context, direction });

test('from a shared pinned tab, steps through the pinned tabs and into the space shown', async () => {
    const context = setup({ activeId: 8 });
    assert.equal(await press(context, 'next'), 9);
    assert.equal(await press(context, 'prev'), 11, 'wraps back to the end of the space shown');
});

test('from the last tab of a space, next wraps to the first pinned tab', async () => {
    const context = setup({ activeId: 11 });
    assert.equal(await press(context, 'next'), 8);
});

test('from a space’s first tab, previous goes to the last pinned tab', async () => {
    const context = setup({ activeId: 10 });
    assert.equal(await press(context, 'prev'), 9);
});

test('with favorites per space, a pinned tab selects its own space and only its pins are walked', async () => {
    const context = setup({ activeId: 8, state: { perSpaceFavorites: true } });
    assert.equal(await press(context, 'next'), 1, 'tab 9 belongs to the other space');
    assert.equal(await press(context, 'prev'), 3);
});

test('does nothing when the active tab has no space or the window has no active tab', async () => {
    const context = setup({ activeId: 8, state: { activeSpaces: {} } });
    assert.equal(await press(context, 'next'), null);
    assert.deepEqual(context.updates, []);
    const none = setup({ activeId: 99 });
    assert.equal(await press(none, 'next'), null);
});

// Tabs from all windows on: the walk is the panel's list, other windows' tabs included.
function multiWindow({ activeId, state = {} }) {
    const updates = [];
    const created = [];
    const tabs = [
        { id: 8, windowId: 5, index: 0, pinned: true, url: 'https://pin-a.test/' },
        { id: 20, windowId: 6, index: 0, pinned: true, url: 'https://other-pin.test/' },
        { id: 1, windowId: 5, index: 1, url: 'https://one.test/' },
        { id: 2, windowId: 6, index: 1, url: 'https://two.test/' },
        { id: 3, windowId: 5, index: 2, url: 'https://three.test/' },
        { id: 4, windowId: 6, index: 2, url: 'https://one.test/' }, // same page as 1: one entry
        { id: 10, windowId: 5, index: 3, url: 'https://work.test/' }
    ].map(tab => ({ ...tab, active: tab.id === activeId }));
    const chromeApi = {
        windows: { getLastFocused: async () => ({ id: 5 }) },
        tabs: {
            query: async ({ windowId } = {}) => tabs.filter(tab => windowId === undefined || tab.windowId === windowId),
            update: async id => updates.push(id),
            create: async properties => {
                created.push(properties);
                return { id: 99 };
            }
        }
    };
    const readState = async () => ({
        spaces: [
            { id: 'home', spaceBookmarks: [], temporaryTabs: [1, 2, 3, 4], pinnedTabs: [8, 20] },
            { id: 'work', spaceBookmarks: [], temporaryTabs: [10], pinnedTabs: [] }
        ],
        activeSpaces: { 5: 'home' },
        perSpaceFavorites: false,
        invertTabOrder: false,
        allWindows: true,
        ...state
    });
    return { chromeApi, readState, updates, created };
}

test('with tabs from all windows, the walk is the panel’s list and a tab in another window opens here', async () => {
    const context = multiWindow({ activeId: 1 });
    // Panel order: pins 8 and 20, then 1, 2, 3 (tab 4 repeats tab 1's page and is not listed).
    assert.equal(await press(context, 'next'), 99);
    assert.deepEqual(context.created, [{ windowId: 5, url: 'https://two.test/', pinned: false, active: true }]);
    assert.deepEqual(context.updates, []);
    const here = multiWindow({ activeId: 3 });
    assert.equal(await press(here, 'next'), 8, 'wraps to a tab of this window, which is switched to');
    assert.deepEqual(here.updates, [8]);
});

test('with tabs from all windows, the pins of other windows are walked too', async () => {
    const context = multiWindow({ activeId: 8 });
    assert.equal(await press(context, 'next'), 99);
    assert.deepEqual(context.created, [{ windowId: 5, url: 'https://other-pin.test/', pinned: true, active: true }]);
});

test('with tabs from all windows off, other windows’ tabs are not walked', async () => {
    const context = multiWindow({ activeId: 8, state: { allWindows: false } });
    assert.equal(await press(context, 'next'), 1);
    assert.deepEqual(context.created, []);
});
