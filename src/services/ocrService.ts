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

const extractText = async (imageBase64: string) => {
  const { data } = await Tesseract.recognize(`data:image/jpeg;base64,${imageBase64}`, 'eng');
  return data.text || '';
};

const findExpiryDate = (text: string): string => {
  const patterns = [
    /(EXP|Expiry|Use Before)[:\s-]*(\d{2}[\/\-]\d{2,4})/i,
    /(\d{2}[\/\-]\d{4})/,
    /(\d{2}[\/\-]\d{2})/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[2] || match[1];
    }
  }

  return 'Not Found';
};

const checkExpired = (expiry: string): boolean => {
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

const findMedicineName = (text: string): string => {
  const lines = text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  return lines[0] || 'Medicine Not Detected';
};

export const analyzeExpiry = async (imageBase64: string): Promise<ExpiryResult> => {
  const text = await extractText(imageBase64);

  const medicineName = findMedicineName(text);
  const expiryDate = findExpiryDate(text);
  const isExpired = checkExpired(expiryDate);

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
  const prescriptionText = (await extractText(prescriptionBase64)).toLowerCase();
  const medicineText = (await extractText(medicineBase64)).toLowerCase();

  const prescriptionMedicine = findMedicineName(prescriptionText);
  const actualMedicine = findMedicineName(medicineText);

  const isMatch = medicineText.includes(prescriptionMedicine.split(' ')[0]);

  return {
    prescriptionMedicine,
    actualMedicine,
    isMatch,
    dosageMatch: isMatch,
    discrepancies: isMatch ? '' : 'Medicine does not match prescription',
    instructions: isMatch
      ? `Medicine matches prescription. Medicine detected: ${actualMedicine}`
      : `Medicine mismatch detected. Please check carefully.`
  };
};
