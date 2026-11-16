import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moveToSpaceEntries } from '../../../../../src/sidebar/features/context-menu/space-menu-entries.js';

const spaces = [
    { id: 'a', name: 'Home', icon: '🏠' },
    { id: 'b', name: 'Work' },
    { id: 'c', name: 'Play', icon: '🎵' }
];

test('lists every space but the current one, with its name and icon', () => {
    const entries = moveToSpaceEntries({ spaces, currentSpaceId: 'a', onMove: () => {} });
    assert.deepEqual(
        entries.map(({ label, icon }) => ({ label, icon })),
        [
            { label: 'Work', icon: undefined },
            { label: 'Play', icon: '🎵' }
        ]
    );
});

test('choosing a space passes it to onMove', () => {
    const moved = [];
    const entries = moveToSpaceEntries({ spaces, currentSpaceId: 'a', onMove: space => moved.push(space.id) });
    entries[1].action();
    assert.deepEqual(moved, ['c']);
});

test('bookmark-folder spaces follow the open ones behind a separator and create the space', () => {
    const created = [];
    const entries = moveToSpaceEntries({
        spaces,
        currentSpaceId: 'a',
        inactiveFolders: [{ title: 'Archive', icon: '📦' }],
        onMove: () => {},
        onCreate: folder => created.push(folder.title)
    });
    assert.equal(entries[2], 'separator');
    assert.deepEqual({ label: entries[3].label, icon: entries[3].icon }, { label: 'Archive', icon: '📦' });
    entries[3].action();
    assert.deepEqual(created, ['Archive']);
});

test('no separator when only one kind is present, and nothing when there is nowhere to move', () => {
    const onlyFolders = moveToSpaceEntries({
        spaces: [spaces[0]],
        currentSpaceId: 'a',
        inactiveFolders: [{ title: 'Archive' }]
    });
    assert.deepEqual(
        onlyFolders.map(entry => entry.label),
        ['Archive']
    );
    assert.deepEqual(moveToSpaceEntries({ spaces: [spaces[0]], currentSpaceId: 'a' }), []);
});
