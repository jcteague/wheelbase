import type { JSX } from 'preact';
import { PositionCard } from '../components/PositionCard';
import { usePositions } from '../hooks/usePositions';

export function PositionsListPage(): JSX.Element {
  const { data, isLoading, isError } = usePositions();

  if (isLoading) {
    return <p>Loading...</p>;
  }

  if (isError) {
    return <p>Failed to load positions.</p>;
  }

  if (!data || data.length === 0) {
    return (
      <div>
        <p>No positions yet</p>
        <a href="/">Open your first wheel</a>
      </div>
    );
  }

  return (
    <div>
      {data.map((item) => (
        <PositionCard key={item.id} item={item} />
      ))}
    </div>
  );
}
