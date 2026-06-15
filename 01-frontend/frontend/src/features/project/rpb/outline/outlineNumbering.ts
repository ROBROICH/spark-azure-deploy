const toUpperLetter = (index: number): string => {
  return String.fromCharCode(65 + index);
};

const ROMAN_NUMERALS: [number, string][] = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

const toRoman = (index: number): string => {
  const num = index + 1;

  let result = '';
  let remaining = num;

  for (const [value, symbol] of ROMAN_NUMERALS) {
    while (remaining >= value) {
      result += symbol;
      remaining -= value;
    }
  }

  return result;
};

const toArabic = (index: number): string => {
  return String(index + 1);
};

const toArabicPath = (indexPath: number[]): string => {
  return indexPath.map(toArabic).join('.');
};

const formatNodeNumber = (depth: number, indexPath: number[]): string => {
  const currentIndex = indexPath[depth] ?? 0;

  if (depth === 0) {
    return toUpperLetter(currentIndex);
  }

  if (depth === 1) {
    return toRoman(currentIndex);
  }

  return toArabicPath(indexPath.slice(2, depth + 1));
};

export { formatNodeNumber, toRoman };
