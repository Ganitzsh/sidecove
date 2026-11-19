// The split view entries of the tab menus, as showMenu entries. Pure: callers hand in what is
// known about the tabs and the actions to run.
import { canSplit, splitViewIdOf } from './split-logic.js';

const MAX_CANDIDATES = 12;
const MAX_LABEL = 40;

const shorten = text => (text.length > MAX_LABEL ? `${text.slice(0, MAX_LABEL - 1)}…` : text);

// For one tab: Separate when it is in a split view, else a choice of what to split it with.
// `candidates` are [{ id, title }] in list order; the rest are reachable by selecting two tabs.
export function tabSplitEntries({ tab, candidates, actions }) {
    if (splitViewIdOf(tab) !== null) return [{ label: 'Separate Split View', action: actions.separate }];
    if (tab.pinned) return [];
    return [
        {
            label: 'Split View with…',
            submenu: [
                { label: 'New Tab', action: actions.withNewTab },
                ...(candidates.length ? ['separator'] : []),
                ...candidates.slice(0, MAX_CANDIDATES).map(candidate => ({
                    label: shorten(candidate.title || 'Untitled'),
                    action: () => actions.withTab(candidate.id)
                }))
            ]
        }
    ];
}

// For a selection: exactly two tabs that can be paired.
export function bulkSplitEntries({ tabs, actions }) {
    if (tabs.length !== 2 || !canSplit(tabs[0], tabs[1])) return [];
    return [{ label: 'Open in Split View', action: () => actions.withTabs(tabs[0].id, tabs[1].id) }];
}
