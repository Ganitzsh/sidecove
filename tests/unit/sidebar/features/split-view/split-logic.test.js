import test from 'node:test';
import assert from 'node:assert/strict';
import {
    brokenSplitViewIds,
    canSplit,
    pairRoles,
    placeNextTo,
    splitCandidates,
    splitViewIdOf,
    splitViewSupported
} from '../../../../../src/sidebar/features/split-view/split-logic.js';

const tab = (id, extra = {}) => ({ id, windowId: 1, pinned: false, ...extra });

test('split view is offered only where Chrome has both split calls', () => {
    assert.equal(splitViewSupported({ tabs: { createSplit() {}, unsplit() {} } }), true);
    assert.equal(splitViewSupported({ tabs: { createSplit() {} } }), false);
    assert.equal(splitViewSupported({ tabs: {} }), false);
    assert.equal(splitViewSupported(undefined), false);
});

test('a tab is in a split view only when it has a real split view id', () => {
    assert.equal(splitViewIdOf(tab(1, { splitViewId: 7 })), 7);
    assert.equal(splitViewIdOf(tab(1, { splitViewId: -1 })), null);
    assert.equal(splitViewIdOf(tab(1)), null);
    assert.equal(splitViewIdOf(null), null);
});

test('two ordinary tabs of one window can be paired', () => {
    assert.equal(canSplit(tab(1), tab(2)), true);
});

test('a tab cannot be paired with itself, a split tab, a pinned tab or a tab of another window', () => {
    assert.equal(canSplit(tab(1), tab(1)), false);
    assert.equal(canSplit(tab(1), tab(2, { splitViewId: 5 })), false);
    assert.equal(canSplit(tab(1, { splitViewId: 5 }), tab(2)), false);
    assert.equal(canSplit(tab(1), tab(2, { pinned: true })), false);
    assert.equal(canSplit(tab(1), tab(2, { windowId: 2 })), false);
    assert.equal(canSplit(tab(1), null), false);
});

test('candidates keep the list order and leave out tabs that cannot be paired', () => {
    const tabs = [tab(3), tab(1), tab(4, { splitViewId: 9 }), tab(2, { windowId: 2 }), tab(5)];
    assert.deepEqual(
        splitCandidates(tab(1), tabs).map(t => t.id),
        [3, 5]
    );
});

test('placeNextTo puts a tab right after its anchor', () => {
    assert.deepEqual(placeNextTo([1, 2, 3, 4], 1, 4), [1, 4, 2, 3]);
    assert.deepEqual(placeNextTo([1, 2, 3, 4], 4, 1), [2, 3, 4, 1]);
    assert.deepEqual(placeNextTo([1, 2, 3], 2, 3), [1, 2, 3]);
});

test('placeNextTo leaves the order alone when the anchor is missing or is the moved tab', () => {
    assert.deepEqual(placeNextTo([1, 2, 3], 9, 1), [1, 2, 3]);
    assert.deepEqual(placeNextTo([1, 2, 3], 2, 2), [1, 2, 3]);
});

test('placeNextTo adds a tab the order did not have yet', () => {
    assert.deepEqual(placeNextTo([1, 2], 1, 7), [1, 7, 2]);
});

test('rows that stand next to each other with one split view id are a pair', () => {
    const rows = [{}, { splitViewId: 4 }, { splitViewId: 4 }, {}];
    assert.deepEqual(pairRoles(rows), [null, 'first', 'second', null]);
});

test('two pairs in a row are told apart', () => {
    const rows = [{ splitViewId: 1 }, { splitViewId: 1 }, { splitViewId: 2 }, { splitViewId: 2 }];
    assert.deepEqual(pairRoles(rows), ['first', 'second', 'first', 'second']);
});

test('split rows with something between them are not shown as a pair', () => {
    const rows = [{ splitViewId: 4 }, {}, { splitViewId: 4 }];
    assert.deepEqual(pairRoles(rows), [null, null, null]);
});

test('a lone row with a split view id is not a pair', () => {
    assert.deepEqual(pairRoles([{ splitViewId: 4 }, {}]), [null, null]);
    assert.deepEqual(pairRoles([]), []);
});

test('a split view whose halves were pulled apart is reported once', () => {
    const rows = [{ splitViewId: 4 }, {}, { splitViewId: 4 }, { splitViewId: 8 }, { splitViewId: 8 }];
    assert.deepEqual(brokenSplitViewIds(rows), [4]);
});

test('nothing is reported while every pair still stands together', () => {
    assert.deepEqual(brokenSplitViewIds([{ splitViewId: 4 }, { splitViewId: 4 }, {}]), []);
    assert.deepEqual(brokenSplitViewIds([{}, {}]), []);
});
