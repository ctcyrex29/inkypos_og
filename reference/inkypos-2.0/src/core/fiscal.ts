/**
 * InkyPOS 2.0 — Fiscalisation Architecture (Provider-Neutral)
 * Prepares the system for fiscal integration (e.g. ZIMRA FDMS / Virtual Fiscal Device)
 * while keeping all production endpoints strictly inactive until authorized compliance verification.
 */

import { SaleTransaction } from './types.ts';

export type FiscalEngineMode = 
  | 'INACTIVE_PENDING_VERIFICATION' // Default: strictly inactive until verified
  | 'STAGING_SIMULATION'            // Safe sandbox stub for UI & offline receipt layout
  | 'PRODUCTION_ACTIVE';            // Live compliance route

export interface FiscalReceiptMetadata {
  fiscalDayNo: number;
  fiscalReceiptNo: number;
  deviceSerialNumber: string;
  taxpayerIdentificationNo: string;
  qrCodeData: string;
  fiscalSignature: string;
  verificationUrl?: string;
  timestamp: string;
}

export interface IFiscalAdapter {
  id: string;
  name: string;
  mode: FiscalEngineMode;
  isEnabled(): boolean;
  verifyReadiness(): Promise<{ ready: boolean; reason: string }>;
  processSale(sale: SaleTransaction): Promise<{
    success: boolean;
    metadata?: FiscalReceiptMetadata;
    error?: string;
  }>;
  closeFiscalDay(dayNumber: number): Promise<{ success: boolean; zReportNumber?: string }>;
}

/**
 * Provider-Neutral Inactive Fiscal Adapter
 * By default, this adapter ensures that InkyPOS does NOT generate fake compliance
 * certificates or unauthorized endpoints while still providing a predictable interface.
 */
export class NeutralFiscalAdapter implements IFiscalAdapter {
  id = 'zimra-fdms-neutral';
  name = 'Zimbabwe ZIMRA FDMS Neutral Adapter';
  mode: FiscalEngineMode = 'INACTIVE_PENDING_VERIFICATION';

  private fiscalDayCounter = 1;
  private receiptCounter = 1;

  constructor(mode: FiscalEngineMode = 'INACTIVE_PENDING_VERIFICATION') {
    this.mode = mode;
  }

  isEnabled(): boolean {
    return this.mode !== 'INACTIVE_PENDING_VERIFICATION';
  }

  async verifyReadiness(): Promise<{ ready: boolean; reason: string }> {
    if (this.mode === 'INACTIVE_PENDING_VERIFICATION') {
      return {
        ready: false,
        reason:
          'Fiscalisation adapter is INACTIVE. Production integration requires official ZIMRA FDMS device certificate enrollment and authorized regulatory verification.',
      };
    }
    return {
      ready: true,
      reason: 'Fiscal adapter operating in Staging Simulation mode.',
    };
  }

  async processSale(sale: SaleTransaction): Promise<{
    success: boolean;
    metadata?: FiscalReceiptMetadata;
    error?: string;
  }> {
    if (this.mode === 'INACTIVE_PENDING_VERIFICATION') {
      return {
        success: false,
        error: 'Fiscalisation is inactive pending regulatory verification.',
      };
    }

    // Staging simulation payload
    const receiptNo = this.receiptCounter++;
    const qrData = `VERIFY:ZIMRA-STAGING:${sale.tenantId}:${receiptNo}:${sale.totalUSD}:USD`;
    const signature = `SIG-${Math.random().toString(36).substring(2, 10).toUpperCase()}-${Date.now()}`;

    return {
      success: true,
      metadata: {
        fiscalDayNo: this.fiscalDayCounter,
        fiscalReceiptNo: receiptNo,
        deviceSerialNumber: 'VFD-TEST-00892',
        taxpayerIdentificationNo: 'TIN-100234567-ZW',
        qrCodeData: qrData,
        fiscalSignature: signature,
        verificationUrl: `https://staging-fiscal.zimra.gov.zw/verify?ref=${signature}`,
        timestamp: new Date().toISOString(),
      },
    };
  }

  async closeFiscalDay(dayNumber: number): Promise<{ success: boolean; zReportNumber?: string }> {
    if (this.mode === 'INACTIVE_PENDING_VERIFICATION') {
      return {
        success: false,
      };
    }
    this.fiscalDayCounter++;
    return {
      success: true,
      zReportNumber: `Z-REP-${dayNumber}-${Date.now()}`,
    };
  }
}
