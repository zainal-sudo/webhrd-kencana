const ANGKA_SATUAN = [
  "",
  "satu",
  "dua",
  "tiga",
  "empat",
  "lima",
  "enam",
  "tujuh",
  "delapan",
  "sembilan",
  "sepuluh",
  "sebelas",
];

const angkaKeKata = (value: number): string => {
  if (value < 12) return ANGKA_SATUAN[value];
  if (value < 20) return `${ANGKA_SATUAN[value - 10]} belas`;
  if (value < 100) {
    return `${angkaKeKata(Math.floor(value / 10))} puluh ${angkaKeKata(value % 10)}`.trim();
  }
  if (value < 200) return `seratus ${angkaKeKata(value - 100)}`.trim();
  if (value < 1000) {
    return `${angkaKeKata(Math.floor(value / 100))} ratus ${angkaKeKata(value % 100)}`.trim();
  }
  if (value < 2000) return `seribu ${angkaKeKata(value - 1000)}`.trim();
  if (value < 1_000_000) {
    return `${angkaKeKata(Math.floor(value / 1000))} ribu ${angkaKeKata(value % 1000)}`.trim();
  }
  if (value < 1_000_000_000) {
    return `${angkaKeKata(Math.floor(value / 1_000_000))} juta ${angkaKeKata(value % 1_000_000)}`.trim();
  }
  if (value < 1_000_000_000_000) {
    return `${angkaKeKata(Math.floor(value / 1_000_000_000))} miliar ${angkaKeKata(value % 1_000_000_000)}`.trim();
  }

  return `${angkaKeKata(Math.floor(value / 1_000_000_000_000))} triliun ${angkaKeKata(value % 1_000_000_000_000)}`.trim();
};

export const formatTerbilang = (value: number): string => {
  const numberValue = Number(value);
  const roundedValue = Number.isFinite(numberValue) ? Math.round(numberValue) : 0;
  const sign = roundedValue < 0 ? "minus " : "";
  const words = roundedValue === 0 ? "nol" : angkaKeKata(Math.abs(roundedValue));

  return `${sign}${words} rupiah`.replace(/\s+/g, " ").toUpperCase();
};

const toTitleCasePerKata = (text: string): string =>
  text
    .split(" ")
    .filter(Boolean)
    .map((kata) => kata.charAt(0).toUpperCase() + kata.slice(1).toLowerCase())
    .join(" ");

export const roundTHPGaji = (value: number): number => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue)
    ? Math.sign(numberValue) * Math.round(Math.abs(numberValue))
    : 0;
};

export const formatTerbilangGaji = (value: number): string => {
  const roundedValue = roundTHPGaji(value);
  const sign = roundedValue < 0 ? "Minus " : "";
  const words = roundedValue === 0 ? "nol" : angkaKeKata(Math.abs(roundedValue));

  return `${sign}${toTitleCasePerKata(`${words} rupiah`)}`;
};
