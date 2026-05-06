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

      canvas.width = img.width;
      canvas.height = img.height;

      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(
        0,
        0,
        canvas.width,
        canvas.height
      );

      const data = imageData.data;

      // grayscale + contrast enhancement
      for (let i = 0; i < data.length; i += 4) {
        const avg =
          (data[i] + data[i + 1] + data[i + 2]) / 3;

        const enhanced = avg > 135 ? 255 : 0;

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
  const processedImage = await preprocessImage(
    imageBase64
  );

  const {
    data: { text }
  } = await Tesseract.recognize(
    `data:image/jpeg;base64,${processedImage}`,
    'eng',
    {
      logger: (m) => console.log(m)
    }
  );

  console.log('OCR RESULT:', text);

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

const findMedicineName = (
  text: string
): string => {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const cleaned = lines
    .map((line) =>
      line.replace(/[^a-zA-Z0-9\s]/g, '')
    )
    .filter((line) => line.length > 3);

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
    'batch'
  ];

  const candidates = cleaned.filter((line) => {
    const lower = line.toLowerCase();

    return !ignoreWords.some((word) =>
      lower.includes(word)
    );
  });

  // prioritize medicine-style names
  const medicineLine = candidates.find(
    (line) =>
      /[A-Za-z]+\s?\d+/.test(line)
  );

  if (medicineLine) {
    return medicineLine;
  }

  // fallback to uppercase-heavy lines
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

  console.log('FINAL OCR TEXT:', text);

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
  const prescriptionText = (
    await extractText(prescriptionBase64)
  ).toLowerCase();

  const medicineText = (
    await extractText(medicineBase64)
  ).toLowerCase();

  const prescriptionMedicine =
    findMedicineName(prescriptionText);

  const actualMedicine =
    findMedicineName(medicineText);

  const prescriptionWord =
    prescriptionMedicine
      .split(' ')[0]
      .toLowerCase();

  const isMatch =
    medicineText.includes(
      prescriptionWord
    );

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
