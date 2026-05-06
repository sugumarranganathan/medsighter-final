import Tesseract from 'tesseract.js';

export interface ExpiryResult {
  medicineName: string;
  expiryDate: string;
  isExpired: boolean;
  message: string;
}

export interface VerificationResult {
  prescriptionMedicine: string;
  actualMedicine: string;
  isMatch: boolean;
  discrepancies?: string;
  dosageMatch: boolean;
  instructions: string;
}

const MEDICINE_KEYWORDS = [
  'gudcef',
  'dolo',
  'paracetamol',
  'azithromycin',
  'cetirizine',
  'amoxicillin',
  'cefpodoxime',
  'augmentin',
  'crocin',
  'sinarest',
  'calpol',
  'atorvastatin',
  'metformin',
  'pantoprazole'
];

const preprocessImage = async (
  imageBase64: string
): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();

    img.src = `data:image/jpeg;base64,${imageBase64}`;

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        resolve(imageBase64);
        return;
      }

      // Bigger image for OCR accuracy
      canvas.width = img.width * 3;
      canvas.height = img.height * 3;

      ctx.drawImage(
        img,
        0,
        0,
        canvas.width,
        canvas.height
      );

      const imageData = ctx.getImageData(
        0,
        0,
        canvas.width,
        canvas.height
      );

      const data = imageData.data;

      // grayscale + contrast enhancement
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        const gray =
          0.299 * r +
          0.587 * g +
          0.114 * b;

        const contrast =
          gray > 145 ? 255 : 0;

        data[i] = contrast;
        data[i + 1] = contrast;
        data[i + 2] = contrast;
      }

      ctx.putImageData(imageData, 0, 0);

      const processed = canvas
        .toDataURL('image/jpeg', 1.0)
        .split(',')[1];

      resolve(processed);
    };
  });
};

const extractText = async (
  imageBase64: string
): Promise<string> => {
  const processedImage =
    await preprocessImage(imageBase64);

  const {
    data: { text }
  } = await Tesseract.recognize(
    `data:image/jpeg;base64,${processedImage}`,
    'eng',
    {
      logger: (m) => console.log(m)
    }
  );

  console.log('OCR TEXT:', text);

  return text || '';
};

const findExpiryDate = (
  text: string
): string => {
  const patterns = [
    /EXP\s*[:\-]?\s*(\d{2}[\/\-]\d{4})/i,
    /EXPIRY\s*[:\-]?\s*(\d{2}[\/\-]\d{4})/i,
    /USE BEFORE\s*[:\-]?\s*(\d{2}[\/\-]\d{4})/i,
    /(\d{2}[\/\-]\d{4})/,
    /(\d{2}[\/\-]\d{2})/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match) {
      return match[1];
    }
  }

  return 'Not Found';
};

const checkExpired = (
  expiry: string
): boolean => {
  if (expiry === 'Not Found') return false;

  const clean = expiry.replace('-', '/');

  const parts = clean.split('/');

  if (parts.length !== 2) return false;

  let month = parseInt(parts[0]);
  let year = parseInt(parts[1]);

  if (year < 100) {
    year += 2000;
  }

  const expiryDate = new Date(year, month);

  return new Date() > expiryDate;
};

const cleanLine = (
  line: string
): string => {
  return line
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

const scoreMedicineLine = (
  line: string
): number => {
  let score = 0;

  const lower = line.toLowerCase();

  // keyword bonus
  for (const keyword of MEDICINE_KEYWORDS) {
    if (lower.includes(keyword)) {
      score += 100;
    }
  }

  // uppercase bonus
  const upperCount =
    line.replace(/[^A-Z]/g, '').length;

  score += upperCount * 2;

  // medicine-number pattern
  if (/[A-Za-z]+\s?\d{2,4}/.test(line)) {
    score += 50;
  }

  // preferred length
  if (line.length > 5 && line.length < 25) {
    score += 20;
  }

  // remove noisy prefixes
  if (
    lower.startsWith('tab') ||
    lower.startsWith('somm') ||
    lower.startsWith('crs')
  ) {
    score -= 30;
  }

  return score;
};

const normalizeMedicineName = (
  line: string
): string => {
  let cleaned = line;

  cleaned = cleaned.replace(
    /\b(TAB|SOMM|CRS|TABLET)\b/gi,
    ''
  );

  cleaned = cleaned.replace(
    /\s+/g,
    ' '
  );

  cleaned = cleaned.trim();

  return cleaned.toUpperCase();
};

const findMedicineName = (
  text: string
): string => {
  const lines = text
    .split('\n')
    .map((line) => cleanLine(line))
    .filter(Boolean);

  const ignoreWords = [
    'schedule',
    'prescription',
    'marketed',
    'manufactured',
    'warning',
    'tablet contains',
    'equivalent',
    'alkem',
    'contains',
    'dosage',
    'batch',
    'ph date',
    'mrp',
    'tablets ip',
    'retail',
    'caution'
  ];

  const candidates = lines.filter(
    (line) => {
      const lower = line.toLowerCase();

      return (
        line.length > 3 &&
        !ignoreWords.some((word) =>
          lower.includes(word)
        )
      );
    }
  );

  if (candidates.length === 0) {
    return 'Medicine Not Detected';
  }

  // score every candidate
  const scored = candidates.map(
    (line) => ({
      line,
      score: scoreMedicineLine(line)
    })
  );

  scored.sort(
    (a, b) => b.score - a.score
  );

  const bestMatch = scored[0].line;

  return normalizeMedicineName(bestMatch);
};

export const analyzeExpiry = async (
  imageBase64: string
): Promise<ExpiryResult> => {
  const text = await extractText(
    imageBase64
  );

  console.log(
    'FINAL OCR TEXT:',
    text
  );

  const medicineName =
    findMedicineName(text);

  const expiryDate =
    findExpiryDate(text);

  const isExpired =
    checkExpired(expiryDate);

  return {
    medicineName,
    expiryDate,
    isExpired,
    message: isExpired
      ? `${medicineName} is expired. Expiry date is ${expiryDate}.`
      : `${medicineName} is safe to use. Expiry date is ${expiryDate}.`
  };
};

export const verifyPrescription = async (
  prescriptionBase64: string,
  medicineBase64: string
): Promise<VerificationResult> => {
  const prescriptionText =
    await extractText(
      prescriptionBase64
    );

  const medicineText =
    await extractText(
      medicineBase64
    );

  const prescriptionMedicine =
    findMedicineName(
      prescriptionText
    );

  const actualMedicine =
    findMedicineName(
      medicineText
    );

  const prescriptionWords =
    prescriptionMedicine
      .toLowerCase()
      .split(' ');

  const medicineLower =
    actualMedicine.toLowerCase();

  const matchedWords =
    prescriptionWords.filter(
      (word) =>
        medicineLower.includes(word)
    );

  const isMatch =
    matchedWords.length >= 1;

  return {
    prescriptionMedicine,
    actualMedicine,
    isMatch,
    dosageMatch: isMatch,
    discrepancies: isMatch
      ? ''
      : 'Medicine does not match prescription',
    instructions: isMatch
      ? `Medicine matches prescription. Medicine detected: ${actualMedicine}`
      : `Medicine mismatch detected. Please check carefully.`
  };
};
