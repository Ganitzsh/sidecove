/**
 * Split view rules: which tabs may be paired, where a pair sits in a list, and which pairs a
 * reorder has torn apart. Pure: no chrome.* and no DOM.
 *
 * Sidecove uses Chrome's own split view (Chrome 155 and later), which pairs exactly two
 * adjacent tabs of one window that share their pinned state.
 */

// The same value as chrome.tabs.SPLIT_VIEW_ID_NONE.
const NO_SPLIT = -1;

// True where Chrome can split tabs; the entry points stay hidden otherwise.
export function splitViewSupported(chromeApi) {
    return typeof chromeApi?.tabs?.createSplit === 'function' && typeof chromeApi?.tabs?.unsplit === 'function';
}

// The id of the split view the tab is in, or null.
export function splitViewIdOf(tab) {
    const id = tab?.splitViewId;
    return Number.isInteger(id) && id !== NO_SPLIT ? id : null;
}

// Whether the two tabs may be paired. Chrome refuses a tab that is already split, tabs of
// different windows and tabs that differ in pinned state; Sidecove's list also only pairs
// ordinary tabs, never favorites, whose rows live in another section.
export function canSplit(a, b) {
    if (!a || !b || a.id === b.id) return false;
    if (a.windowId !== b.windowId) return false;
    if (Boolean(a.pinned) || Boolean(b.pinned)) return false;
    return splitViewIdOf(a) === null && splitViewIdOf(b) === null;
}

// The tabs `tab` can be paired with, in the order given (the order the list shows them).
export function splitCandidates(tab, orderedTabs) {
    return orderedTabs.filter(other => canSplit(tab, other));
}

// `order` with `movedId` directly after `anchorId`; unchanged when the anchor is not in it.
export function placeNextTo(order, anchorId, movedId) {
    if (!order.includes(anchorId) || anchorId === movedId) return [...order];
    const rest = order.filter(id => id !== movedId);
    rest.splice(rest.indexOf(anchorId) + 1, 0, movedId);
    return rest;
}

// For a list of rows [{ splitViewId }] in display order: 'first' or 'second' for rows that are
// the two halves of a pair standing next to each other, null for every other row.
export function pairRoles(rows) {
    const roles = rows.map(() => null);
    for (let i = 0; i + 1 < rows.length; i++) {
        const id = splitViewIdOf(rows[i]);
        if (id === null || roles[i] !== null || id !== splitViewIdOf(rows[i + 1])) continue;
        roles[i] = 'first';
        roles[i + 1] = 'second';
    }
    return roles;
}

// The split views with a member in `rows` whose two halves no longer stand next to each other
// there, for instance after one half was dragged away.
export function brokenSplitViewIds(rows) {
    const paired = new Set();
    pairRoles(rows).forEach((role, index) => role && paired.add(splitViewIdOf(rows[index])));
    const broken = new Set();
    for (const row of rows) {
        const id = splitViewIdOf(row);
        if (id !== null && !paired.has(id)) broken.add(id);
    }
    return [...broken];
}
