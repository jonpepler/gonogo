export function handleMouseDown(e: React.MouseEvent) {
  e.stopPropagation(); // prevent RGL from starting a drag on the handle
}
