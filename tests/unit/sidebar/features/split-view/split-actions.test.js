import test from 'node:test';
import assert from 'node:assert/strict';
import {
    separateSplit,
    splitTabs,
    splitWithNewTab
} from '../../../../../src/sidebar/features/split-view/split-actions.js';

// A Chrome whose tabs are plain objects; the calls are recorded in `calls`.
function fakeChrome(tabs) {
    const calls = [];
    const byId = id => {
        const found = tabs.find(t => t.id === id);
        if (!found) throw new Error(`No tab with id ${id}`);
        return found;
    };
    return {
        calls,
        tabs: {
            get: async id => byId(id),
            move: async (id, props) => calls.push(['move', id, props]),
            createSplit: async ids => (calls.push(['createSplit', ids]), 99),
            unsplit: async id => calls.push(['unsplit', id]),
            create: async props => (calls.push(['create', props]), { id: 50, ...props })
        }
    };
}
const tab = (id, index, extra = {}) => ({ id, index, windowId: 1, pinned: false, ...extra });

test('tabs that already stand next to each other are paired without moving', async () => {
    const chrome = fakeChrome([tab(1, 2), tab(2, 3)]);
    assert.equal(await splitTabs(chrome, 1, 2), 99);
    assert.deepEqual(chrome.calls, [['createSplit', [1, 2]]]);
});

test('a partner further down the strip moves up to sit right after the tab', async () => {
    const chrome = fakeChrome([tab(1, 1), tab(2, 5)]);
    await splitTabs(chrome, 1, 2);
    assert.deepEqual(chrome.calls, [
        ['move', 2, { index: 2 }],
        ['createSplit', [1, 2]]
    ]);
});

test('a partner earlier in the strip moves down to sit right after the tab', async () => {
    const chrome = fakeChrome([tab(1, 4), tab(2, 0)]);
    await splitTabs(chrome, 1, 2);
    // Taking the partner out first shifts the tab to index 3, so index 4 is right after it.
    assert.deepEqual(chrome.calls, [
        ['move', 2, { index: 4 }],
        ['createSplit', [1, 2]]
    ]);
});

test('tabs Chrome would refuse are not touched', async () => {
    const chrome = fakeChrome([tab(1, 0), tab(2, 1, { splitViewId: 3 })]);
    await assert.rejects(() => splitTabs(chrome, 1, 2), /cannot be shown in a split view/);
    assert.deepEqual(chrome.calls, []);
});

test('a new tab is opened into a split with the tab, in its window', async () => {
    const chrome = fakeChrome([tab(1, 0, { windowId: 7 })]);
    const created = await splitWithNewTab(chrome, 1);
    assert.deepEqual(chrome.calls, [['create', { splitWithTabId: 1, windowId: 7, active: true }]]);
    assert.equal(created.id, 50);
});

test('a tab already in a split view gets no new split tab', async () => {
    const chrome = fakeChrome([tab(1, 0, { splitViewId: 3 })]);
    await assert.rejects(() => splitWithNewTab(chrome, 1));
    assert.deepEqual(chrome.calls, []);
});

test('separating asks Chrome to unsplit the view the tab is in', async () => {
    const chrome = fakeChrome([tab(1, 0, { splitViewId: 12 })]);
    await separateSplit(chrome, 1);
    assert.deepEqual(chrome.calls, [['unsplit', 12]]);
});

test('separating a tab that is not split does nothing', async () => {
    const chrome = fakeChrome([tab(1, 0)]);
    await separateSplit(chrome, 1);
    assert.deepEqual(chrome.calls, []);
});
