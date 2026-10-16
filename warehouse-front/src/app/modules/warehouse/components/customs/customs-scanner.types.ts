import { DocTask } from '../../models/doc-task.model';

export type ParsedScanRowStatus = 'ready' | 'pool' | 'readonly' | 'not_found';

export interface ParsedScanFieldChange {
  key: string;
  label: string;
  oldValue: any;
  newValue: any;
  isEditable: boolean;
}

export interface ParsedScanRow {
  rowIndex: number;
  unicCode: string;
  rawValues: Record<string, string>;
  status: ParsedScanRowStatus;
  statusMessage: string;
  matchedTask: DocTask | null;
  isFromPool: boolean;
  isReadOnly: boolean;
  changes: ParsedScanFieldChange[];
}

export interface ScanBatchSummary {
  totalRows: number;
  readyCount: number;
  poolCount: number;
  readOnlyCount: number;
  notFoundCount: number;
  rows: ParsedScanRow[];
  detectedRowSeparator: string;
  detectedColSeparator: string;
  headers: string[];
}
