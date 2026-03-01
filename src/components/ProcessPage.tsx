import { useState, useCallback } from 'react';
import Papa from 'papaparse';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type { ParsedFile, LocationConfig, ProcessingResult, ExportType } from '@/core/types';
import { detectExportType, getReidenMapColumns, ALL_SCHEMAS } from '@/core/schemas';
import { processFiles } from '@/core/processor';
import FileDropZone from './FileDropZone';

type Step = 'drop' | 'processing' | 'results';

interface ProcessPageProps {
  location: LocationConfig;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getExportDisplayName(exportType: ExportType | null): string {
  if (!exportType) return 'Unknown';
  const schema = ALL_SCHEMAS.find((s) => s.exportType === exportType);
  return schema?.displayName ?? exportType;
}

// --- Step 1: File Drop ---

function FileDropStep({
  files,
  onFilesAdded,
  onRemoveFile,
  onProcess,
}: {
  files: ParsedFile[];
  onFilesAdded: (newFiles: File[]) => void;
  onRemoveFile: (index: number) => void;
  onProcess: () => void;
}) {
  const recognizedCount = files.filter((f) => f.exportType !== null).length;

  return (
    <div className="space-y-6">
      <FileDropZone onFilesAdded={onFilesAdded} />

      {files.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4 py-3">
            <h3 className="text-sm font-medium text-gray-700">
              Files ({files.length})
            </h3>
          </div>
          <ul className="divide-y divide-gray-100">
            {files.map((pf, i) => (
              <li key={i} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="truncate text-sm font-medium text-gray-900">
                    {pf.filename}
                  </span>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${
                      pf.exportType
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {getExportDisplayName(pf.exportType)}
                  </span>
                  <span className="shrink-0 text-xs text-gray-400">
                    {pf.rowCount} rows &middot; {formatBytes(pf.file.size)}
                  </span>
                </div>
                <button
                  onClick={() => onRemoveFile(i)}
                  className="shrink-0 ml-2 rounded px-2 py-1 text-xs text-gray-400 hover:bg-red-50 hover:text-red-600"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={onProcess}
          disabled={recognizedCount === 0}
          className="rounded bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Process Files
        </button>
      </div>
    </div>
  );
}

// --- Step 2: Processing ---

function ProcessingStep({
  currentFile,
  currentIndex,
  totalFiles,
}: {
  currentFile: string;
  currentIndex: number;
  totalFiles: number;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
      <p className="text-sm text-gray-700">
        Processing <span className="font-medium">{currentFile}</span>...
      </p>
      <p className="mt-1 text-xs text-gray-400">
        {currentIndex} of {totalFiles}
      </p>
    </div>
  );
}

// --- Step 3: Results ---

function ResultsStep({
  result,
  onDownload,
  onReset,
}: {
  result: ProcessingResult;
  onDownload: () => void;
  onReset: () => void;
}) {
  const { stats, reidenMap, warnings } = result;
  const previewRows = reidenMap.slice(0, 5);
  const previewCols = getReidenMapColumns().slice(0, 6);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Files Processed" value={stats.filesProcessed} />
        <StatCard label="Total Records" value={stats.totalRecords} />
        <StatCard label="Unique Patients" value={stats.uniquePatients} />
        <StatCard label="Enriched from Other" value={stats.enrichedFromOtherFiles} />
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <h4 className="text-sm font-medium text-yellow-800 mb-1">Warnings</h4>
          <ul className="space-y-1">
            {warnings.map((w, i) => (
              <li key={i} className="text-xs text-yellow-700">{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Reiden map preview */}
      {previewRows.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4 py-3">
            <h3 className="text-sm font-medium text-gray-700">
              Re-identification Map Preview ({reidenMap.length} entries)
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {previewCols.map((col) => (
                    <th key={col} className="px-3 py-2 text-left font-medium text-gray-500">
                      {col}
                    </th>
                  ))}
                  {previewCols.length < getReidenMapColumns().length && (
                    <th className="px-3 py-2 text-left font-medium text-gray-400">...</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {previewRows.map((row, i) => (
                  <tr key={i}>
                    {previewCols.map((col) => (
                      <td key={col} className="px-3 py-2 text-gray-700 truncate max-w-[160px]">
                        {row[col] ?? ''}
                      </td>
                    ))}
                    {previewCols.length < getReidenMapColumns().length && (
                      <td className="px-3 py-2 text-gray-400">...</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={onDownload}
          className="rounded bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Download Results (ZIP)
        </button>
        <button
          onClick={onReset}
          className="rounded border border-gray-300 px-5 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          Process More Files
        </button>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
      <p className="text-2xl font-semibold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

// --- Main Component ---

export default function ProcessPage({ location }: ProcessPageProps) {
  const [step, setStep] = useState<Step>('drop');
  const [parsedFiles, setParsedFiles] = useState<ParsedFile[]>([]);
  const [result, setResult] = useState<ProcessingResult | null>(null);
  const [processingFile, setProcessingFile] = useState('');
  const [processingIndex, setProcessingIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleFilesAdded = useCallback((newFiles: File[]) => {
    for (const file of newFiles) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
        complete: (results) => {
          const rows = results.data as Record<string, string>[];
          const headers = results.meta.fields ?? [];
          const parsed: ParsedFile = {
            file,
            filename: file.name,
            exportType: detectExportType(file.name),
            headers,
            rows,
            rowCount: rows.length,
          };
          setParsedFiles((prev) => [...prev, parsed]);
        },
      });
    }
  }, []);

  const handleRemoveFile = useCallback((index: number) => {
    setParsedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleProcess = useCallback(async () => {
    const recognized = parsedFiles.filter((f) => f.exportType !== null);
    if (recognized.length === 0) return;

    setStep('processing');
    setError(null);
    setProcessingIndex(1);
    setProcessingFile(recognized[0]?.filename ?? '');

    try {
      const processingResult = await processFiles(parsedFiles, location);
      setResult(processingResult);
      setStep('results');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Processing failed. Check your files and try again.');
      setStep('drop');
    }
  }, [parsedFiles, location]);

  const handleDownload = useCallback(async () => {
    if (!result) return;

    const zip = new JSZip();

    // Add deidentified CSV files
    for (const processed of result.files) {
      if (processed.deidentifiedRows.length > 0) {
        const csv = Papa.unparse(processed.deidentifiedRows);
        const filename = processed.originalFilename.replace(
          /\.csv$/i,
          '_deidentified.csv',
        );
        zip.file(filename, csv);
      }
    }

    // Add reiden map
    if (result.reidenMap.length > 0) {
      const columns = getReidenMapColumns();
      const orderedRows = result.reidenMap.map((entry) => {
        const row: Record<string, string> = {};
        for (const col of columns) {
          row[col] = entry[col] ?? '';
        }
        return row;
      });
      const reidenCsv = Papa.unparse(orderedRows, { columns });
      zip.file('reiden-map.csv', reidenCsv);
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    saveAs(blob, `deidentified_${new Date().toISOString().slice(0, 10)}.zip`);
  }, [result]);

  const handleReset = useCallback(() => {
    setParsedFiles([]);
    setResult(null);
    setStep('drop');
  }, []);

  return (
    <div>
      {step === 'drop' && (
        <>
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
          <FileDropStep
            files={parsedFiles}
            onFilesAdded={handleFilesAdded}
            onRemoveFile={handleRemoveFile}
            onProcess={handleProcess}
          />
        </>
      )}
      {step === 'processing' && (
        <ProcessingStep
          currentFile={processingFile}
          currentIndex={processingIndex}
          totalFiles={parsedFiles.filter((f) => f.exportType !== null).length}
        />
      )}
      {step === 'results' && result && (
        <ResultsStep result={result} onDownload={handleDownload} onReset={handleReset} />
      )}
    </div>
  );
}
