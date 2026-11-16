import { spaceForActivation } from '../shared/space-membership.js';
import { inListedOrder, pickAction, selectFavoriteTabs, selectListedTabs } from '../shared/all-windows.js';
import { tabCycleOrder, adjacentTabId } from '../shared/tab-step.js';

// The next and previous tab in space shortcuts: from the focused window's active tab, walk the
// pinned tabs and then the space's tabs. With tabs from all windows on, that is exactly the list
// the panel shows, other windows' tabs included; stepping onto one opens its page here, as picking
// it in the panel does. A shared pinned tab belongs to no one space, so the
// space the panel shows decides, as for the recent-tab shortcut. `chromeApi` is passed in so tests
// can fake it; `readState` returns the spaces, the space shown per window and the two settings.
export async function stepTabInSpace({ chromeApi, readState, direction }) {
    const window = await chromeApi.windows.getLastFocused({ windowTypes: ['normal'] });
    const [state, windowTabs] = await Promise.all([readState(), chromeApi.tabs.query({ windowId: window.id })]);
    const active = windowTabs.find(tab => tab.active);
    if (!active) return null;
    const { spaces, activeSpaces, perSpaceFavorites, invertTabOrder } = state;
    const space =
        spaceForActivation(spaces, active.id, perSpaceFavorites) ||
        spaces.find(s => s.id === activeSpaces?.[window.id]);
    if (!space) return null;
    const allTabs = state.allWindows ? await chromeApi.tabs.query({}) : null;
    const ordered = allTabs
        ? panelCycle(space, allTabs, window, { perSpaceFavorites, invertTabOrder })
        : tabCycleOrder(space, {
              pinnedIds: windowTabs
                  .filter(tab => tab.pinned)
                  .sort((a, b) => a.index - b.index)
                  .map(tab => tab.id),
              perSpaceFavorites,
              invertTabOrder,
              openTabIds: new Set(windowTabs.map(tab => tab.id))
          });
    const targetId = adjacentTabId(ordered, active.id, direction);
    if (targetId === null) return null;
    const target = allTabs?.find(tab => tab.id === targetId);
    const action = target ? pickAction(target, window.id) : { activate: targetId };
    if (action.activate == null) return (await chromeApi.tabs.create(action.open)).id;
    await chromeApi.tabs.update(targetId, { active: true });
    return targetId;
}

// The panel's list, top to bottom: the top-bar favorites of every window, then the space's tabs.
function panelCycle(space, allTabs, window, { perSpaceFavorites, invertTabOrder }) {
    const pinnedIds = selectFavoriteTabs(allTabs, window, {
        allWindows: true,
        perSpace: perSpaceFavorites,
        spaceTabIds: new Set(space.pinnedTabs ?? [])
    }).map(tab => tab.id);
    const listedIds = selectListedTabs(space, allTabs, window, true).map(tab => tab.id);
    // A copy opened here sits in the slot of the other window's tab it stands for, as in the panel.
    const inPanelOrder = { ...space, temporaryTabs: inListedOrder(space.temporaryTabs, space, allTabs, window, true) };
    return tabCycleOrder(inPanelOrder, {
        pinnedIds,
        invertTabOrder,
        openTabIds: new Set([...pinnedIds, ...listedIds])
    });
}
