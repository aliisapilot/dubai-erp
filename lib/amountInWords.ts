// Utility for converting numbers to English and Arabic currency words (AED / Fils)

const ONES_EN = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen"
];

const TENS_EN = [
  "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"
];

const SCALES_EN = ["", "Thousand", "Million", "Billion"];

function convertUnder100(num: number): string {
  if (num === 0) return "";
  if (num < 20) return ONES_EN[num];
  const tens = TENS_EN[Math.floor(num / 10)];
  const rem = num % 10;
  return rem > 0 ? `${tens}-${ONES_EN[rem]}` : tens;
}

function convertChunkEn(num: number): string {
  let str = "";
  if (num >= 100) {
    str += ONES_EN[Math.floor(num / 100)] + " Hundred";
    num %= 100;
    if (num > 0) {
      str += " " + convertUnder100(num);
    }
  } else if (num > 0) {
    str += convertUnder100(num);
  }
  return str.trim();
}

export function numberToWordsEnglish(amount: number): string {
  if (isNaN(amount) || amount === 0) return "Zero Dirhams Only";

  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);
  const dirhams = Math.floor(absAmount);
  const fils = Math.round((absAmount - dirhams) * 100);

  let dirhamWords = "";
  if (dirhams === 0) {
    dirhamWords = "Zero";
  } else {
    let temp = dirhams;
    let scaleIndex = 0;
    const parts: string[] = [];

    while (temp > 0) {
      const chunk = temp % 1000;
      if (chunk !== 0) {
        const chunkStr = convertChunkEn(chunk);
        const scale = SCALES_EN[scaleIndex];
        parts.unshift(scale ? `${chunkStr} ${scale}` : chunkStr);
      }
      temp = Math.floor(temp / 1000);
      scaleIndex++;
    }
    dirhamWords = parts.join(" ");
  }

  let result = (isNegative ? "Minus " : "") + dirhamWords + (dirhams === 1 ? " Dirham" : " Dirhams");

  if (fils > 0) {
    const filsWord = convertUnder100(fils);
    result += ` and ${filsWord} Fils`;
  }

  return result.trim() + " Only";
}

// Arabic words converter
const ONES_AR = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة", "عشرة"];
const TEENS_AR = ["عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
const TENS_AR = ["", "عشرة", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
const HUNDREDS_AR = ["", "مائة", "مئتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];

function convertChunkAr(num: number): string {
  if (num === 0) return "";
  const parts: string[] = [];

  const hundreds = Math.floor(num / 100);
  const rem = num % 100;

  if (hundreds > 0) {
    parts.push(HUNDREDS_AR[hundreds]);
  }

  if (rem > 0) {
    if (rem <= 10) {
      parts.push(ONES_AR[rem]);
    } else if (rem < 20) {
      parts.push(TEENS_AR[rem - 10]);
    } else {
      const tens = Math.floor(rem / 10);
      const ones = rem % 10;
      if (ones > 0) {
        parts.push(`${ONES_AR[ones]} و${TENS_AR[tens]}`);
      } else {
        parts.push(TENS_AR[tens]);
      }
    }
  }

  return parts.join(" و ");
}

export function numberToWordsArabic(amount: number): string {
  if (isNaN(amount) || amount === 0) return "صفر درهم فقط لا غير";

  const absAmount = Math.abs(amount);
  const dirhams = Math.floor(absAmount);
  const fils = Math.round((absAmount - dirhams) * 100);

  const parts: string[] = [];

  const millions = Math.floor(dirhams / 1000000);
  const thousands = Math.floor((dirhams % 1000000) / 1000);
  const remaining = dirhams % 1000;

  if (millions > 0) {
    if (millions === 1) parts.push("مليون");
    else if (millions === 2) parts.push("مليونان");
    else parts.push(`${convertChunkAr(millions)} مليون`);
  }

  if (thousands > 0) {
    if (thousands === 1) parts.push("ألف");
    else if (thousands === 2) parts.push("ألفان");
    else if (thousands >= 3 && thousands <= 10) parts.push(`${convertChunkAr(thousands)} آلاف`);
    else parts.push(`${convertChunkAr(thousands)} ألف`);
  }

  if (remaining > 0) {
    parts.push(convertChunkAr(remaining));
  }

  let result = "فقط " + parts.join(" و ") + " درهم إماراتي";

  if (fils > 0) {
    result += ` و ${convertChunkAr(fils)} فلساً`;
  }

  return result + " لا\u00A0غير";
}

