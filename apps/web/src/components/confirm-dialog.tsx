import { useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Alert, AlertDescription } from './ui/alert';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  destructive?: boolean;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
  isDanger?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  description,
  destructive = false,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  isDanger = false,
}: ConfirmDialogProps) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    try {
      setLoading(true);
      await onConfirm();
      onCancel();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className={isDanger ? 'text-destructive' : undefined}>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {destructive && (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertDescription>
              This action cannot be undone.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            {cancelText}
          </Button>
          <Button
            variant={isDanger ? 'destructive' : 'default'}
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? <Loader2 className="animate-spin" /> : null}
            {loading ? 'Confirming…' : confirmText}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Hook for managing confirm dialog state */

export function useConfirmDialog() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState<string>();
  const [destructive, setDestructive] = useState(false);
  const [isDanger, setIsDanger] = useState(false);
  const [confirmText, setConfirmText] = useState('Confirm');
  const [cancelText, setCancelText] = useState('Cancel');
  const [onConfirmCallback, setOnConfirmCallback] = useState<() => Promise<void> | void>(() => {});

  const confirm = (options: {
    title: string;
    description?: string;
    destructive?: boolean;
    isDanger?: boolean;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => Promise<void> | void;
  }) => {
    setTitle(options.title);
    setDescription(options.description);
    setDestructive(options.destructive ?? false);
    setIsDanger(options.isDanger ?? false);
    setConfirmText(options.confirmText ?? 'Confirm');
    setCancelText(options.cancelText ?? 'Cancel');
    setOnConfirmCallback(() => options.onConfirm);
    setOpen(true);
  };

  return {
    Dialog: () => (
      <ConfirmDialog
        open={open}
        title={title}
        description={description}
        destructive={destructive}
        isDanger={isDanger}
        confirmText={confirmText}
        cancelText={cancelText}
        onConfirm={onConfirmCallback}
        onCancel={() => setOpen(false)}
      />
    ),
    confirm,
  };
}
