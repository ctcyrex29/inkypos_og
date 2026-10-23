import { Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useBusinessSession } from '@/auth/session';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { downloadCsv, downloadPdf, slug, type ExportDocument } from '@/lib/export';

/**
 * "Export" button with CSV and PDF. `build` turns what is on screen into a
 * document; it returns null while data is still loading.
 */
export function ExportMenu({ name, build }: { name: string; build: (business: string) => Omit<ExportDocument, 'business' | 'filename'> | null }) {
  const session = useBusinessSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const doc = (): ExportDocument | null => {
    const d = build(session.businessName);
    if (!d) return null;
    const period = d.period ? `-${d.period.replace(/ to /, '_').replace(/[^0-9_-]/g, '')}` : '';
    return { ...d, business: session.businessName, filename: `inkypos-${slug(session.businessName)}-${slug(name)}${period}` };
  };
  const ready = build(session.businessName) !== null;

  return (
    <div className="flex items-center gap-2">
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" disabled={!ready || busy} aria-label={`Export ${name}`}>
            {busy ? <Loader2 className="animate-spin" /> : <Download />} Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => {
              const d = doc();
              if (d) downloadCsv(d);
            }}
          >
            <FileSpreadsheet /> CSV (Excel)
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={async () => {
              const d = doc();
              if (!d) return;
              setBusy(true);
              setError(null);
              try {
                await downloadPdf(d);
              } catch {
                setError('Could not make the PDF. Check your connection and try again.');
              } finally {
                setBusy(false);
              }
            }}
          >
            <FileText /> PDF
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
