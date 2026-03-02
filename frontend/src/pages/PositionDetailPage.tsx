import type { JSX } from 'preact';
import { useParams } from 'wouter';

export function PositionDetailPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  return (
    <main>
      <h1>Position {id}</h1>
      <p>Position detail — coming soon.</p>
    </main>
  );
}
