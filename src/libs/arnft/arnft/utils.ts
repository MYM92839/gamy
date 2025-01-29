export function isMobile() {
  return /Android|mobile|iPad|iPhone/i.test(navigator.userAgent);
}

export const setMatrix = function (matrix: any, value: any) {
  const array: any = [];
  for (const key in value) {
    array[key] = value[key];
  }
  if (typeof matrix.elements.set === 'function') {
    matrix.elements.set(array);
  } else {
    matrix.elements = [].slice.call(array);
  }
};
