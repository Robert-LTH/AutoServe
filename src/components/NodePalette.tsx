import type { DragEvent } from 'react';

interface PaletteItem {
  type: 'form-step' | 'decision-step';
  title: string;
  description: string;
}

const items: PaletteItem[] = [
  {
    type: 'form-step',
    title: 'Formulärsteg',
    description: 'Samla in information från användaren.',
  },
  {
    type: 'decision-step',
    title: 'Beslutssteg',
    description: 'Grenar baserat på användarens val.',
  },
];

export default function NodePalette() {
  const onDragStart = (event: DragEvent<HTMLDivElement>, nodeType: PaletteItem['type']) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <aside className="palette">
      <h2>Byggstenar</h2>
      {items.map((item) => (
        <div
          key={item.type}
          className="palette-item"
          onDragStart={(event) => onDragStart(event, item.type)}
          draggable
        >
          <strong>{item.title}</strong>
          <span>{item.description}</span>
        </div>
      ))}
      <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.75rem' }}>
        Dra en komponent och släpp den i arbetsytan för att skapa nya steg.
      </p>
    </aside>
  );
}
