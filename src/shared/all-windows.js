// "Show tabs and favorites from all windows": each window's panel lists the open tabs and the
// top-bar favorites of every window, and which window a tab lives in does not show. Chrome keeps
// each tab in exactly one window, so picking a page that is open only in another window opens it
// again here and leaves the other window's tab where it is.

import { ALL_WINDOWS_SETTING, pageOf } from './saved-favorites.js';

// Two tabs on the same address (pageOf) are one entry in the list.
export { ALL_WINDOWS_SETTING, pageOf };

export const isOtherWindow = (tab, windowId) => tab?.windowId != null && tab.windowId !== windowId;

// This window's tabs, or with the setting on every window's. Incognito and normal windows never
// show each other's tabs.
export function visibleWindowTabs(tabs, win, allWindows) {
    return tabs.filter(
        tab => tab.windowId === win.id || (allWindows && Boolean(tab.incognito) === Boolean(win.incognito))
    );
}

// Each of this window's copies of a page that another window's tab also shows, mapped to that
// tab: the first copy stands for the first such tab, and takes its slot in the list.
export function claimedCopies(tabs, windowId) {
    const firstOther = new Map();
    for (const tab of tabs)
        if (isOtherWindow(tab, windowId) && !firstOther.has(pageOf(tab))) firstOther.set(pageOf(tab), tab);
    const copies = new Map();
    const claimed = new Set();
    for (const tab of tabs) {
        const page = pageOf(tab);
        if (isOtherWindow(tab, windowId) || !firstOther.has(page) || claimed.has(page)) continue;
        claimed.add(page);
        copies.set(tab.id, firstOther.get(page));
    }
    return copies;
}

// Keeps all of this window's tabs, and another window's tab only when no tab of this window, or
// kept before it, shows its page. This window's copy always stands for a page, and sits in the
// slot of the other window's tab it was opened from, so the list does not reorder.
export function onePerPage(tabs, windowId) {
    const copies = claimedCopies(tabs, windowId);
    const copyOf = new Map([...copies].map(([id, other]) => [other.id, tabs.find(tab => tab.id === id)]));
    const placed = new Set();
    const kept = [];
    for (const tab of tabs) {
        if (!isOtherWindow(tab, windowId)) {
            if (!copies.has(tab.id)) kept.push(tab);
            continue;
        }
        const page = pageOf(tab);
        if (placed.has(page)) continue;
        placed.add(page);
        kept.push(copyOf.get(tab.id) || tab);
    }
    return kept;
}

// The live tabs of a space's list, in the space's order, one per page. A pinned tab binds to its
// bookmark one window at a time, so a pinned tab open in another window is left to that window.
function candidateTabs(space, tabs, win, allWindows) {
    const pinnedIds = new Set(space?.spaceBookmarks || []);
    const byId = new Map(
        visibleWindowTabs(tabs, win, allWindows)
            .filter(tab => !tab.pinned && (tab.windowId === win.id || !pinnedIds.has(tab.id)))
            .map(tab => [tab.id, tab])
    );
    const ids = new Set([...(space?.spaceBookmarks || []), ...(space?.temporaryTabs || [])]);
    return [...ids].map(id => byId.get(id)).filter(Boolean);
}

export function selectListedTabs(space, tabs, win, allWindows) {
    const listed = candidateTabs(space, tabs, win, allWindows);
    return allWindows ? onePerPage(listed, win.id) : listed;
}

// The space's id list with each relocated copy and the other window's tab it stands for swapped,
// for a panel that draws from the id list rather than from the listed tabs.
export function inListedOrder(ids, space, tabs, win, allWindows) {
    if (!allWindows) return ids;
    const out = [...ids];
    for (const [copyId, other] of claimedCopies(candidateTabs(space, tabs, win, allWindows), win.id)) {
        const copyAt = out.indexOf(copyId);
        const otherAt = out.indexOf(other.id);
        if (copyAt >= 0 && otherAt >= 0) [out[copyAt], out[otherAt]] = [out[otherAt], out[copyAt]];
    }
    return out;
}

// Top-bar favorites (Chrome pins), one per page: this window's first in tab strip order, then
// each other window's. With separate favorites per space, only the pins of `spaceTabIds` show.
export function selectFavoriteTabs(tabs, win, { allWindows = false, perSpace = false, spaceTabIds = new Set() } = {}) {
    const pins = visibleWindowTabs(tabs, win, allWindows)
        .filter(tab => tab.pinned && (!perSpace || spaceTabIds.has(tab.id)))
        .sort(
            (a, b) =>
                isOtherWindow(a, win.id) - isOtherWindow(b, win.id) || a.windowId - b.windowId || a.index - b.index
        );
    return allWindows ? onePerPage(pins, win.id) : pins;
}

// What picking an entry does: switch to it when it is in this window, otherwise open its page
// here as a new tab (pinned for a favorite). Nothing in the other window changes.
export function pickAction(tab, windowId) {
    if (!isOtherWindow(tab, windowId)) return { activate: tab.id };
    return { open: { windowId, url: pageOf(tab), pinned: Boolean(tab.pinned), active: true } };
}

// The tabs a close removes: the entry stands for its page in every window, so every open tab of
// that page in the space's list closes and the entry leaves the list.
export function pageTabIds(space, tabs, win, tab) {
    const page = pageOf(tab);
    const listed = new Set(space?.temporaryTabs || []);
    const copies = visibleWindowTabs(tabs, win, true).filter(
        other => other.id !== tab.id && !other.pinned && listed.has(other.id) && page && pageOf(other) === page
    );
    return [tab.id, ...copies.map(other => other.id)];
}
