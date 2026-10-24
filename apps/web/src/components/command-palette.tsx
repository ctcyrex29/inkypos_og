import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Dialog, DialogContent } from './ui/dialog';
import { Input } from './ui/input';
import { cn } from '@/lib/utils';

interface Command {
  id: string;
  label: string;
  description?: string;
  action: () => void;
}

interface CommandPaletteProps {
  commands: Command[];
}

export function CommandPalette({ commands }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Listen for Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
        setSearch('');
      }
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const filtered = search
    ? commands.filter((cmd) => cmd.label.toLowerCase().includes(search.toLowerCase()) || cmd.description?.toLowerCase().includes(search.toLowerCase()))
    : commands;

  const handleSelect = (command: Command) => {
    command.action();
    setOpen(false);
    setSearch('');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Search commands..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="max-h-72 space-y-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No commands found
              </div>
            ) : (
              filtered.map((cmd) => (
                <button
                  key={cmd.id}
                  onClick={() => handleSelect(cmd)}
                  className={cn(
                    'w-full rounded-md px-3 py-2 text-left text-sm transition-colors',
                    'hover:bg-accent hover:text-accent-foreground',
                    'focus:outline-none focus:bg-accent focus:text-accent-foreground'
                  )}
                >
                  <div className="font-medium">{cmd.label}</div>
                  {cmd.description && <div className="text-xs text-muted-foreground">{cmd.description}</div>}
                </button>
              ))
            )}
          </div>

          <div className="border-t pt-2 text-xs text-muted-foreground">
            <div>
              <kbd className="rounded bg-muted px-2 py-1">Ctrl</kbd>
              <kbd className="ml-1 rounded bg-muted px-2 py-1">K</kbd> to open
            </div>
            <div className="mt-1">
              <kbd className="rounded bg-muted px-2 py-1">Esc</kbd> to close
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
