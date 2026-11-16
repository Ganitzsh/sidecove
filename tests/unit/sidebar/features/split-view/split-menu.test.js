import test from 'node:test';
import assert from 'node:assert/strict';
import { bulkSplitEntries, tabSplitEntries } from '../../../../../src/sidebar/features/split-view/split-menu.js';

const tab = (id, extra = {}) => ({ id, windowId: 1, pinned: false, ...extra });
const actions = {
    separate: () => 'separate',
    withNewTab: () => 'new',
    withTab: id => `with ${id}`,
    withTabs: (a, b) => `pair ${a} ${b}`
};

test('a tab that is not split can be split with a new tab or any candidate', () => {
    const [entry] = tabSplitEntries({
        tab: tab(1),
        candidates: [
            { id: 2, title: 'Two' },
            { id: 3, title: 'Three' }
        ],
        actions
    });
    assert.equal(entry.label, 'Split View with…');
    assert.deepEqual(
        entry.submenu.map(item => item.label ?? item),
        ['New Tab', 'separator', 'Two', 'Three']
    );
    assert.equal(entry.submenu[0].action(), 'new');
    assert.equal(entry.submenu[3].action(), 'with 3');
});

test('with no candidates the menu still offers a new tab, without a stray separator', () => {
    const [entry] = tabSplitEntries({ tab: tab(1), candidates: [], actions });
    assert.deepEqual(
        entry.submenu.map(item => item.label),
        ['New Tab']
    );
});

test('a long list of candidates is cut and long titles are shortened', () => {
    const candidates = Array.from({ length: 20 }, (_, i) => ({ id: i + 2, title: 'x'.repeat(60) }));
    const [entry] = tabSplitEntries({ tab: tab(1), candidates, actions });
    const labels = entry.submenu.filter(item => item !== 'separator').slice(1);
    assert.equal(labels.length, 12);
    assert.equal(labels[0].label.length, 40);
    assert.ok(labels[0].label.endsWith('…'));
});

test('a tab in a split view is offered Separate instead', () => {
    const entries = tabSplitEntries({ tab: tab(1, { splitViewId: 4 }), candidates: [], actions });
    assert.deepEqual(
        entries.map(entry => entry.label),
        ['Separate Split View']
    );
    assert.equal(entries[0].action(), 'separate');
});

test('a Chrome-pinned tab is offered nothing', () => {
    assert.deepEqual(tabSplitEntries({ tab: tab(1, { pinned: true }), candidates: [], actions }), []);
});

test('two selected tabs that can be paired are offered a split view', () => {
    const [entry] = bulkSplitEntries({ tabs: [tab(1), tab(2)], actions });
    assert.equal(entry.label, 'Open in Split View');
    assert.equal(entry.action(), 'pair 1 2');
});

test('other selections are offered no split view', () => {
    assert.deepEqual(bulkSplitEntries({ tabs: [tab(1)], actions }), []);
    assert.deepEqual(bulkSplitEntries({ tabs: [tab(1), tab(2), tab(3)], actions }), []);
    assert.deepEqual(bulkSplitEntries({ tabs: [tab(1), tab(2, { splitViewId: 3 })], actions }), []);
});
