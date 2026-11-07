// A shared room (the Stable waiting area) holds several patients at once.
// Normal rooms have a capacity of 1 (or none recorded).
export const isShared = (room) => (room?.capacity || 1) > 1;
