// Starting and ending a split view. `chromeApi` is passed in so the steps can be tested.
import { canSplit, splitViewIdOf } from './split-logic.js';

// Pairs two tabs. Chrome only splits tabs that stand next to each other, so the second tab
// first moves to sit right after the first.
export async function splitTabs(chromeApi, tabId, partnerId) {
    const [tab, partner] = await Promise.all([chromeApi.tabs.get(tabId), chromeApi.tabs.get(partnerId)]);
    if (!canSplit(tab, partner)) throw new Error('These two tabs cannot be shown in a split view.');
    if (partner.index !== tab.index + 1) {
        // Moving a tab down the strip shifts everything after it up by one.
        await chromeApi.tabs.move(partner.id, { index: partner.index < tab.index ? tab.index : tab.index + 1 });
    }
    return chromeApi.tabs.createSplit([tab.id, partner.id]);
}

// Opens a new tab straight into a split with `tabId`, and returns it.
export async function splitWithNewTab(chromeApi, tabId) {
    const tab = await chromeApi.tabs.get(tabId);
    if (splitViewIdOf(tab) !== null || tab.pinned) throw new Error('This tab cannot be shown in a split view.');
    return chromeApi.tabs.create({ splitWithTabId: tab.id, windowId: tab.windowId, active: true });
}

// Takes the tab out of its split view; both tabs stay open.
export async function separateSplit(chromeApi, tabId) {
    const id = splitViewIdOf(await chromeApi.tabs.get(tabId));
    if (id === null) return;
    await chromeApi.tabs.unsplit(id);
}
