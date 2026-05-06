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

      // upscale image for better OCR
      canvas.width = img.width * 2;
      canvas.height = img.height * 2;

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

      // grayscale + adaptive threshold
      for (let i = 0; i < data.length; i += 4) {
        const avg =
          (data[i] + data[i + 1] + data[i + 2]) / 3;

        const enhanced = avg > 150 ? 255 : 0;

        data[i] = enhanced;
        data[i + 1] = enhanced;
        data[i + 2] = enhanced;
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

const cleanLine = (line: string): string => {
  return line
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
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
    'tablets ip'
  ];

  const candidates = lines.filter((line) => {
    const lower = line.toLowerCase();

    return (
      line.length > 3 &&
      !ignoreWords.some((word) =>
        lower.includes(word)
      )
    );
  });

  // highest priority → known medicine keywords
  for (const line of candidates) {
    const lower = line.toLowerCase();

    for (const keyword of MEDICINE_KEYWORDS) {
      if (lower.includes(keyword)) {
        return line;
      }
    }
  }

  // second priority → medicine pattern
  const medicinePattern = candidates.find(
    (line) =>
      /^[A-Za-z]+\s?\d{2,4}$/i.test(line)
  );

  if (medicinePattern) {
    return medicinePattern;
  }

  // third priority → uppercase dominant
  const upperCaseLine = candidates.find(
    (line) => {
      const upperCount =
        line.replace(/[^A-Z]/g, '').length;

      return upperCount > line.length / 2;
    }
  );

  if (upperCaseLine) {
    return upperCaseLine;
  }

  return candidates[0] || 'Medicine Not Detected';
};

export const analyzeExpiry = async (
  imageBase64: string
): Promise<ExpiryResult> => {
  const text = await extractText(imageBase64);

  console.log('FINAL OCR:', text);

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
    await extractText(prescriptionBase64);

  const medicineText =
    await extractText(medicineBase64);

  const prescriptionMedicine =
    findMedicineName(prescriptionText);

  const actualMedicine =
    findMedicineName(medicineText);

  const prescriptionWords =
    prescriptionMedicine
      .toLowerCase()
      .split(' ');

  const medicineLower =
    actualMedicine.toLowerCase();

  const matchedWords =
    prescriptionWords.filter((word) =>
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
