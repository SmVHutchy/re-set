// Minimaler Pub/Sub-Toaster — kein Context-Threading nötig.
type Listener = (msg: string) => void;

const listeners = new Set<Listener>();

export function toast(msg: string): void {
  for (const l of listeners) l(msg);
}

export function onToast(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
