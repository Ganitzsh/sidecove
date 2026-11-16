// The "Move to Space" entries every tab menu shares, so a menu cannot forget the space icon
// (or any later change) that another one has. Each entry is a showMenu entry: name, icon, action.
// Spaces that exist only as a bookmark folder come after the open ones, behind a separator.
export function moveToSpaceEntries({ spaces, currentSpaceId, inactiveFolders = [], onMove, onCreate }) {
    const open = spaces
        .filter(space => space.id !== currentSpaceId)
        .map(space => ({ label: space.name, icon: space.icon, action: () => onMove(space) }));
    const closed = inactiveFolders.map(folder => ({
        label: folder.title,
        icon: folder.icon,
        action: () => onCreate(folder)
    }));
    return open.length && closed.length ? [...open, 'separator', ...closed] : [...open, ...closed];
}
