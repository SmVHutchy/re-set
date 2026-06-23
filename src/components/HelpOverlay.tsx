const ROWS: [string, string][] = [
  ["⌘Z / ⌘⇧Z", "Rückgängig / Wiederholen"],
  ["1 – 4", "Phase setzen (pre / mid / peak / late)"],
  ["0", "Phase entfernen"],
  ["+", "Ausgewählten Track ins Set"],
  ["Leertaste", "Ausgewählten Track vorhören"],
  ["/", "Suche fokussieren"],
  ["?", "Diese Hilfe ein/aus"],
];

export function HelpOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      className="flex items-center justify-center p-4"
      style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,0.55)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-lg border border-line bg-surface p-5"
      >
        <h2 className="mb-3 text-[15px] font-medium text-ink">Tastatur-Shortcuts</h2>
        <table className="w-full">
          <tbody>
            {ROWS.map(([k, d]) => (
              <tr key={k}>
                <td className="py-1 pr-4 align-top">
                  <kbd className="rounded border border-line bg-raise px-1.5 py-0.5 font-mono text-[11px] text-ink-soft">
                    {k}
                  </kbd>
                </td>
                <td className="py-1 text-[13px] text-ink-soft">{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-[11px] text-ink-faint">
          Shortcuts gelten, wenn der Fokus nicht in einem Eingabefeld liegt.
        </p>
      </div>
    </div>
  );
}
