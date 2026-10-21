import type { LegacyDocument, LegacyRuntime, PenilaianResult } from '../types';
import type { jsPDF } from 'jspdf';
export function initializeForm(document: LegacyDocument, Pdf: typeof jsPDF, restoreIdentity: () => void, deliverResult: (result: PenilaianResult) => Promise<void>): LegacyRuntime;
